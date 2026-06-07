import { readModelStore, writeModelStore } from './storage.js'
import type { ModelEntry, ModelStore } from './types.js'
import { Mutex } from '../utils/mutex.js'
import { NotFoundError, InvalidInputError } from '../utils/errors.js'

const DEFAULT_MODELS: ModelEntry[] = [
  // Latest / recommended
  { id: 'claude-opus-4-8',            created: 1779926400 }, // 2026-05-28
  { id: 'claude-sonnet-4-6',          created: 1771286400 }, // 2026-02-17
  { id: 'claude-haiku-4-5-20251001',  created: 1759276800 }, // 2025-10-01
  // Active legacy
  { id: 'claude-opus-4-7',            created: 1776297600 }, // 2026-04-16
  { id: 'claude-opus-4-6',            created: 1770249600 }, // 2026-02-05
  { id: 'claude-opus-4-5-20251101',   created: 1761955200 }, // 2025-11-01
  { id: 'claude-sonnet-4-5-20250929', created: 1759104000 }, // 2025-09-29
]

const DEFAULT_TEST_MODEL_ID = 'claude-haiku-4-5-20251001'

export class ModelManager {
  private store: ModelStore = { entries: [], testModelId: DEFAULT_TEST_MODEL_ID, updatedAt: '' }
  private mutex = new Mutex()

  async init(): Promise<void> {
    const stored = await readModelStore()
    if (stored) {
      this.store = stored
    } else {
      this.store = {
        entries: [...DEFAULT_MODELS],
        testModelId: DEFAULT_TEST_MODEL_ID,
        updatedAt: new Date().toISOString(),
      }
      await writeModelStore(this.store)
    }
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
        throw new InvalidInputError('Model already exists')
      }
      const entry: ModelEntry = { id, created: created ?? Math.floor(Date.now() / 1000) }
      this.store.entries.push(entry)
      this.store.updatedAt = new Date().toISOString()
      await writeModelStore(this.store)
      return entry
    } finally {
      this.mutex.release()
    }
  }

  async remove(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      const idx = this.store.entries.findIndex(e => e.id === id)
      if (idx === -1) throw new NotFoundError('Model not found')
      this.store.entries.splice(idx, 1)
      this.store.updatedAt = new Date().toISOString()
      await writeModelStore(this.store)
    } finally {
      this.mutex.release()
    }
  }

  async setTestModelId(id: string): Promise<void> {
    await this.mutex.acquire()
    try {
      this.store.testModelId = id
      this.store.updatedAt = new Date().toISOString()
      await writeModelStore(this.store)
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
      await writeModelStore(this.store)
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
