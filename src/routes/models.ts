import type { FastifyInstance } from 'fastify'
import type { Config } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { credentialManager } from '../credentials/manager.js'
import { modelManager } from '../models/manager.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'

export async function modelsRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/v1/models', async (request, reply) => {
    const active = credentialManager.getActive()
    const targetUrl = active?.targetUrl || config.targetUrl
    const apiKey = active?.apiKey || config.apiKey

    if (!targetUrl || !apiKey) {
      return reply.send(modelManager.getFallbackResponse())
    }

    const headers = buildStealthHeaders(apiKey)

    const proxyUrl = resolveProxyUrl(active?.proxyUrl, config.outboundProxy)

    try {
      const response = await proxyFetch(`${targetUrl}/v1/models`, {
        method: 'GET',
        headers,
      }, proxyUrl)

      if (response.ok) {
        const data = await response.text()
        reply.headers({
          'Content-Type': response.headers.get('content-type') || 'application/json',
          'X-Proxy-Status': 'forwarded',
        })
        return reply.send(data)
      }
    } catch {
      // Upstream failed, use fallback
    }

    reply.headers({ 'X-Proxy-Status': 'fallback' })
    return reply.send(modelManager.getFallbackResponse())
  })
}
