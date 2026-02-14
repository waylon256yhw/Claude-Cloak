import { timingSafeEqual } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Config } from '../types.js'
import type { ApiKey } from '../apikeys/types.js'
import { apiKeyManager } from '../apikeys/manager.js'

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyEntity?: ApiKey
  }
}

export function createAdminAuthHook(config: Config) {
  return async function adminAuthHook(request: FastifyRequest, reply: FastifyReply) {
    const key = extractApiKey(request)
    if (!key) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing API key' })
      return reply
    }

    const keyBuffer = Buffer.from(key)
    const adminBuffer = Buffer.from(config.adminKey)
    const isValid = keyBuffer.length === adminBuffer.length && timingSafeEqual(keyBuffer, adminBuffer)

    if (!isValid) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid admin key' })
      return reply
    }
  }
}

export function createProxyAuthHook() {
  return async function proxyAuthHook(request: FastifyRequest, reply: FastifyReply) {
    const key = extractApiKey(request)
    if (!key) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Missing API key. Use Authorization: Bearer <key> or x-api-key header' })
      return reply
    }

    const matched = apiKeyManager.resolve(key)
    if (!matched) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid API key' })
      return reply
    }

    request.apiKeyEntity = matched
  }
}

function extractApiKey(request: FastifyRequest): string | null {
  const xApiKey = request.headers['x-api-key']
  if (xApiKey && typeof xApiKey === 'string') {
    return xApiKey
  }

  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}
