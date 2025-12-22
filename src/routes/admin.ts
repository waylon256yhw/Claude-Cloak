import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config } from '../types.js'
import { credentialManager } from '../credentials/manager.js'
import type { CreateCredentialInput, UpdateCredentialInput } from '../credentials/types.js'
import { maskCredential } from '../credentials/types.js'
import { settingsManager, type Settings } from '../settings/manager.js'

interface IdParams {
  id: string
}

// Detect if a key looks like a masked value (e.g., "...abcd" or "****")
function looksLikeMaskedKey(key: string): boolean {
  if (!key) return false
  const trimmed = key.trim()
  return /^\.{3,}/.test(trimmed) || /^\*{3,}$/.test(trimmed)
}

export async function adminRoutes(fastify: FastifyInstance, _config: Config) {

  fastify.get('/credentials', async () => {
    const credentials = credentialManager.getAll()
    // Mask API keys in list view for security
    return credentials.map(maskCredential)
  })

  fastify.get<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    const cred = credentialManager.getById(request.params.id)
    if (!cred) {
      reply.code(404).send({ error: 'Not Found', message: 'Credential not found' })
      return
    }
    // Mask API key for security
    return maskCredential(cred)
  })

  fastify.post<{ Body: CreateCredentialInput }>('/credentials', async (request, reply) => {
    const { name, targetUrl, apiKey } = request.body || {}
    if (!name || !targetUrl || !apiKey) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields: name, targetUrl, apiKey' })
      return
    }
    if (looksLikeMaskedKey(apiKey)) {
      reply.code(400).send({ error: 'Bad Request', message: 'Masked API key cannot be saved. Please provide the full key.' })
      return
    }
    try {
      const created = await credentialManager.create({ name, targetUrl, apiKey })
      return maskCredential(created)
    } catch (err) {
      reply.code(500).send({ error: 'Internal Server Error', message: (err as Error).message })
    }
  })

  fastify.put<{ Params: IdParams; Body: UpdateCredentialInput }>('/credentials/:id', async (request, reply) => {
    const { apiKey } = request.body || {}
    if (apiKey && looksLikeMaskedKey(apiKey)) {
      reply.code(400).send({ error: 'Bad Request', message: 'Masked API key cannot be saved. Please provide the full key or leave blank to keep existing.' })
      return
    }
    try {
      const updated = await credentialManager.update(request.params.id, request.body || {})
      return maskCredential(updated)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.delete<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    try {
      await credentialManager.remove(request.params.id)
      return { success: true }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.post<{ Params: IdParams }>('/credentials/:id/activate', async (request, reply) => {
    try {
      return await credentialManager.activate(request.params.id)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.get('/active', async (request, reply) => {
    const active = credentialManager.getActive()
    if (!active) {
      reply.code(404).send({ error: 'Not Found', message: 'No active credential configured' })
      return
    }
    return { id: active.id, name: active.name, targetUrl: active.targetUrl }
  })

  fastify.get('/settings', async () => {
    return settingsManager.getAll()
  })

  fastify.put<{ Body: Partial<Settings> }>('/settings', async (request, reply) => {
    const { strictMode } = request.body || {}
    if (strictMode !== undefined && typeof strictMode !== 'boolean') {
      reply.code(400).send({ error: 'Bad Request', message: 'strictMode must be boolean' })
      return
    }
    try {
      return settingsManager.update(request.body || {})
    } catch (err) {
      reply.code(400).send({ error: 'Bad Request', message: (err as Error).message })
    }
  })
}
