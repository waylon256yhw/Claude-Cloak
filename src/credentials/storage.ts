import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../utils/json-store.js'
import type { Credential, CredentialStore } from './types.js'

const PATH = process.env.CREDENTIAL_STORE_PATH || join(process.cwd(), 'data', 'credentials.json')

function deserialize(raw: Record<string, unknown>): CredentialStore {
  const rawCreds = Array.isArray(raw.credentials) ? raw.credentials : []
  for (const cred of rawCreds) {
    if (cred && typeof cred === 'object') {
      const obj = cred as Record<string, unknown>
      if ('isActive' in obj && !('enabled' in obj)) {
        obj.enabled = true
        delete obj.isActive
      }
      if (!Array.isArray(obj.wordSetIds)) obj.wordSetIds = []
    }
  }
  return { credentials: rawCreds as Credential[] }
}

function needsMigration(raw: Record<string, unknown>): boolean {
  if ('activeId' in raw) return true
  if (!Array.isArray(raw.credentials)) return false
  return raw.credentials.some((c: unknown) => {
    if (!c || typeof c !== 'object') return false
    const obj = c as Record<string, unknown>
    return 'isActive' in obj || !Array.isArray(obj.wordSetIds)
  })
}

export async function readCredentialStore(): Promise<CredentialStore | null> {
  const raw = await readJsonFile<Record<string, unknown>>(PATH)
  if (!raw) return null
  const store = deserialize(raw)
  if (needsMigration(raw)) await writeCredentialStore(store)
  return store
}

export async function writeCredentialStore(store: CredentialStore): Promise<void> {
  await writeJsonFileAtomic(PATH, store, { fileMode: 0o600, tmpPrefix: '.cred-' })
}
