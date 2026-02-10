import { ModelStorage } from './storage.js'
import type { ModelEntry, ModelStore } from './types.js'

const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'claude-opus-4-6', created: 1738713600 },
  { id: 'claude-opus-4-5-20251101', created: 1730419200 },
  { id: 'claude-sonnet-4-5-20250929', created: 1727568000 },
  { id: 'claude-haiku-4-5-20251001', created: 1727740800 },
  { id: 'claude-sonnet-4-20250514', created: 1715644800 },
  { id: 'claude-opus-4-20250514', created: 1715644800 },
  { id: 'claude-haiku-4-20250514', created: 1715644800 },
  { id: 'claude-sonnet-3-7-20250219', created: 1739923200 },
  { id: 'claude-sonnet-3-5-20241022', created: 1729555200 },
  { id: 'claude-haiku-3-5-20241022', created: 1729555200 },
]

const DEFAULT_TEST_MODEL_ID = 'claude-haiku-4-5-20251001'

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

export class ModelManager {
  private store: ModelStore = { entries: [], testModelId: DEFAULT_TEST_MODEL_ID, updatedAt: '' }
  private storage: ModelStorage
  private mutex = new Mutex()

  constructor(storage?: ModelStorage) {
    this.storage = storage || new ModelStorage()
  }

  async init(): Promise<void> {
    const stored = await this.storage.read()
    if (stored) {
      this.store = stored
    } else {
      this.store = {
        entries: [...DEFAULT_MODELS],
        testModelId: DEFAULT_TEST_MODEL_ID,
        updatedAt: new Date().toISOString(),
      }
      await this.storage.write(this.store)
    }
  }

  getAll(): ModelEntry[] {
    return [...this.store.entries]
  }

  getStore(): ModelStore {
    return { ...this.store, entries: [...this.store.entries] }
  }

  getTestModelId(): string {
    return this.store.testModelId
  }

  async add(id: string, created?: number): Promise<ModelEntry> {
    await this.mutex.acquire()
    try {
      if (this.store.entries.some(e => e.id === id)) {
        throw new Error('Model already exists')
      }
      const entry: ModelEntry = { id, created: created ?? Math.floor(Date.now() / 1000) }
      this.store.entries.push(entry)
      this.store.updatedAt = new Date().toISOString()
      await this.storage.write(this.store)
      return entry
    } finally {
      this.mutex.release()
    }
  }

  async remove(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      const idx = this.store.entries.findIndex(e => e.id === id)
      if (idx === -1) throw new Error('Model not found')
      this.store.entries.splice(idx, 1)
      this.store.updatedAt = new Date().toISOString()
      await this.storage.write(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async setTestModelId(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      this.store.testModelId = id
      this.store.updatedAt = new Date().toISOString()
      await this.storage.write(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async reset(): Promise<void> {
    await this.mutex.acquire()
    try {
      this.store = {
        entries: [...DEFAULT_MODELS],
        testModelId: DEFAULT_TEST_MODEL_ID,
        updatedAt: new Date().toISOString(),
      }
      await this.storage.write(this.store)
    } finally {
      this.mutex.release()
    }
  }

  getFallbackResponse() {
    return {
      object: 'list',
      data: this.store.entries.map(e => ({
        id: e.id,
        object: 'model',
        created: e.created,
        owned_by: 'anthropic',
      })),
    }
  }
}

export const modelManager = new ModelManager()
