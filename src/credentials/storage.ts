import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { CredentialStore } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'credentials.json')

export class CredentialStorage {
  private path: string

  constructor(path?: string) {
    this.path = path || process.env.CREDENTIAL_STORE_PATH || DEFAULT_PATH
  }

  async read(): Promise<CredentialStore> {
    try {
      const data = await fs.readFile(this.path, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid store format')
      }

      const credentials = Array.isArray(parsed.credentials) ? parsed.credentials : []
      let needsMigration = false

      if ('activeId' in parsed) {
        needsMigration = true
      }

      for (const cred of credentials) {
        if ('isActive' in cred && !('enabled' in cred)) {
          cred.enabled = true
          delete cred.isActive
          needsMigration = true
        }
      }

      const store: CredentialStore = { credentials }

      if (needsMigration) {
        await this.write(store)
      }

      return store
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { credentials: [] }
      }
      console.error('Failed to read credential store:', err)
      return { credentials: [] }
    }
  }

  async write(store: CredentialStore): Promise<void> {
    const dir = dirname(this.path)
    await fs.mkdir(dir, { recursive: true })
    const tmp = join(dir, `.cred-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
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
