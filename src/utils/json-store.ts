import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export interface WriteOpts {
  fileMode?: number
  tmpPrefix?: string
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return (await file.json()) as T
  } catch (err) {
    console.error(`Failed to read ${path}:`, err)
    return null
  }
}

export async function writeJsonFileAtomic(path: string, data: unknown, opts: WriteOpts = {}): Promise<void> {
  const { fileMode = 0o644, tmpPrefix = '.store-' } = opts
  const dir = dirname(path)
  await fs.mkdir(dir, { recursive: true })
  const tmp = join(dir, `${tmpPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  const payload = JSON.stringify(data, null, 2)
  try {
    await fs.writeFile(tmp, payload, { mode: fileMode })
    await fs.rename(tmp, path)
  } catch (err) {
    try {
      await fs.unlink(tmp)
    } catch {}
    throw err
  }
}
