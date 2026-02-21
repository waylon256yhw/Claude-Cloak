import { join } from 'node:path'
import { JsonStore } from '../utils/json-store.js'
import type { ApiKeyStore } from './types.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'apikeys.json')

export class ApiKeyStorage extends JsonStore<ApiKeyStore> {
  constructor(path?: string) {
    super(path || process.env.APIKEY_STORE_PATH || DEFAULT_PATH, {
      fileMode: 0o600,
      tmpPrefix: '.apikey-',
    })
  }

  protected deserialize(raw: Record<string, unknown>): ApiKeyStore {
    return { keys: Array.isArray(raw.keys) ? raw.keys : [] }
  }
}
