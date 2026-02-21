import { join } from 'node:path'
import { JsonStore } from '../utils/json-store.js'
import type { Credential, CredentialStore } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'credentials.json')

export class CredentialStorage extends JsonStore<CredentialStore> {
  constructor(path?: string) {
    super(path || process.env.CREDENTIAL_STORE_PATH || DEFAULT_PATH, {
      fileMode: 0o600,
      tmpPrefix: '.cred-',
    })
  }

  protected deserialize(raw: Record<string, unknown>): CredentialStore {
    const rawCreds = Array.isArray(raw.credentials) ? raw.credentials : []
    for (const cred of rawCreds) {
      if (cred && typeof cred === 'object' && 'isActive' in cred && !('enabled' in cred)) {
        (cred as Record<string, unknown>).enabled = true
        delete (cred as Record<string, unknown>).isActive
      }
    }
    return { credentials: rawCreds as Credential[] }
  }

  async read(): Promise<CredentialStore | null> {
    const raw = await this.readRaw()
    if (!raw) return null
    const needsMigration = 'activeId' in raw ||
      (Array.isArray(raw.credentials) && raw.credentials.some(
        (c: unknown) => c && typeof c === 'object' && 'isActive' in (c as Record<string, unknown>)
      ))
    const store = this.deserialize(raw)
    if (needsMigration) {
      await this.write(store)
    }
    return store
  }
}
