export interface SensitiveWordEntry {
  id: string
  word: string
  createdAt: number
  updatedAt: number
}

export interface SensitiveWordsStore {
  version: 1
  enabled: boolean
  updatedAt: number
  entries: SensitiveWordEntry[]
}

export interface CompiledMatcher {
  regex?: RegExp
  zw: string
}
