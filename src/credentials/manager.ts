import { readCredentialStore, writeCredentialStore } from './storage.js'
import type { Credential, CredentialStore, CreateCredentialInput, UpdateCredentialInput } from './types.js'
import { validateHttpUrl } from '../services/proxy-fetch.js'
import { Mutex } from '../utils/mutex.js'
import { NotFoundError } from '../utils/errors.js'

const validateTargetUrl = (raw: string) => validateHttpUrl(raw, 'targetUrl', { stripTrailingSlash: true })
const validateProxyUrl = (raw: string) => validateHttpUrl(raw, 'proxy URL')

export class CredentialManager {
  private store: CredentialStore = { credentials: [] }
  private mutex = new Mutex()

  async init(): Promise<void> {
    this.store = (await readCredentialStore()) ?? { credentials: [] }
  }

  getAll(): Credential[] {
    return [...this.store.credentials]
  }

  getById(id: string): Credential | undefined {
    return this.store.credentials.find((c) => c.id === id)
  }

  async create(input: CreateCredentialInput): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const now = new Date().toISOString()
      const cred: Credential = {
        id: Bun.randomUUIDv7(),
        name: input.name,
        targetUrl: validateTargetUrl(input.targetUrl),
        apiKey: input.apiKey,
        proxyUrl: input.proxyUrl ? validateProxyUrl(input.proxyUrl) : null,
        wordSetIds: [],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      }
      this.store.credentials.push(cred)
      await writeCredentialStore(this.store)
      return cred
    } finally {
      this.mutex.release()
    }
  }

  async update(id: string, input: UpdateCredentialInput): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const idx = this.store.credentials.findIndex((c) => c.id === id)
      if (idx === -1) throw new NotFoundError('Credential not found')
      const existing = this.store.credentials[idx]
      const updated: Credential = {
        ...existing,
        name: input.name ?? existing.name,
        targetUrl: input.targetUrl ? validateTargetUrl(input.targetUrl) : existing.targetUrl,
        apiKey: input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : existing.apiKey,
        proxyUrl:
          input.proxyUrl !== undefined ? (input.proxyUrl ? validateProxyUrl(input.proxyUrl) : null) : existing.proxyUrl,
        updatedAt: new Date().toISOString(),
      }
      this.store.credentials[idx] = updated
      await writeCredentialStore(this.store)
      return updated
    } finally {
      this.mutex.release()
    }
  }

  async remove(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      const idx = this.store.credentials.findIndex((c) => c.id === id)
      if (idx === -1) throw new NotFoundError('Credential not found')
      this.store.credentials.splice(idx, 1)
      await writeCredentialStore(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async setWordSetIds(id: string, wordSetIds: string[]): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const cred = this.store.credentials.find((c) => c.id === id)
      if (!cred) throw new NotFoundError('Credential not found')
      cred.wordSetIds = wordSetIds
      cred.updatedAt = new Date().toISOString()
      await writeCredentialStore(this.store)
      return cred
    } finally {
      this.mutex.release()
    }
  }

  async unbindWordSet(setId: string): Promise<void> {
    await this.mutex.acquire()
    try {
      let changed = false
      for (const cred of this.store.credentials) {
        const idx = cred.wordSetIds.indexOf(setId)
        if (idx !== -1) {
          cred.wordSetIds.splice(idx, 1)
          cred.updatedAt = new Date().toISOString()
          changed = true
        }
      }
      if (changed) await writeCredentialStore(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async pruneInvalidWordSetIds(validSetIds: Set<string>): Promise<void> {
    await this.mutex.acquire()
    try {
      let changed = false
      const now = new Date().toISOString()
      for (const cred of this.store.credentials) {
        const filtered = cred.wordSetIds.filter((id) => validSetIds.has(id))
        if (filtered.length !== cred.wordSetIds.length) {
          cred.wordSetIds = filtered
          cred.updatedAt = now
          changed = true
        }
      }
      if (changed) await writeCredentialStore(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const cred = this.store.credentials.find((c) => c.id === id)
      if (!cred) throw new NotFoundError('Credential not found')
      cred.enabled = enabled
      cred.updatedAt = new Date().toISOString()
      await writeCredentialStore(this.store)
      return cred
    } finally {
      this.mutex.release()
    }
  }
}

export const credentialManager = new CredentialManager()
