import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { ApiKeyStore } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'apikeys.json')

export class ApiKeyStorage {
  private path: string

  constructor(path?: string) {
    this.path = path || process.env.APIKEY_STORE_PATH || DEFAULT_PATH
  }

  async read(): Promise<ApiKeyStore> {
    try {
      const data = await fs.readFile(this.path, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid store format')
      }
      return {
        keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { keys: [] }
      }
      console.error('Failed to read API key store:', err)
      return { keys: [] }
    }
  }

  async write(store: ApiKeyStore): Promise<void> {
    const dir = dirname(this.path)
    await fs.mkdir(dir, { recursive: true })
    const tmp = join(dir, `.apikey-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    const payload = JSON.stringify(store, null, 2)
    try {
      await fs.writeFile(tmp, payload, { mode: 0o600 })
      await fs.rename(tmp, this.path)
    } catch (err) {
      try { await fs.unlink(tmp) } catch {}
      throw err
    }
  }
}
