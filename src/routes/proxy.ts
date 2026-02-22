import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config, ClaudeRequest } from '../types.js'
import type { Credential } from '../credentials/types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { enhanceAnthropicRequest } from '../services/transform.js'
import { pipeStream } from '../services/stream.js'
import { credentialManager } from '../credentials/manager.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'

interface UpstreamConfig {
  targetUrl: string
  apiKey: string
  proxyUrl?: string | null
  credential?: Credential
}

function getUpstreamConfig(request: FastifyRequest, config: Config): UpstreamConfig {
  const apiKeyEntity = request.apiKeyEntity
  if (apiKeyEntity?.credentialId) {
    const cred = credentialManager.getById(apiKeyEntity.credentialId)
    if (cred?.enabled) {
      return { targetUrl: cred.targetUrl, apiKey: cred.apiKey, proxyUrl: cred.proxyUrl, credential: cred }
    }
  }
  if (config.targetUrl && config.apiKey) {
    return { targetUrl: config.targetUrl, apiKey: config.apiKey }
  }
  throw new Error('No upstream credential configured')
}

export async function proxyRoutes(fastify: FastifyInstance, config: Config) {
  fastify.post('/v1/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const anthropicRequest = request.body as ClaudeRequest
    let upstream: UpstreamConfig
    try {
      upstream = getUpstreamConfig(request, config)
    } catch (err) {
      reply.code(503).send({ error: 'Service Unavailable', message: (err as Error).message })
      return
    }
    const enhancedRequest = await enhanceAnthropicRequest(anthropicRequest, request.log, upstream.credential)
    return proxyToClaude(config, upstream, enhancedRequest, request, reply)
  })
}

async function proxyToClaude(
  config: Config,
  upstream: UpstreamConfig,
  body: ClaudeRequest,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const isStream = body.stream === true
  const headers = buildStealthHeaders(upstream.apiKey, isStream)
  const controller = new AbortController()

  const cleanup = () => controller.abort()
  request.raw.on('close', cleanup)
  request.raw.on('aborted', cleanup)
  reply.raw.on('close', cleanup)

  const initialTimeout = setTimeout(() => controller.abort(), config.requestTimeout)

  try {
    const response = await proxyFetch(`${upstream.targetUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    }, resolveProxyUrl(upstream.proxyUrl, config.outboundProxy))

    clearTimeout(initialTimeout)

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      const idleTimeout = config.requestTimeout * 2
      return await pipeStream(response as Parameters<typeof pipeStream>[0], reply, controller.signal, idleTimeout)
    }

    const data = Buffer.from(await response.arrayBuffer())

    reply.code(response.status).headers({
      'Content-Type': contentType || 'application/json',
      'X-Proxy-Status': response.status === 200 ? 'bypassed' : 'blocked',
      'X-Original-Status': String(response.status),
    })

    return reply.send(data)
  } catch (err) {
    clearTimeout(initialTimeout)
    const error = err as Error & { code?: string; cause?: { code?: string } }
    if (error.name === 'AbortError') {
      reply.code(504).send({ error: 'Gateway Timeout', message: 'Upstream request timed out' })
      return
    }
    throw err
  } finally {
    request.raw.off('close', cleanup)
    request.raw.off('aborted', cleanup)
    reply.raw.off('close', cleanup)
  }
}
