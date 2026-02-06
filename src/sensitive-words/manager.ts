import { randomUUID } from 'node:crypto'
import AhoCorasick from 'modern-ahocorasick'
import type { SensitiveWordEntry, SensitiveWordsStore, CompiledMatcher } from './types.js'
import { SensitiveWordsStorage } from './storage.js'
import { graphemeLength, containsZW, ZW } from './grapheme.js'

const MAX_ENTRIES = Math.max(100, parseInt(process.env.SENSITIVE_WORDS_MAX_ENTRIES || '20000', 10) || 20000)
const MAX_WORD_LENGTH = 100

class SensitiveWordsManager {
  private storage = new SensitiveWordsStorage()
  private store: SensitiveWordsStore | null = null
  private matcher: CompiledMatcher | null = null
  private initPromise: Promise<void> | null = null
  private wordIndex: Map<string, string> = new Map() // normalized -> entry id

  private normalizeForIndex(word: string): string {
    return word.normalize('NFKC').toLowerCase()
  }

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
    this.wordIndex.clear()

    if (!this.store || this.store.entries.length === 0) {
      this.matcher = { zw: ZW }
      return
    }

    const seen = new Set<string>()
    const keywords: string[] = []
    const keyGraphemeLens = new Map<string, number>()

    for (const entry of this.store.entries) {
      const normalized = entry.word.normalize('NFKC')
      const len = graphemeLength(normalized)
      this.wordIndex.set(this.normalizeForIndex(entry.word), entry.id)
      if (len >= 2) {
        const lower = normalized.toLowerCase()
        if (!seen.has(lower)) {
          seen.add(lower)
          keywords.push(lower)
          keyGraphemeLens.set(lower, len)
        }
      }
    }

    if (keywords.length === 0) {
      this.matcher = { zw: ZW }
      return
    }

    this.matcher = { ac: new AhoCorasick(keywords), keyGraphemeLens, zw: ZW }
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
    const normalized = this.normalizeForIndex(word)
    const existingId = this.wordIndex.get(normalized)
    if (!existingId) return false
    return existingId !== excludeId
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
    const batchSeen = new Set<string>() // Track duplicates within batch

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

      const normalized = this.normalizeForIndex(validated)
      if (this.isDuplicate(validated) || batchSeen.has(normalized)) {
        skipped++
        continue
      }

      batchSeen.add(normalized)
      const id = randomUUID()
      this.store!.entries.push({
        id,
        word: validated,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      this.wordIndex.set(normalized, id) // Update index immediately
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

  async removeBatch(ids: string[]): Promise<number> {
    await this.ensureLoaded()

    const idSet = new Set(ids)
    const originalLength = this.store!.entries.length
    this.store!.entries = this.store!.entries.filter((e) => !idSet.has(e.id))
    const removed = originalLength - this.store!.entries.length

    if (removed > 0) {
      this.rebuildMatcher()
      await this.save()
    }

    return removed
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
