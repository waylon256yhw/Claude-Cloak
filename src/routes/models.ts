import type { FastifyInstance } from 'fastify'
import type { Config } from '../types.js'
import { buildStealthHeaders } from '../services/headers.js'

export async function modelsRoutes(fastify: FastifyInstance, config: Config) {
  fastify.get('/v1/models', async (request, reply) => {
    const headers = buildStealthHeaders(config.apiKey)

    const response = await fetch(`${config.targetUrl}/v1/models`, {
      method: 'GET',
      headers,
    })

    const data = await response.text()

    reply.code(response.status).headers({
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'X-Proxy-Status': 'forwarded',
    })

    return reply.send(data)
  })
}
