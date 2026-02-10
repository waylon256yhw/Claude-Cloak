import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ModelStore, ModelEntry } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'models.json')

function isValidEntry(e: unknown): e is ModelEntry {
  if (!e || typeof e !== 'object') return false
  const obj = e as Record<string, unknown>
  return typeof obj.id === 'string' && obj.id.length > 0 && typeof obj.created === 'number'
}

export class ModelStorage {
  private path: string

  constructor(path?: string) {
    this.path = path || process.env.MODEL_STORE_PATH || DEFAULT_PATH
  }

  async read(): Promise<ModelStore | null> {
    try {
      const data = await fs.readFile(this.path, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') return null
      const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
      return {
        entries: rawEntries.filter(isValidEntry),
        testModelId: typeof parsed.testModelId === 'string' ? parsed.testModelId : '',
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      console.error('Failed to read model store:', err)
      return null
    }
  }

  async write(store: ModelStore): Promise<void> {
    const dir = dirname(this.path)
    await fs.mkdir(dir, { recursive: true })
    const tmp = join(dir, `.models-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    const payload = JSON.stringify(store, null, 2)
    try {
      await fs.writeFile(tmp, payload, { mode: 0o644 })
      await fs.rename(tmp, this.path)
    } catch (err) {
      try { await fs.unlink(tmp) } catch {}
      throw err
    }
  }
}
