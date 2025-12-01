export interface Settings {
  strictMode: boolean
}

class SettingsManager {
  private settings: Settings

  constructor() {
    this.settings = {
      strictMode: process.env.STRICT_MODE !== 'false',
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

  update(patch: Partial<Settings>): Settings {
    if (patch.strictMode !== undefined) {
      if (typeof patch.strictMode !== 'boolean') {
        throw new Error('strictMode must be a boolean')
      }
      this.settings.strictMode = patch.strictMode
    }
    return this.getAll()
  }
}

export const settingsManager = new SettingsManager()
