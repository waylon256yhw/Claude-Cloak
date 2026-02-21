import { join } from 'node:path'
import { JsonStore } from '../utils/json-store.js'
import type { SensitiveWordsStore, SensitiveWordEntry } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'sensitive-words.json')

function isValidEntry(e: unknown): e is SensitiveWordEntry {
  if (!e || typeof e !== 'object') return false
  const obj = e as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.word === 'string' &&
    obj.word.length > 0 &&
    typeof obj.createdAt === 'number' &&
    typeof obj.updatedAt === 'number'
  )
}

function sanitizeEntries(raw: unknown[]): SensitiveWordEntry[] {
  const valid: SensitiveWordEntry[] = []
  for (const item of raw) {
    if (isValidEntry(item)) {
      valid.push(item)
    }
  }
  return valid
}

export class SensitiveWordsStorage extends JsonStore<SensitiveWordsStore> {
  constructor(path?: string) {
    super(path || process.env.SENSITIVE_WORDS_PATH || DEFAULT_PATH, {
      tmpPrefix: '.sw-',
    })
  }

  protected deserialize(raw: Record<string, unknown>): SensitiveWordsStore {
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
    return {
      version: 1,
      enabled: raw.enabled !== false,
      updatedAt: typeof raw.updatedAt === 'number' ? (raw.updatedAt as number) : Date.now(),
      entries: sanitizeEntries(rawEntries),
    }
  }
}
