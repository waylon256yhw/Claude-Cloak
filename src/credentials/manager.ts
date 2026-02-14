import { randomUUID } from 'node:crypto'
import { CredentialStorage } from './storage.js'
import type { Credential, CredentialStore, CreateCredentialInput, UpdateCredentialInput } from './types.js'
import { validateProxyUrl } from '../services/proxy-fetch.js'
import { Mutex } from '../utils/mutex.js'

function validateTargetUrl(raw: string): string {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Invalid targetUrl: malformed URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Invalid targetUrl: only http/https allowed')
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
    this.store = await this.storage.read()
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
      if (idx === -1) throw new Error('Credential not found')
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
      if (idx === -1) throw new Error('Credential not found')
      this.store.credentials.splice(idx, 1)
      await this.storage.write(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const cred = this.store.credentials.find((c) => c.id === id)
      if (!cred) throw new Error('Credential not found')
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
