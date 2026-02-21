import { join } from 'node:path'
import { JsonStore } from '../utils/json-store.js'
import type { Settings } from './manager.js'

const DEFAULT_PATH = join(process.cwd(), 'data', 'settings.json')

export class SettingsStorage extends JsonStore<Settings> {
  constructor(path?: string) {
    super(path || process.env.SETTINGS_STORE_PATH || DEFAULT_PATH, {
      tmpPrefix: '.settings-',
    })
  }

  protected deserialize(raw: Record<string, unknown>): Settings | null {
    if (typeof raw.strictMode !== 'boolean' || typeof raw.normalizeParameters !== 'boolean') {
      return null
    }
    return { strictMode: raw.strictMode, normalizeParameters: raw.normalizeParameters }
  }
}
