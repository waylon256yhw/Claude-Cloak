import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from '../utils/json-store.js'
import { isValidCliVersion, stripVersionPrefix } from '../services/cli-versions.js'
import type { Settings } from './manager.js'

const PATH = process.env.SETTINGS_STORE_PATH || join(process.cwd(), 'data', 'settings.json')
const DEFAULT_CLI_VERSION = '2.1.167'

export async function readSettings(): Promise<Settings | null> {
  const raw = await readJsonFile<Record<string, unknown>>(PATH)
  if (!raw) return null
  if (typeof raw.strictMode !== 'boolean' || typeof raw.normalizeParameters !== 'boolean') return null
  const stored = typeof raw.cliVersion === 'string' ? stripVersionPrefix(raw.cliVersion) : ''
  const envV = stripVersionPrefix(process.env.CLI_VERSION ?? '')
  const cliVersion = isValidCliVersion(stored) ? stored : isValidCliVersion(envV) ? envV : DEFAULT_CLI_VERSION
  return { strictMode: raw.strictMode, normalizeParameters: raw.normalizeParameters, cliVersion }
}

export async function writeSettings(settings: Settings): Promise<void> {
  await writeJsonFileAtomic(PATH, settings, { tmpPrefix: '.settings-' })
}
