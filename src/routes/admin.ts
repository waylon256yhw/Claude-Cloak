import type { FastifyInstance, FastifyReply } from 'fastify'
import { NotFoundError, InvalidInputError } from '../utils/errors.js'
import type { Config } from '../types.js'
import { credentialManager } from '../credentials/manager.js'
import type { CreateCredentialInput, UpdateCredentialInput } from '../credentials/types.js'
import { maskCredential } from '../credentials/types.js'
import { apiKeyManager } from '../apikeys/manager.js'
import type { CreateApiKeyInput, UpdateApiKeyInput } from '../apikeys/types.js'
import { maskApiKey } from '../apikeys/types.js'
import { settingsManager, type Settings } from '../settings/manager.js'
import { sensitiveWordsManager } from '../sensitive-words/manager.js'
import { modelManager } from '../models/manager.js'
import { buildStealthHeaders } from '../services/headers.js'
import { resolveProxyUrl, proxyFetch } from '../services/proxy-fetch.js'

interface IdParams {
  id: string
}

interface WordIdParams {
  id: string
  wordId: string
}

function looksLikeMaskedKey(key: string): boolean {
  if (!key) return false
  const trimmed = key.trim()
  return /^\.{3,}/.test(trimmed) || /^\*{3,}$/.test(trimmed)
}

