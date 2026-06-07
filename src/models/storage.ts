import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../utils/json-store.js'
import type { ModelEntry, ModelStore } from './types.js'

const PATH = process.env.MODEL_STORE_PATH || join(process.cwd(), 'data', 'models.json')

function isValidEntry(e: unknown): e is ModelEntry {
  if (!e || typeof e !== 'object') return false
  const obj = e as Record<string, unknown>
  return typeof obj.id === 'string' && obj.id.length > 0 && typeof obj.created === 'number'
}

export async function readModelStore(): Promise<ModelStore | null> {
  const raw = await readJsonFile<Record<string, unknown>>(PATH)
  if (!raw) return null
  const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
  return {
    entries: rawEntries.filter(isValidEntry),
    testModelId: typeof raw.testModelId === 'string' ? raw.testModelId : '',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  }
}

export async function writeModelStore(store: ModelStore): Promise<void> {
  await writeJsonFileAtomic(PATH, store, { tmpPrefix: '.models-' })
}
