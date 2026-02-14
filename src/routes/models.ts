import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Config } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { credentialManager } from '../credentials/manager.js'
import { modelManager } from '../models/manager.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'

export async function modelsRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/v1/models', async (request: FastifyRequest, reply) => {
    let targetUrl: string | null = null
    let apiKey: string | null = null
    let proxyUrl: string | null | undefined = undefined

    const apiKeyEntity = request.apiKeyEntity
    if (apiKeyEntity?.credentialId) {
      const cred = credentialManager.getById(apiKeyEntity.credentialId)
      if (cred?.enabled) {
        targetUrl = cred.targetUrl
        apiKey = cred.apiKey
        proxyUrl = cred.proxyUrl
      }
    }

    if (!targetUrl || !apiKey) {
      targetUrl = config.targetUrl
      apiKey = config.apiKey
    }

    if (!targetUrl || !apiKey) {
      return reply.send(modelManager.getFallbackResponse())
    }

    const headers = buildStealthHeaders(apiKey)
    const resolvedProxy = resolveProxyUrl(proxyUrl, config.outboundProxy)

    try {
      const response = await proxyFetch(`${targetUrl}/v1/models`, {
        method: 'GET',
        headers,
      }, resolvedProxy)

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
