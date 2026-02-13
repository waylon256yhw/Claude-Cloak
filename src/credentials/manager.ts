import { randomUUID } from 'node:crypto'
import { CredentialStorage } from './storage.js'
import type { Credential, CredentialStore, CreateCredentialInput, UpdateCredentialInput } from './types.js'
import { validateProxyUrl } from '../services/proxy-fetch.js'

class Mutex {
  private locked = false
  private queue: (() => void)[] = []

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.locked = false
    }
  }
}


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
  private store: CredentialStore = { credentials: [], activeId: null }
  private storage: CredentialStorage
  private mutex = new Mutex()

  constructor(storage?: CredentialStorage) {
    this.storage = storage || new CredentialStorage()
  }

  async init(): Promise<void> {
    this.store = await this.storage.read()
    if (!this.store.activeId && this.store.credentials.length > 0) {
      const active = this.store.credentials.find((c) => c.isActive)
      this.store.activeId = active?.id || null
    }
  }

  getAll(): Credential[] {
    return [...this.store.credentials]
  }

  getById(id: string): Credential | undefined {
    return this.store.credentials.find((c) => c.id === id)
  }

  getActive(): Credential | undefined {
    if (!this.store.activeId) return undefined
    return this.store.credentials.find((c) => c.id === this.store.activeId)
  }

  async create(input: CreateCredentialInput): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const now = new Date().toISOString()
      const isFirst = this.store.credentials.length === 0
      const cred: Credential = {
        id: randomUUID(),
        name: input.name,
        targetUrl: validateTargetUrl(input.targetUrl),
        apiKey: input.apiKey,
        proxyUrl: input.proxyUrl ? validateProxyUrl(input.proxyUrl) : null,
        isActive: isFirst,
        createdAt: now,
        updatedAt: now,
      }
      this.store.credentials.push(cred)
      if (isFirst) {
        this.store.activeId = cred.id
      }
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
      if (this.store.activeId === id) {
        this.store.activeId = null
        this.store.credentials.forEach((c) => (c.isActive = false))
        if (this.store.credentials.length > 0) {
          this.store.credentials[0].isActive = true
          this.store.activeId = this.store.credentials[0].id
        }
      }
      await this.storage.write(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async activate(id: string): Promise<Credential> {
    await this.mutex.acquire()
    try {
      const cred = this.store.credentials.find((c) => c.id === id)
      if (!cred) throw new Error('Credential not found')
      this.store.credentials.forEach((c) => (c.isActive = c.id === id))
      this.store.activeId = id
      await this.storage.write(this.store)
      return cred
    } finally {
      this.mutex.release()
    }
  }
}

export const credentialManager = new CredentialManager()
