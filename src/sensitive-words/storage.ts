import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFileAtomic } from '../utils/json-store.js'
import type { SensitiveWordSetsStore, SensitiveWordEntry, SensitiveWordSet } from './types.js'

const PATH = process.env.SENSITIVE_WORDS_PATH || join(process.cwd(), 'data', 'sensitive-words.json')

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
  return raw.filter(isValidEntry)
}

function sanitizeSet(raw: Record<string, unknown>): SensitiveWordSet {
  return {
    id: typeof raw.id === 'string' ? raw.id : randomUUID(),
    name: typeof raw.name === 'string' ? raw.name : 'Unnamed',
    entries: Array.isArray(raw.entries) ? sanitizeEntries(raw.entries) : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

export async function readSensitiveWordsStore(): Promise<SensitiveWordSetsStore | null> {
  const raw = await readJsonFile<Record<string, unknown>>(PATH)
  if (!raw) return null
  const sets = Array.isArray(raw.sets) ? (raw.sets as Record<string, unknown>[]).map(sanitizeSet) : []
  return { version: 2, sets }
}

export async function writeSensitiveWordsStore(store: SensitiveWordSetsStore): Promise<void> {
  await writeJsonFileAtomic(PATH, store, { tmpPrefix: '.sw-' })
}
