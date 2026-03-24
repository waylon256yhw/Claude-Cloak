import { SettingsStorage } from './storage.js'
import { InvalidInputError } from '../utils/errors.js'

export interface Settings {
  strictMode: boolean
  normalizeParameters: boolean
  cliVersion: string
}

class SettingsManager {
  private settings: Settings
  private storage = new SettingsStorage()

  constructor() {
    this.settings = {
      strictMode: process.env.STRICT_MODE !== 'false',
      normalizeParameters: process.env.NORMALIZE_PARAMS !== 'false',
      cliVersion: (() => {
        const v = process.env.CLI_VERSION?.replace(/^v/, '')
        return v && /^\d+\.\d+\.\d+$/.test(v) ? v : '2.1.80'
      })(),
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

  getCliVersion(): string {
    return this.settings.cliVersion
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
    if (patch.cliVersion !== undefined) {
      if (typeof patch.cliVersion !== 'string') {
        throw new InvalidInputError('cliVersion must be a string')
      }
      const cleaned = patch.cliVersion.replace(/^v/, '')
      if (!/^\d+\.\d+\.\d+$/.test(cleaned)) {
        throw new InvalidInputError('cliVersion must be a valid semver (x.y.z)')
      }
      this.settings.cliVersion = cleaned
    }
    await this.storage.write(this.settings)
    return this.getAll()
  }
}

export const settingsManager = new SettingsManager()
