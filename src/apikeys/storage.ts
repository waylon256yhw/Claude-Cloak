import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../utils/json-store.js'
import type { ApiKeyStore } from './types.js'

const PATH = process.env.APIKEY_STORE_PATH || join(process.cwd(), 'data', 'apikeys.json')

export async function readApiKeyStore(): Promise<ApiKeyStore | null> {
  const raw = await readJsonFile<Record<string, unknown>>(PATH)
  if (!raw) return null
  return { keys: Array.isArray(raw.keys) ? raw.keys : [] }
}

export async function writeApiKeyStore(store: ApiKeyStore): Promise<void> {
  await writeJsonFileAtomic(PATH, store, { fileMode: 0o600, tmpPrefix: '.apikey-' })
}
