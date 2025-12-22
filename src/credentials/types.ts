export interface Credential {
  id: string
  name: string
  targetUrl: string
  apiKey: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CredentialStore {
  credentials: Credential[]
  activeId: string | null
}

export interface CreateCredentialInput {
  name: string
  targetUrl: string
  apiKey: string
}

export interface UpdateCredentialInput {
  name?: string
  targetUrl?: string
  apiKey?: string
}

export interface CredentialSafe {
  id: string
  name: string
  targetUrl: string
  keyMasked: string
  keyLast4: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function maskCredential(cred: Credential): CredentialSafe {
  const last4 = cred.apiKey.length >= 4 ? cred.apiKey.slice(-4) : cred.apiKey
  return {
    id: cred.id,
    name: cred.name,
    targetUrl: cred.targetUrl,
    keyMasked: cred.apiKey.length > 8 ? `...${last4}` : '****',
    keyLast4: last4,
    isActive: cred.isActive,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  }
}
