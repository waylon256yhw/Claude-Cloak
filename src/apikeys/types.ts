export interface ApiKey {
  id: string
  name: string
  key: string
  credentialId: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiKeySafe {
  id: string
  name: string
  keyPreview: string
  credentialId: string | null
  credentialName: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiKeyStore {
  keys: ApiKey[]
}

export interface CreateApiKeyInput {
  name: string
  credentialId?: string | null
}

export interface UpdateApiKeyInput {
  name?: string
  credentialId?: string | null
}

const KEY_PREFIX = 'cck-'
const PREVIEW_VISIBLE = 4

export function maskApiKey(key: ApiKey, credentialName: string | null): ApiKeySafe {
  const rawKey = key.key
  const preview = rawKey.length > KEY_PREFIX.length + PREVIEW_VISIBLE * 2
    ? `${rawKey.slice(0, KEY_PREFIX.length + PREVIEW_VISIBLE)}...${rawKey.slice(-PREVIEW_VISIBLE)}`
    : rawKey
  return {
    id: key.id,
    name: key.name,
    keyPreview: preview,
    credentialId: key.credentialId,
    credentialName,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }
}
