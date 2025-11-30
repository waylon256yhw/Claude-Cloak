import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config, OpenAIChatRequest, ClaudeRequest } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { convertOpenAIToClaude, enhanceAnthropicRequest } from '../services/transform.js'
import { pipeStream } from '../services/stream.js'
import { credentialManager } from '../credentials/manager.js'

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
  fastify.post('/v1/chat/completions', async (request: FastifyRequest, reply: FastifyReply) => {
    const openaiRequest = request.body as OpenAIChatRequest
    const claudeRequest = convertOpenAIToClaude(openaiRequest)
    return proxyToClaude(config, claudeRequest, request, reply)
  })

  fastify.post('/v1/messages', async (request: FastifyRequest, reply: FastifyReply) => {
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

  request.raw.on('close', () => controller.abort())

  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout)

  try {
    const response = await fetch(`${upstream.targetUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('text/event-stream')) {
      return pipeStream(response, reply, controller.signal)
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
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      reply.code(504).send({ error: 'Gateway Timeout', message: 'Upstream request timed out' })
      return
    }
    throw err
  }
}
