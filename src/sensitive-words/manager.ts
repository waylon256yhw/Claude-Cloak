import { randomUUID } from 'node:crypto'
import AhoCorasick from 'modern-ahocorasick'
import type { SensitiveWordEntry, SensitiveWordSet, SensitiveWordSetsStore, CompiledMatcher } from './types.js'
import { SensitiveWordsStorage, type MigrationInfo } from './storage.js'
import { graphemeLength, containsZW, ZW } from './grapheme.js'
import { Mutex } from '../utils/mutex.js'

const MAX_ENTRIES_PER_SET = Math.max(100, parseInt(process.env.SENSITIVE_WORDS_MAX_ENTRIES || '20000', 10) || 20000)
const MAX_WORD_LENGTH = 100
const EMPTY_MATCHER: CompiledMatcher = { zw: ZW }

function buildMatcher(entries: SensitiveWordEntry[]): CompiledMatcher {
  if (entries.length === 0) return EMPTY_MATCHER

  const seen = new Set<string>()
  const keywords: string[] = []
  const keyGraphemeLens = new Map<string, number>()

  for (const entry of entries) {
    const normalized = entry.word.normalize('NFKC')
    const len = graphemeLength(normalized)
    if (len >= 2) {
      const lower = normalized.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        keywords.push(lower)
        keyGraphemeLens.set(lower, len)
      }
    }
  }

  if (keywords.length === 0) return EMPTY_MATCHER
  return { ac: new AhoCorasick(keywords), keyGraphemeLens, zw: ZW }
}

function mergeMatchers(matchers: CompiledMatcher[]): CompiledMatcher {
  const allKeywords: string[] = []
  const mergedLens = new Map<string, number>()
  const seen = new Set<string>()

  for (const m of matchers) {
    if (!m.ac || !m.keyGraphemeLens) continue
    for (const [key, len] of m.keyGraphemeLens) {
      if (!seen.has(key)) {
        seen.add(key)
        allKeywords.push(key)
        mergedLens.set(key, len)
      }
    }
  }

  if (allKeywords.length === 0) return EMPTY_MATCHER
  return { ac: new AhoCorasick(allKeywords), keyGraphemeLens: mergedLens, zw: ZW }
}

class SensitiveWordsManager {
  private storage = new SensitiveWordsStorage()
  private store: SensitiveWordSetsStore | null = null
  private initPromise: Promise<void> | null = null
  private mutex = new Mutex()

