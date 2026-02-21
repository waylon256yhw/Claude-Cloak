import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export interface JsonStoreOptions {
  fileMode?: number
  tmpPrefix?: string
}

export abstract class JsonStore<T> {
  protected path: string
  private fileMode: number
  private tmpPrefix: string

  constructor(path: string, options?: JsonStoreOptions) {
    this.path = path
    this.fileMode = options?.fileMode ?? 0o644
    this.tmpPrefix = options?.tmpPrefix ?? '.store-'
  }

  protected abstract deserialize(raw: Record<string, unknown>): T | null

  protected async readRaw(): Promise<Record<string, unknown> | null> {
    try {
      const data = await fs.readFile(this.path, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') return null
      return parsed
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Failed to read store ${this.path}:`, err)
      }
      return null
    }
  }

  async read(): Promise<T | null> {
    const raw = await this.readRaw()
    if (!raw) return null
    return this.deserialize(raw)
  }

  async write(data: T): Promise<void> {
    const dir = dirname(this.path)
    await fs.mkdir(dir, { recursive: true })
    const tmp = join(dir, `${this.tmpPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    const payload = JSON.stringify(data, null, 2)
    try {
      await fs.writeFile(tmp, payload, { mode: this.fileMode })
      await fs.rename(tmp, this.path)
    } catch (err) {
      try { await fs.unlink(tmp) } catch {}
      throw err
    }
  }
}
