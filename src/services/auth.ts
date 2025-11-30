import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Config } from '../types.js'

export function createAuthHook(config: Config) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const key = extractApiKey(request)

    if (!key) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing API key. Use Authorization: Bearer <key> or x-api-key header',
      })
      return reply
    }

    if (key !== config.proxyKey) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      })
      return reply
    }
  }
}

function extractApiKey(request: FastifyRequest): string | null {
  // 1. x-api-key header
  const xApiKey = request.headers['x-api-key']
  if (xApiKey && typeof xApiKey === 'string') {
    return xApiKey
  }

  // 2. Authorization: Bearer <key>
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}
