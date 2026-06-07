import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readApiKeyStore, writeApiKeyStore } from './storage.js'
import { KEY_PREFIX, type ApiKey, type ApiKeyStore, type CreateApiKeyInput, type UpdateApiKeyInput } from './types.js'
import { Mutex } from '../utils/mutex.js'
import { NotFoundError } from '../utils/errors.js'

const KEY_RANDOM_BYTES = 16

function generateKey(): string {
  return KEY_PREFIX + randomBytes(KEY_RANDOM_BYTES).toString('hex')
}

export class ApiKeyManager {
  private store: ApiKeyStore = { keys: [] }
  private mutex = new Mutex()

  async init(): Promise<void> {
    this.store = (await readApiKeyStore()) ?? { keys: [] }
  }

  getAll(): ApiKey[] {
    return [...this.store.keys]
  }

  resolve(rawKey: string): ApiKey | undefined {
    const keyBuffer = Buffer.from(rawKey)
    for (const entry of this.store.keys) {
      const entryBuffer = Buffer.from(entry.key)
      if (keyBuffer.length === entryBuffer.length && timingSafeEqual(keyBuffer, entryBuffer)) {
        return entry
      }
    }
    return undefined
  }

  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    await this.mutex.acquire()
    try {
      let key = generateKey()
      while (this.store.keys.some((k) => k.key === key)) {
        key = generateKey()
      }

      const now = new Date().toISOString()
      const apiKey: ApiKey = {
        id: Bun.randomUUIDv7(),
        name: input.name,
        key,
        credentialId: input.credentialId ?? null,
        createdAt: now,
        updatedAt: now,
      }
      this.store.keys.push(apiKey)
      await writeApiKeyStore(this.store)
      return apiKey
    } finally {
      this.mutex.release()
    }
  }

  async update(id: string, input: UpdateApiKeyInput): Promise<ApiKey> {
    await this.mutex.acquire()
    try {
      const idx = this.store.keys.findIndex((k) => k.id === id)
      if (idx === -1) throw new NotFoundError('API key not found')
      const existing = this.store.keys[idx]
      const updated: ApiKey = {
        ...existing,
        name: input.name ?? existing.name,
        credentialId: input.credentialId !== undefined ? (input.credentialId ?? null) : existing.credentialId,
        updatedAt: new Date().toISOString(),
      }
      this.store.keys[idx] = updated
      await writeApiKeyStore(this.store)
      return updated
    } finally {
      this.mutex.release()
    }
  }

  async remove(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      const idx = this.store.keys.findIndex((k) => k.id === id)
      if (idx === -1) throw new NotFoundError('API key not found')
      this.store.keys.splice(idx, 1)
      await writeApiKeyStore(this.store)
    } finally {
      this.mutex.release()
    }
  }
}

export const apiKeyManager = new ApiKeyManager()
