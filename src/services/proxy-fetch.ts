import { InvalidInputError } from '../utils/errors.js'

export interface ValidateUrlOpts {
  stripTrailingSlash?: boolean
}

export function validateHttpUrl(raw: string, label: string, opts?: ValidateUrlOpts): string {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new InvalidInputError(`Invalid ${label}: malformed URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidInputError(`Invalid ${label}: only http/https supported, got ${url.protocol.replace(':', '')}`)
  }
  return opts?.stripTrailingSlash ? url.origin + url.pathname.replace(/\/+$/, '') : trimmed
}

export function resolveProxyUrl(credentialProxy?: string | null, globalProxy?: string | null): string | undefined {
  if (credentialProxy) return credentialProxy
  if (globalProxy) return globalProxy
  return undefined
}

export function proxyFetch(url: string, init: RequestInit, proxyUrl?: string): Promise<Response> {
  if (proxyUrl) {
    return fetch(url, { ...init, proxy: proxyUrl } as RequestInit)
  }
  return fetch(url, init)
}