  private setMatcherCache = new Map<string, CompiledMatcher>()
  private mergedMatcherCache = new Map<string, CompiledMatcher>()
  private setIdToMergedKeys = new Map<string, Set<string>>()

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
    this.store = (await this.storage.read()) ?? { version: 2, sets: [] }
  }

  getMigrationInfo(): MigrationInfo {
    return this.storage.getMigrationInfo()
  }

  private async save(): Promise<void> {
    if (!this.store) return
    await this.storage.write(this.store)
  }

  private getSetMatcher(set: SensitiveWordSet): CompiledMatcher {
    let cached = this.setMatcherCache.get(set.id)
    if (cached) return cached
    cached = buildMatcher(set.entries)
    this.setMatcherCache.set(set.id, cached)
    return cached
  }

  private invalidateSet(setId: string): void {
    this.setMatcherCache.delete(setId)
    const mergedKeys = this.setIdToMergedKeys.get(setId)
    if (mergedKeys) {
      for (const key of mergedKeys) {
        this.mergedMatcherCache.delete(key)
      }
      this.setIdToMergedKeys.delete(setId)
    }
  }

  getMergedMatcher(wordSetIds: string[]): CompiledMatcher {
    if (wordSetIds.length === 0 || !this.store) return EMPTY_MATCHER

    const sorted = [...wordSetIds].sort()
    const cacheKey = sorted.join('|')

    let cached = this.mergedMatcherCache.get(cacheKey)
    if (cached) return cached

    if (sorted.length === 1) {
      const set = this.store.sets.find((s) => s.id === sorted[0])
      if (!set) return EMPTY_MATCHER
      cached = this.getSetMatcher(set)
    } else {
      const matchers: CompiledMatcher[] = []
      for (const id of sorted) {
        const set = this.store.sets.find((s) => s.id === id)
        if (set) matchers.push(this.getSetMatcher(set))
      }
      cached = matchers.length > 0 ? mergeMatchers(matchers) : EMPTY_MATCHER
    }

    this.mergedMatcherCache.set(cacheKey, cached)
    for (const id of sorted) {
      let keys = this.setIdToMergedKeys.get(id)
      if (!keys) {
        keys = new Set()
        this.setIdToMergedKeys.set(id, keys)
      }
      keys.add(cacheKey)
    }

    return cached
  }

  // --- Word Set CRUD ---

  async getAllSets(): Promise<SensitiveWordSet[]> {
    await this.ensureLoaded()
    return this.store!.sets.map((s) => ({ ...s, entries: [...s.entries] }))
  }

  async getSetById(id: string): Promise<SensitiveWordSet | undefined> {
    await this.ensureLoaded()
    const set = this.store!.sets.find((s) => s.id === id)
    return set ? { ...set, entries: [...set.entries] } : undefined
  }

  async createSet(name: string): Promise<SensitiveWordSet> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set: SensitiveWordSet = {
        id: randomUUID(),
        name: name.trim(),
        entries: [],
        updatedAt: Date.now(),
      }
      this.store!.sets.push(set)
      await this.save()
      return { ...set, entries: [] }
    } finally {
      this.mutex.release()
    }
  }

  async updateSet(id: string, name: string): Promise<SensitiveWordSet | null> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === id)
      if (!set) return null
      set.name = name.trim()
      set.updatedAt = Date.now()
      await this.save()
      return { ...set, entries: [...set.entries] }
    } finally {
      this.mutex.release()
    }
  }

  async removeSet(id: string): Promise<boolean> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const idx = this.store!.sets.findIndex((s) => s.id === id)
      if (idx === -1) return false
      this.store!.sets.splice(idx, 1)
      this.invalidateSet(id)
      await this.save()
      return true
    } finally {
      this.mutex.release()
    }
  }

  // --- Word CRUD (scoped to a set) ---

  private validateWord(word: string): string | null {
    const trimmed = word.trim()
    if (trimmed.length > MAX_WORD_LENGTH) return null
    if (containsZW(trimmed)) return null
    const normalized = trimmed.normalize('NFKC')
    if (graphemeLength(normalized) < 2) return null
    return trimmed
  }

  private isDuplicateInSet(set: SensitiveWordSet, word: string, excludeId?: string): boolean {
    const normalized = this.normalizeForIndex(word)
    for (const entry of set.entries) {
      if (entry.id === excludeId) continue
      if (this.normalizeForIndex(entry.word) === normalized) return true
    }
    return false
  }

  async getWords(setId: string): Promise<SensitiveWordEntry[] | null> {
    await this.ensureLoaded()
    const set = this.store!.sets.find((s) => s.id === setId)
    if (!set) return null
    return [...set.entries]
  }

  async addWord(setId: string, word: string): Promise<SensitiveWordEntry | null> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === setId)
      if (!set) return null
      if (set.entries.length >= MAX_ENTRIES_PER_SET) return null
      const validated = this.validateWord(word)
      if (!validated) return null
      if (this.isDuplicateInSet(set, validated)) return null

      const entry: SensitiveWordEntry = {
        id: randomUUID(),
        word: validated,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set.entries.push(entry)
      set.updatedAt = Date.now()
      this.invalidateSet(setId)
      await this.save()
      return entry
    } finally {
      this.mutex.release()
    }
  }

  async addWordBatch(setId: string, words: string[]): Promise<{ added: number; skipped: number } | null> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === setId)
      if (!set) return null

      let added = 0
      let skipped = 0
      const batchSeen = new Set<string>()

      for (const word of words) {
        if (set.entries.length >= MAX_ENTRIES_PER_SET) {
          skipped += words.length - added - skipped
          break
        }

        const validated = this.validateWord(word)
        if (!validated) { skipped++; continue }

        const normalized = this.normalizeForIndex(validated)
        if (this.isDuplicateInSet(set, validated) || batchSeen.has(normalized)) { skipped++; continue }

        batchSeen.add(normalized)
        set.entries.push({
          id: randomUUID(),
          word: validated,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        added++
      }

      if (added > 0) {
        set.updatedAt = Date.now()
        this.invalidateSet(setId)
        await this.save()
      }

      return { added, skipped }
    } finally {
      this.mutex.release()
    }
  }

  async updateWord(setId: string, wordId: string, word: string): Promise<SensitiveWordEntry | null> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === setId)
      if (!set) return null
      const idx = set.entries.findIndex((e) => e.id === wordId)
      if (idx === -1) return null

      const validated = this.validateWord(word)
      if (!validated) return null
      if (this.isDuplicateInSet(set, validated, wordId)) return null

      set.entries[idx] = { ...set.entries[idx], word: validated, updatedAt: Date.now() }
      set.updatedAt = Date.now()
      this.invalidateSet(setId)
      await this.save()
      return set.entries[idx]
    } finally {
      this.mutex.release()
    }
  }

  async removeWord(setId: string, wordId: string): Promise<boolean> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === setId)
      if (!set) return false
      const idx = set.entries.findIndex((e) => e.id === wordId)
      if (idx === -1) return false

      set.entries.splice(idx, 1)
      set.updatedAt = Date.now()
      this.invalidateSet(setId)
      await this.save()
      return true
    } finally {
      this.mutex.release()
    }
  }

  async clearWords(setId: string): Promise<number | null> {
    await this.mutex.acquire()
    try {
      await this.ensureLoaded()
      const set = this.store!.sets.find((s) => s.id === setId)
      if (!set) return null

      const count = set.entries.length
      set.entries = []
      set.updatedAt = Date.now()
      this.invalidateSet(setId)
      await this.save()
      return count
    } finally {
      this.mutex.release()
    }
  }

  unbindWordSet(setId: string, credentials: { wordSetIds: string[] }[]): void {
    for (const cred of credentials) {
      const idx = cred.wordSetIds.indexOf(setId)
      if (idx !== -1) cred.wordSetIds.splice(idx, 1)
    }
  }
}

export const sensitiveWordsManager = new SensitiveWordsManager()
