import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { SensitiveWordsStore, SensitiveWordEntry } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'sensitive-words.json')

const DEFAULT_STORE: SensitiveWordsStore = {
  version: 1,
  enabled: true,
  updatedAt: Date.now(),
  entries: [],
}

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

export class SensitiveWordsStorage {
  private path: string

  constructor(path?: string) {
    this.path = path || process.env.SENSITIVE_WORDS_PATH || DEFAULT_PATH
  }

  async read(): Promise<SensitiveWordsStore> {
    try {
      const data = await fs.readFile(this.path, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') {
        return { ...DEFAULT_STORE }
      }
      const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
      return {
        version: 1,
        enabled: parsed.enabled !== false,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        entries: sanitizeEntries(rawEntries),
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { ...DEFAULT_STORE }
      }
      console.error('Failed to read sensitive words store:', err)
      return { ...DEFAULT_STORE }
    }
  }

  async write(store: SensitiveWordsStore): Promise<void> {
    const dir = dirname(this.path)
    await fs.mkdir(dir, { recursive: true })
    const tmp = join(dir, `.sw-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    const payload = JSON.stringify(store, null, 2)
    try {
      await fs.writeFile(tmp, payload, { mode: 0o600 })
      await fs.rename(tmp, this.path)
    } catch (err) {
      try {
        await fs.unlink(tmp)
      } catch {}
      throw err
    }
  }
}
