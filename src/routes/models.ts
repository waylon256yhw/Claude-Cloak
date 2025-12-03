import type { FastifyInstance } from 'fastify'
import type { Config } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'
import { credentialManager } from '../credentials/manager.js'
import { getProxyDispatcher, undiciFetch } from '../services/socks.js'

export async function modelsRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/v1/models', async (request, reply) => {
    const active = credentialManager.getActive()
    const targetUrl = active?.targetUrl || config.targetUrl
    const apiKey = active?.apiKey || config.apiKey

    if (!targetUrl || !apiKey) {
      reply.code(503).send({ error: 'Service Unavailable', message: 'No upstream credential configured' })
      return
    }

    const headers = buildStealthHeaders(apiKey)

    const response = await undiciFetch(`${targetUrl}/v1/models`, {
      method: 'GET',
      headers,
      dispatcher: getProxyDispatcher(),
    })

    const data = await response.text()

    reply.code(response.status).headers({
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'X-Proxy-Status': 'forwarded',
    })

    return reply.send(data)
  })
}
