import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config, ClaudeRequest } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { enhanceAnthropicRequest } from '../services/transform.js'
import { pipeStream } from '../services/stream.js'
import { credentialManager } from '../credentials/manager.js'
import { getProxyDispatcher, isProxyError, undiciFetch } from '../services/socks.js'
import { anthropicMessageSchema } from '../services/validation.js'

interface UpstreamConfig {
  targetUrl: string
  apiKey: string
}

function getUpstreamConfig(config: Config): UpstreamConfig {
  const active = credentialManager.getActive()
  if (active) {
    return { targetUrl: active.targetUrl, apiKey: active.apiKey }
  }
  if (config.targetUrl && config.apiKey) {
    return { targetUrl: config.targetUrl, apiKey: config.apiKey }
  }
  throw new Error('No upstream credential configured')
}

export async function proxyRoutes(fastify: FastifyInstance, config: Config) {
  // Only support Anthropic native format with request validation
  fastify.post('/v1/messages', anthropicMessageSchema, async (request: FastifyRequest, reply: FastifyReply) => {
    const anthropicRequest = request.body as ClaudeRequest
    const enhancedRequest = enhanceAnthropicRequest(anthropicRequest)
    return proxyToClaude(config, enhancedRequest, request, reply)
  })
}

async function proxyToClaude(
  config: Config,
  body: ClaudeRequest,
  request: FastifyRequest,
  reply: FastifyReply
) {
  let upstream: UpstreamConfig
  try {
    upstream = getUpstreamConfig(config)
  } catch (err) {
    reply.code(503).send({ error: 'Service Unavailable', message: (err as Error).message })
    return
  }

  const isStream = body.stream === true
  const headers = buildStealthHeaders(upstream.apiKey, isStream)
  const controller = new AbortController()

  // Listen to both request and response close events
  const cleanup = () => controller.abort()
  request.raw.on('close', cleanup)
  request.raw.on('aborted', cleanup)
  reply.raw.on('close', cleanup)

  // Initial timeout for connection
  const initialTimeout = setTimeout(() => controller.abort(), config.requestTimeout)

  try {
    const response = await undiciFetch(`${upstream.targetUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      dispatcher: getProxyDispatcher(),
    })

    clearTimeout(initialTimeout)

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      // Keep streaming timeout active during SSE
      const streamTimeout = setTimeout(() => controller.abort(), config.requestTimeout * 2)
      try {
        return await pipeStream(response as Parameters<typeof pipeStream>[0], reply, controller.signal)
      } finally {
        clearTimeout(streamTimeout)
        // Clean up listeners
        request.raw.off('close', cleanup)
        request.raw.off('aborted', cleanup)
        reply.raw.off('close', cleanup)
      }
    }

    const data = await response.text()

    let result: unknown
    try {
      result = JSON.parse(data)
    } catch {
      result = { raw: data }
    }

    reply.code(response.status).headers({
      'Content-Type': 'application/json',
      'X-Proxy-Status': response.status === 200 ? 'bypassed' : 'blocked',
      'X-Original-Status': String(response.status),
    })

    return result
  } catch (err) {
    clearTimeout(initialTimeout)
    const error = err as Error & { code?: string; cause?: { code?: string } }
    if (error.name === 'AbortError') {
      reply.code(504).send({ error: 'Gateway Timeout', message: 'Upstream request timed out' })
      return
    }
    if (isProxyError(error)) {
      request.log.error({ err: error }, 'WARP proxy connection failed')
      reply.code(502).send({ error: 'Bad Gateway', message: 'Proxy unavailable' })
      return
    }
    throw err
  } finally {
    // Clean up listeners for non-streaming case
    request.raw.off('close', cleanup)
    request.raw.off('aborted', cleanup)
    reply.raw.off('close', cleanup)
  }
}
