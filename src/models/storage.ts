import { join } from 'node:path'
import { JsonStore } from '../utils/json-store.js'
import type { ModelStore, ModelEntry } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'models.json')

function isValidEntry(e: unknown): e is ModelEntry {
  if (!e || typeof e !== 'object') return false
  const obj = e as Record<string, unknown>
  return typeof obj.id === 'string' && obj.id.length > 0 && typeof obj.created === 'number'
}

export class ModelStorage extends JsonStore<ModelStore> {
  constructor(path?: string) {
    super(path || process.env.MODEL_STORE_PATH || DEFAULT_PATH, {
      tmpPrefix: '.models-',
    })
  }

  protected deserialize(raw: Record<string, unknown>): ModelStore {
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
    return {
      entries: rawEntries.filter(isValidEntry),
      testModelId: typeof raw.testModelId === 'string' ? raw.testModelId : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    }
  }
}
