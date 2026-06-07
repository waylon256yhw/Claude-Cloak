import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config, ClaudeRequest } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { enhanceAnthropicRequest } from '../services/transform.js'
import { extractSessionId } from '../services/user.js'
import { pipeStream } from '../services/stream.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'
import { resolveUpstream, type UpstreamConfig } from '../services/upstream.js'

export async function proxyRoutes(fastify: FastifyInstance, config: Config) {
  fastify.post('/v1/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const upstream = resolveUpstream(request.apiKeyEntity, config)
    if (!upstream) {
      reply.code(503).send({ error: 'Service Unavailable', message: 'No upstream credential configured' })
      return
    }
    const anthropicRequest = request.body as ClaudeRequest
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
  const sessionId = body.metadata?.user_id ? (extractSessionId(body.metadata.user_id) ?? undefined) : undefined
  const headers = buildStealthHeaders(upstream.apiKey, isStream, body.model, sessionId, body)
  const controller = new AbortController()

  const cleanup = () => controller.abort()
  request.raw.on('close', cleanup)
  request.raw.on('aborted', cleanup)
  reply.raw.on('close', cleanup)

  const initialTimeout = setTimeout(() => controller.abort(), config.requestTimeout)

  try {
    const response = await proxyFetch(
      `${upstream.targetUrl}/v1/messages?beta=true`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      resolveProxyUrl(upstream.proxyUrl, config.outboundProxy)
    )

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
