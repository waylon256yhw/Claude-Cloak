import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../utils/json-store.js'
import type { SensitiveWordSetsStore, SensitiveWordEntry, SensitiveWordSet } from './types.js'

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
    if (isValidEntry(item)) valid.push(item)
  }
  return valid
}

function sanitizeSet(raw: Record<string, unknown>): SensitiveWordSet {
  return {
    id: typeof raw.id === 'string' ? raw.id : randomUUID(),
    name: typeof raw.name === 'string' ? raw.name : 'Unnamed',
    entries: Array.isArray(raw.entries) ? sanitizeEntries(raw.entries) : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

export interface MigrationInfo {
  migrated: boolean
  wasEnabled: boolean
  defaultSetId: string | null
}

export class SensitiveWordsStorage extends JsonStore<SensitiveWordSetsStore> {
  private migrationInfo: MigrationInfo = { migrated: false, wasEnabled: false, defaultSetId: null }

  constructor(path?: string) {
    super(path || process.env.SENSITIVE_WORDS_PATH || DEFAULT_PATH, {
      tmpPrefix: '.sw-',
    })
  }

  getMigrationInfo(): MigrationInfo {
    return { ...this.migrationInfo }
  }

  protected deserialize(raw: Record<string, unknown>): SensitiveWordSetsStore {
    if (raw.version === 2 && Array.isArray(raw.sets)) {
      return {
        version: 2,
        sets: (raw.sets as Record<string, unknown>[]).map(sanitizeSet),
      }
    }

    const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
    const entries = sanitizeEntries(rawEntries)
    const wasEnabled = raw.enabled !== false
    const defaultSetId = entries.length > 0 ? randomUUID() : null
    const sets: SensitiveWordSet[] = defaultSetId
      ? [{
          id: defaultSetId,
          name: 'Default',
          entries,
          updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
        }]
      : []

    this.migrationInfo = { migrated: true, wasEnabled, defaultSetId }
    return { version: 2, sets }
  }

  async read(): Promise<SensitiveWordSetsStore | null> {
    const raw = await this.readRaw()
    if (!raw) return null
    const store = this.deserialize(raw)
    if (this.migrationInfo.migrated) {
      await this.write(store)
    }
    return store
  }
}
