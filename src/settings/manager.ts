export interface Settings {
  strictMode: boolean
  normalizeParameters: boolean
}

class SettingsManager {
  private settings: Settings

  constructor() {
    this.settings = {
      strictMode: process.env.STRICT_MODE !== 'false',
      normalizeParameters: process.env.NORMALIZE_PARAMS !== 'false',
    }
  }

  getAll(): Settings {
    return { ...this.settings }
  }

  isStrictMode(): boolean {
    return this.settings.strictMode
  }

  setStrictMode(value: boolean): void {
    this.settings.strictMode = value
  }

  getNormalizeParameters(): boolean {
    return this.settings.normalizeParameters
  }

  update(patch: Partial<Settings>): Settings {
    if (patch.strictMode !== undefined) {
      if (typeof patch.strictMode !== 'boolean') {
        throw new Error('strictMode must be a boolean')
      }
      this.settings.strictMode = patch.strictMode
    }
    if (patch.normalizeParameters !== undefined) {
      if (typeof patch.normalizeParameters !== 'boolean') {
        throw new Error('normalizeParameters must be a boolean')
      }
      this.settings.normalizeParameters = patch.normalizeParameters
    }
    return this.getAll()
  }
}

export const settingsManager = new SettingsManager()
