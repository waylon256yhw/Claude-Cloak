export interface Credential {
  id: string
  name: string
  targetUrl: string
  apiKey: string
  proxyUrl?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CredentialStore {
  credentials: Credential[]
}

export interface CreateCredentialInput {
  name: string
  targetUrl: string
  apiKey: string
  proxyUrl?: string | null
}

export interface UpdateCredentialInput {
  name?: string
  targetUrl?: string
  apiKey?: string
  proxyUrl?: string | null
}

export interface CredentialSafe {
  id: string
  name: string
  targetUrl: string
  keyMasked: string
  keyLast4: string
  proxyUrl?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

const MIN_KEY_LENGTH_FOR_MASKING = 8
const VISIBLE_KEY_SUFFIX_LENGTH = 4

export function maskCredential(cred: Credential): CredentialSafe {
  const keyLength = cred.apiKey.length
  const last4 = keyLength >= MIN_KEY_LENGTH_FOR_MASKING
    ? cred.apiKey.slice(-VISIBLE_KEY_SUFFIX_LENGTH)
    : ''
  return {
    id: cred.id,
    name: cred.name,
    targetUrl: cred.targetUrl,
    keyMasked: keyLength >= MIN_KEY_LENGTH_FOR_MASKING ? `...${last4}` : '****',
    keyLast4: last4,
    proxyUrl: cred.proxyUrl ? maskProxyUrl(cred.proxyUrl) : cred.proxyUrl,
    enabled: cred.enabled,
    createdAt: cred.createdAt,
    updatedAt: cred.updatedAt,
  }
}

function maskProxyUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.username || url.password) {
      url.username = '***'
      url.password = '***'
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}
