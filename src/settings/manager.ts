import { readSettings, writeSettings } from './storage.js'
import { InvalidInputError } from '../utils/errors.js'
import { isValidCliVersion, stripVersionPrefix } from '../services/cli-versions.js'

const DEFAULT_CLI_VERSION = '2.1.167'

function normalizeCliVersion(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = stripVersionPrefix(raw)
  return isValidCliVersion(cleaned) ? cleaned : null
}

export interface Settings {
  strictMode: boolean
  normalizeParameters: boolean
  cliVersion: string
}

class SettingsManager {
  private settings: Settings

  constructor() {
    this.settings = {
      strictMode: process.env.STRICT_MODE !== 'false',
      normalizeParameters: process.env.NORMALIZE_PARAMS !== 'false',
      cliVersion: normalizeCliVersion(process.env.CLI_VERSION) ?? DEFAULT_CLI_VERSION,
    }
  }

  async init(): Promise<void> {
    const stored = await readSettings()
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
      const cleaned = normalizeCliVersion(patch.cliVersion)
      if (!cleaned) {
        throw new InvalidInputError('cliVersion must be a valid semver (x.y.z)')
      }
      this.settings.cliVersion = cleaned
    }
    await writeSettings(this.settings)
    return this.getAll()
  }
}

export const settingsManager = new SettingsManager()
