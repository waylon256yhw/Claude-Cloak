import { randomUUID } from 'node:crypto'
import { CredentialStorage } from './storage.js'
import type { Credential, CredentialStore, CreateCredentialInput, UpdateCredentialInput } from './types.js'
import { validateProxyUrl } from '../services/proxy-fetch.js'
import { Mutex } from '../utils/mutex.js'
import { NotFoundError, InvalidInputError } from '../utils/errors.js'

function validateTargetUrl(raw: string): string {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new InvalidInputError('Invalid targetUrl: malformed URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new InvalidInputError('Invalid targetUrl: only http/https allowed')
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export class CredentialManager {
  private store: CredentialStore = { credentials: [] }
  private storage: CredentialStorage
  private mutex = new Mutex()

  constructor(storage?: CredentialStorage) {
    this.storage = storage || new CredentialStorage()
  }

  async init(): Promise<void> {
    this.store = (await this.storage.read()) ?? { credentials: [] }
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
        id: randomUUID(),
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
      await this.storage.write(this.store)
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
        apiKey: (input.apiKey && input.apiKey.trim()) ? input.apiKey.trim() : existing.apiKey,
        proxyUrl: input.proxyUrl !== undefined
          ? (input.proxyUrl ? validateProxyUrl(input.proxyUrl) : null)
          : existing.proxyUrl,
        updatedAt: new Date().toISOString(),
      }
      this.store.credentials[idx] = updated
      await this.storage.write(this.store)
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
      await this.storage.write(this.store)
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
      await this.storage.write(this.store)
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
      if (changed) await this.storage.write(this.store)
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
      await this.storage.write(this.store)
      return cred
    } finally {
      this.mutex.release()
    }
  }
}

export const credentialManager = new CredentialManager()
