import { randomUUID } from 'node:crypto'
import type { SensitiveWordEntry, SensitiveWordsStore, CompiledMatcher } from './types.js'
import { SensitiveWordsStorage } from './storage.js'
import { graphemes, graphemeLength, containsZW, ZW } from './grapheme.js'

const MAX_ENTRIES = 1000
const MAX_WORD_LENGTH = 100

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

class SensitiveWordsManager {
  private storage = new SensitiveWordsStorage()
  private store: SensitiveWordsStore | null = null
  private matcher: CompiledMatcher | null = null
  private initPromise: Promise<void> | null = null

  private async ensureLoaded(): Promise<void> {
    if (this.store) return
    if (!this.initPromise) {
      this.initPromise = this.load()
    }
    await this.initPromise
  }

  private async load(): Promise<void> {
    this.store = await this.storage.read()
    this.rebuildMatcher()
  }

  private async save(): Promise<void> {
    if (!this.store) return
    this.store.updatedAt = Date.now()
    await this.storage.write(this.store)
  }

  private rebuildMatcher(): void {
    if (!this.store || this.store.entries.length === 0) {
      this.matcher = { zw: ZW }
      return
    }

    const wordsWithLength = this.store.entries
      .map((e) => {
        const normalized = e.word.normalize('NFKC')
        return { word: normalized, len: graphemeLength(normalized) }
      })
      .filter((w) => w.len >= 2)

    const uniq = [...new Map(wordsWithLength.map((w) => [w.word.toLowerCase(), w])).values()]
    uniq.sort((a, b) => b.len - a.len)

    if (uniq.length === 0) {
      this.matcher = { zw: ZW }
      return
    }

    this.matcher = {
      regex: new RegExp(uniq.map((w) => escapeRegExp(w.word)).join('|'), 'giu'),
      zw: ZW,
    }
  }

  async isEnabled(): Promise<boolean> {
    await this.ensureLoaded()
    return this.store!.enabled
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.ensureLoaded()
    this.store!.enabled = enabled
    await this.save()
  }

  async getAll(): Promise<SensitiveWordEntry[]> {
    await this.ensureLoaded()
    return [...this.store!.entries]
  }

  async getStore(): Promise<SensitiveWordsStore> {
    await this.ensureLoaded()
    return { ...this.store!, entries: [...this.store!.entries] }
  }

  private validateWord(word: string): string | null {
    const trimmed = word.trim()
    if (trimmed.length > MAX_WORD_LENGTH) return null
    if (containsZW(trimmed)) return null
    const normalized = trimmed.normalize('NFKC')
    if (graphemeLength(normalized) < 2) return null
    return trimmed
  }

  private isDuplicate(word: string, excludeId?: string): boolean {
    const normalized = word.normalize('NFKC').toLowerCase()
    return this.store!.entries.some(
      (e) => e.id !== excludeId && e.word.normalize('NFKC').toLowerCase() === normalized
    )
  }

  async add(word: string): Promise<SensitiveWordEntry | null> {
    await this.ensureLoaded()

    if (this.store!.entries.length >= MAX_ENTRIES) return null

    const validated = this.validateWord(word)
    if (!validated) return null
    if (this.isDuplicate(validated)) return null

    const entry: SensitiveWordEntry = {
      id: randomUUID(),
      word: validated,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    this.store!.entries.push(entry)
    this.rebuildMatcher()
    await this.save()
    return entry
  }

  async addBatch(words: string[]): Promise<{ added: number; skipped: number }> {
    await this.ensureLoaded()

    let added = 0
    let skipped = 0

    for (const word of words) {
      if (this.store!.entries.length >= MAX_ENTRIES) {
        skipped += words.length - added - skipped
        break
      }

      const validated = this.validateWord(word)
      if (!validated) {
        skipped++
        continue
      }
      if (this.isDuplicate(validated)) {
        skipped++
        continue
      }

      this.store!.entries.push({
        id: randomUUID(),
        word: validated,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      added++
    }

    if (added > 0) {
      this.rebuildMatcher()
      await this.save()
    }

    return { added, skipped }
  }

  async update(id: string, word: string): Promise<SensitiveWordEntry | null> {
    await this.ensureLoaded()

    const idx = this.store!.entries.findIndex((e) => e.id === id)
    if (idx === -1) return null

    const validated = this.validateWord(word)
    if (!validated) return null
    if (this.isDuplicate(validated, id)) return null

    this.store!.entries[idx] = {
      ...this.store!.entries[idx],
      word: validated,
      updatedAt: Date.now(),
    }

    this.rebuildMatcher()
    await this.save()
    return this.store!.entries[idx]
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureLoaded()

    const idx = this.store!.entries.findIndex((e) => e.id === id)
    if (idx === -1) return false

    this.store!.entries.splice(idx, 1)
    this.rebuildMatcher()
    await this.save()
    return true
  }

  async clear(): Promise<number> {
    await this.ensureLoaded()

    const count = this.store!.entries.length
    this.store!.entries = []
    this.rebuildMatcher()
    await this.save()
    return count
  }

  async getCompiledMatcher(): Promise<CompiledMatcher> {
    await this.ensureLoaded()
    return this.matcher!
  }
}

export const sensitiveWordsManager = new SensitiveWordsManager()
