export interface ModelEntry {
  id: string
  created: number
}

export interface ModelStore {
  entries: ModelEntry[]
  testModelId: string
  updatedAt: string
}
