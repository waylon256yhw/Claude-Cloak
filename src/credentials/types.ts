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
  apiKey: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function maskCredential(cred: Credential): CredentialSafe {
  return {
    ...cred,
    apiKey: cred.apiKey.length > 8 ? `...${cred.apiKey.slice(-4)}` : '****',
  }
}
