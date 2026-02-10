import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Config } from '../types.js'
import { credentialManager } from '../credentials/manager.js'
import type { CreateCredentialInput, UpdateCredentialInput } from '../credentials/types.js'
import { maskCredential } from '../credentials/types.js'
import { settingsManager, type Settings } from '../settings/manager.js'
import { sensitiveWordsManager } from '../sensitive-words/manager.js'
import { modelManager } from '../models/manager.js'
import { buildStealthHeaders } from '../services/headers.js'

interface IdParams {
  id: string
}

function looksLikeMaskedKey(key: string): boolean {
  if (!key) return false
  const trimmed = key.trim()
  return /^\.{3,}/.test(trimmed) || /^\*{3,}$/.test(trimmed)
}

function handleCrudError(reply: FastifyReply, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('not found')) {
    reply.code(404).send({ error: 'Not Found', message: msg })
  } else if (lower.includes('invalid')) {
    reply.code(400).send({ error: 'Bad Request', message: msg })
  } else {
    reply.code(500).send({ error: 'Internal Server Error', message: msg })
  }
}

async function registerCredentialRoutes(fastify: FastifyInstance, config: Config): Promise<void> {
  fastify.get('/credentials', async () => {
    const credentials = credentialManager.getAll()
    return credentials.map(maskCredential)
  })

  fastify.get<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    const cred = credentialManager.getById(request.params.id)
    if (!cred) {
      reply.code(404).send({ error: 'Not Found', message: 'Credential not found' })
      return
    }
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
      handleCrudError(reply, err)
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
      handleCrudError(reply, err)
    }
  })

  fastify.delete<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    try {
      await credentialManager.remove(request.params.id)
      return { success: true }
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.post<{ Params: IdParams }>('/credentials/:id/activate', async (request, reply) => {
    try {
      return await credentialManager.activate(request.params.id)
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.post<{ Params: IdParams }>('/credentials/:id/test', async (request, reply) => {
    const cred = credentialManager.getById(request.params.id)
    if (!cred) {
      reply.code(404).send({ error: 'Not Found', message: 'Credential not found' })
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.testRequestTimeout)
    const startTime = Date.now()

    try {
      const res = await fetch(`${cred.targetUrl}/v1/messages`, {
        method: 'POST',
        headers: buildStealthHeaders(cred.apiKey, false),
        body: JSON.stringify({
          model: modelManager.getTestModelId(),
          max_tokens: 10,
          stream: false,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)
      const latencyMs = Date.now() - startTime

      if (res.ok) {
        return { success: true, latencyMs, statusCode: res.status }
      }

      const data = await res.json().catch(() => ({})) as { error?: { type?: string; message?: string } }
      return {
        success: false,
        latencyMs,
        statusCode: res.status,
        error: data.error || { message: `HTTP ${res.status}` }
      }
    } catch (err) {
      clearTimeout(timeout)
      const latencyMs = Date.now() - startTime
      const isTimeout = (err as Error).name === 'AbortError'

      return {
        success: false,
        latencyMs,
        statusCode: isTimeout ? 504 : 502,
        error: isTimeout ? 'Upstream request timed out' : (err as Error).message
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
}

async function registerSettingsRoutes(fastify: FastifyInstance): Promise<void> {
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

async function registerSensitiveWordsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/sensitive-words', async () => {
    return sensitiveWordsManager.getStore()
  })

  fastify.post<{ Body: { word: string } }>('/sensitive-words', async (request, reply) => {
    const { word } = request.body || {}
    if (!word || typeof word !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: word' })
      return
    }
    const entry = await sensitiveWordsManager.add(word)
    if (!entry) {
      reply.code(400).send({ error: 'Bad Request', message: 'Word too short (min 2 chars) or already exists' })
      return
    }
    return entry
  })

  fastify.post<{ Body: { words: string[] } }>('/sensitive-words/batch', async (request, reply) => {
    const { words } = request.body || {}
    if (!Array.isArray(words)) {
      reply.code(400).send({ error: 'Bad Request', message: 'words must be an array' })
      return
    }
    return sensitiveWordsManager.addBatch(words)
  })

  fastify.put<{ Params: IdParams; Body: { word: string } }>('/sensitive-words/:id', async (request, reply) => {
    const { word } = request.body || {}
    if (!word || typeof word !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: word' })
      return
    }
    const entry = await sensitiveWordsManager.update(request.params.id, word)
    if (!entry) {
      reply.code(404).send({ error: 'Not Found', message: 'Word not found or invalid' })
      return
    }
    return entry
  })

  fastify.delete<{ Params: IdParams }>('/sensitive-words/:id', async (request, reply) => {
    const removed = await sensitiveWordsManager.remove(request.params.id)
    if (!removed) {
      reply.code(404).send({ error: 'Not Found', message: 'Word not found' })
      return
    }
    return { success: true }
  })

  fastify.delete<{ Body: { ids: string[] } }>('/sensitive-words/batch', async (request, reply) => {
    const { ids } = request.body || {}
    if (!Array.isArray(ids)) {
      reply.code(400).send({ error: 'Bad Request', message: 'ids must be an array' })
      return
    }
    const removed = await sensitiveWordsManager.removeBatch(ids)
    return { success: true, removed }
  })

  fastify.delete('/sensitive-words', async () => {
    const count = await sensitiveWordsManager.clear()
    return { success: true, cleared: count }
  })

  fastify.put<{ Body: { enabled: boolean } }>('/sensitive-words/settings', async (request, reply) => {
    const { enabled } = request.body || {}
    if (typeof enabled !== 'boolean') {
      reply.code(400).send({ error: 'Bad Request', message: 'enabled must be boolean' })
      return
    }
    await sensitiveWordsManager.setEnabled(enabled)
    return { enabled }
  })
}

async function registerModelRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/models', async () => {
    return modelManager.getStore()
  })

  fastify.post<{ Body: { id: string; created?: number } }>('/models', async (request, reply) => {
    const { id, created } = request.body || {}
    if (!id || typeof id !== 'string' || !id.trim()) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: id' })
      return
    }
    if (created !== undefined && (typeof created !== 'number' || !Number.isFinite(created))) {
      reply.code(400).send({ error: 'Bad Request', message: 'created must be a finite number' })
      return
    }
    try {
      return await modelManager.add(id.trim(), created)
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.delete<{ Params: IdParams }>('/models/:id', async (request, reply) => {
    try {
      await modelManager.remove(request.params.id)
      return { success: true }
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.put<{ Body: { id: string } }>('/models/test-model', async (request, reply) => {
    const { id } = request.body || {}
    if (!id || typeof id !== 'string' || !id.trim()) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: id' })
      return
    }
    try {
      await modelManager.setTestModelId(id.trim())
      return { testModelId: id.trim() }
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.post('/models/reset', async (_request, reply) => {
    try {
      await modelManager.reset()
      return modelManager.getStore()
    } catch (err) {
      handleCrudError(reply, err)
    }
  })
}

export async function adminRoutes(fastify: FastifyInstance, config: Config) {
  await registerCredentialRoutes(fastify, config)
  await registerSettingsRoutes(fastify)
  await registerSensitiveWordsRoutes(fastify)
  await registerModelRoutes(fastify)
}
