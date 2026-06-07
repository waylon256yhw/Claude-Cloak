import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Config } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { modelManager } from '../models/manager.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'
import { resolveUpstream } from '../services/upstream.js'

export async function modelsRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/v1/models', async (request: FastifyRequest, reply) => {
    const upstream = resolveUpstream(request.apiKeyEntity, config)
    if (!upstream) {
      return reply.send(modelManager.getFallbackResponse())
    }

    try {
      const response = await proxyFetch(`${upstream.targetUrl}/v1/models`, {
        method: 'GET',
        headers: buildStealthHeaders(upstream.apiKey),
      }, resolveProxyUrl(upstream.proxyUrl, config.outboundProxy))

      if (response.ok) {
        const data = await response.text()
        reply.headers({
          'Content-Type': response.headers.get('content-type') || 'application/json',
          'X-Proxy-Status': 'forwarded',
        })
        return reply.send(data)
      }
    } catch {
    }

    reply.headers({ 'X-Proxy-Status': 'fallback' })
    return reply.send(modelManager.getFallbackResponse())
  })
}
