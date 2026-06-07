export interface SensitiveWordEntry {
  id: string
  word: string
  createdAt: number
  updatedAt: number
}

export interface SensitiveWordSet {
  id: string
  name: string
  entries: SensitiveWordEntry[]
  updatedAt: number
}

export interface SensitiveWordSetsStore {
  version: 2
  sets: SensitiveWordSet[]
}

export interface CompiledMatcher {
  ac?: import('modern-ahocorasick').default
  keyGraphemeLens?: Map<string, number>
  zw: string
}