function handleCrudError(reply: FastifyReply, err: unknown): void {
  if (err instanceof NotFoundError) {
    reply.code(404).send({ error: 'Not Found', message: err.message })
  } else if (err instanceof InvalidInputError) {
    reply.code(400).send({ error: 'Bad Request', message: err.message })
  } else {
    const msg = err instanceof Error ? err.message : String(err)
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
    const { name, targetUrl, apiKey, proxyUrl } = request.body || {}
    if (!name || !targetUrl || !apiKey) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields: name, targetUrl, apiKey' })
      return
    }
    if (looksLikeMaskedKey(apiKey)) {
      reply.code(400).send({ error: 'Bad Request', message: 'Masked API key cannot be saved. Please provide the full key.' })
      return
    }
    try {
      const created = await credentialManager.create({ name, targetUrl, apiKey, proxyUrl })
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

  fastify.post<{ Params: IdParams; Body: { enabled: boolean } }>('/credentials/:id/toggle', async (request, reply) => {
    const { enabled } = request.body || {}
    if (typeof enabled !== 'boolean') {
      reply.code(400).send({ error: 'Bad Request', message: 'enabled must be boolean' })
      return
    }
    try {
      const cred = await credentialManager.setEnabled(request.params.id, enabled)
      return maskCredential(cred)
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.put<{ Params: IdParams; Body: { wordSetIds: string[] } }>('/credentials/:id/word-sets', async (request, reply) => {
    const { wordSetIds } = request.body || {}
    if (!Array.isArray(wordSetIds) || !wordSetIds.every((id: unknown) => typeof id === 'string')) {
      reply.code(400).send({ error: 'Bad Request', message: 'wordSetIds must be an array of strings' })
      return
    }
    try {
      const cred = await credentialManager.setWordSetIds(request.params.id, wordSetIds)
      return maskCredential(cred)
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
      const res = await proxyFetch(`${cred.targetUrl}/v1/messages`, {
        method: 'POST',
        headers: buildStealthHeaders(cred.apiKey, false),
        body: JSON.stringify({
          model: modelManager.getTestModelId(),
          max_tokens: 10,
          stream: false,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        signal: controller.signal
      }, resolveProxyUrl(cred.proxyUrl, config.outboundProxy))

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
}

async function registerApiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/apikeys', async () => {
    const keys = apiKeyManager.getAll()
    return keys.map((k) => {
      const cred = k.credentialId ? credentialManager.getById(k.credentialId) : null
      return maskApiKey(k, cred?.name ?? null)
    })
  })

  fastify.post<{ Body: CreateApiKeyInput }>('/apikeys', async (request, reply) => {
    const { name, credentialId } = request.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: name' })
      return
    }
    if (!credentialId || typeof credentialId !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: credentialId' })
      return
    }
    if (!credentialManager.getById(credentialId)) {
      reply.code(400).send({ error: 'Bad Request', message: 'Credential not found' })
      return
    }
    try {
      const created = await apiKeyManager.create({ name: name.trim(), credentialId })
      const cred = created.credentialId ? credentialManager.getById(created.credentialId) : null
      return {
        ...maskApiKey(created, cred?.name ?? null),
        key: created.key,
      }
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.put<{ Params: IdParams; Body: UpdateApiKeyInput }>('/apikeys/:id', async (request, reply) => {
    const { name, credentialId } = request.body || {}
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      reply.code(400).send({ error: 'Bad Request', message: 'name must be a non-empty string' })
      return
    }
    if (credentialId !== undefined) {
      if (!credentialId || typeof credentialId !== 'string' || !credentialManager.getById(credentialId)) {
        reply.code(400).send({ error: 'Bad Request', message: 'Credential not found' })
        return
      }
    }
    try {
      const input: UpdateApiKeyInput = { ...request.body }
      if (input.name) input.name = input.name.trim()
      const updated = await apiKeyManager.update(request.params.id, input)
      const cred = updated.credentialId ? credentialManager.getById(updated.credentialId) : null
      return maskApiKey(updated, cred?.name ?? null)
    } catch (err) {
      handleCrudError(reply, err)
    }
  })

  fastify.delete<{ Params: IdParams }>('/apikeys/:id', async (request, reply) => {
    try {
      await apiKeyManager.remove(request.params.id)
      return { success: true }
    } catch (err) {
      handleCrudError(reply, err)
    }
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
      return await settingsManager.update(request.body || {})
    } catch (err) {
      handleCrudError(reply, err)
    }
  })
}

async function registerWordSetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/word-sets', async () => {
    const sets = await sensitiveWordsManager.getAllSets()
    const allCreds = credentialManager.getAll()
    return sets.map((s) => ({
      id: s.id,
      name: s.name,
      entryCount: s.entries.length,
      credentialCount: allCreds.filter((c) => c.wordSetIds.includes(s.id)).length,
      updatedAt: s.updatedAt,
    }))
  })

  fastify.post<{ Body: { name: string } }>('/word-sets', async (request, reply) => {
    const { name } = request.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: name' })
      return
    }
    const set = await sensitiveWordsManager.createSet(name)
    return { id: set.id, name: set.name, entryCount: 0, credentialCount: 0, updatedAt: set.updatedAt }
  })

  fastify.put<{ Params: IdParams; Body: { name: string } }>('/word-sets/:id', async (request, reply) => {
    const { name } = request.body || {}
    if (!name || typeof name !== 'string' || !name.trim()) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: name' })
      return
    }
    const set = await sensitiveWordsManager.updateSet(request.params.id, name)
    if (!set) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set not found' })
      return
    }
    return { id: set.id, name: set.name, entryCount: set.entries.length, updatedAt: set.updatedAt }
  })

  fastify.delete<{ Params: IdParams }>('/word-sets/:id', async (request, reply) => {
    await credentialManager.unbindWordSet(request.params.id)
    const removed = await sensitiveWordsManager.removeSet(request.params.id)
    if (!removed) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set not found' })
      return
    }
    return { success: true }
  })

  fastify.get<{ Params: IdParams }>('/word-sets/:id/words', async (request, reply) => {
    const words = await sensitiveWordsManager.getWords(request.params.id)
    if (words === null) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set not found' })
      return
    }
    return words
  })

  fastify.post<{ Params: IdParams; Body: { word: string } }>('/word-sets/:id/words', async (request, reply) => {
    const { word } = request.body || {}
    if (!word || typeof word !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: word' })
      return
    }
    const entry = await sensitiveWordsManager.addWord(request.params.id, word)
    if (!entry) {
      reply.code(400).send({ error: 'Bad Request', message: 'Word set not found, word too short (min 2 chars), or already exists' })
      return
    }
    return entry
  })

  fastify.post<{ Params: IdParams; Body: { words: string[] } }>('/word-sets/:id/words/batch', async (request, reply) => {
    const { words } = request.body || {}
    if (!Array.isArray(words)) {
      reply.code(400).send({ error: 'Bad Request', message: 'words must be an array' })
      return
    }
    const result = await sensitiveWordsManager.addWordBatch(request.params.id, words)
    if (result === null) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set not found' })
      return
    }
    return result
  })

  fastify.put<{ Params: WordIdParams; Body: { word: string } }>('/word-sets/:id/words/:wordId', async (request, reply) => {
    const { word } = request.body || {}
    if (!word || typeof word !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required field: word' })
      return
    }
    const entry = await sensitiveWordsManager.updateWord(request.params.id, request.params.wordId, word)
    if (!entry) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set or word not found, or invalid' })
      return
    }
    return entry
  })

  fastify.delete<{ Params: WordIdParams }>('/word-sets/:id/words/:wordId', async (request, reply) => {
    const removed = await sensitiveWordsManager.removeWord(request.params.id, request.params.wordId)
    if (!removed) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set or word not found' })
      return
    }
    return { success: true }
  })

  fastify.delete<{ Params: IdParams }>('/word-sets/:id/words', async (request, reply) => {
    const count = await sensitiveWordsManager.clearWords(request.params.id)
    if (count === null) {
      reply.code(404).send({ error: 'Not Found', message: 'Word set not found' })
      return
    }
    return { success: true, cleared: count }
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
  await registerApiKeyRoutes(fastify)
  await registerSettingsRoutes(fastify)
  await registerWordSetRoutes(fastify)
  await registerModelRoutes(fastify)
}
