import { SettingsStorage } from './storage.js'
import { InvalidInputError } from '../utils/errors.js'

export interface Settings {
  strictMode: boolean
  normalizeParameters: boolean
}

class SettingsManager {
  private settings: Settings
  private storage = new SettingsStorage()

  constructor() {
    this.settings = {
      strictMode: process.env.STRICT_MODE !== 'false',
      normalizeParameters: process.env.NORMALIZE_PARAMS !== 'false',
    }
  }

  async init(): Promise<void> {
    const stored = await this.storage.read()
    if (stored) {
      this.settings = stored
    }
  }

  getAll(): Settings {
    return { ...this.settings }
  }

  isStrictMode(): boolean {
    return this.settings.strictMode
  }

  async setStrictMode(value: boolean): Promise<void> {
    this.settings.strictMode = value
    await this.storage.write(this.settings)
  }

  getNormalizeParameters(): boolean {
    return this.settings.normalizeParameters
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    if (patch.strictMode !== undefined) {
      if (typeof patch.strictMode !== 'boolean') {
        throw new InvalidInputError('strictMode must be a boolean')
      }
      this.settings.strictMode = patch.strictMode
    }
    if (patch.normalizeParameters !== undefined) {
      if (typeof patch.normalizeParameters !== 'boolean') {
        throw new InvalidInputError('normalizeParameters must be a boolean')
      }
      this.settings.normalizeParameters = patch.normalizeParameters
    }
    await this.storage.write(this.settings)
    return this.getAll()
  }
}

export const settingsManager = new SettingsManager()
