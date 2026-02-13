export function validateProxyUrl(raw: string): string {
  const trimmed = raw.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Invalid proxy URL: malformed URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid proxy URL: only http/https supported, got ${url.protocol.replace(':', '')}`)
  }
  return trimmed
}

export function resolveProxyUrl(
  credentialProxy?: string | null,
  globalProxy?: string | null,
): string | undefined {
  if (credentialProxy) return credentialProxy
  if (globalProxy) return globalProxy
  return undefined
}

export function proxyFetch(
  url: string,
  init: RequestInit,
  proxyUrl?: string,
): Promise<Response> {
  if (proxyUrl) {
    return fetch(url, { ...init, proxy: proxyUrl } as RequestInit)
  }
  return fetch(url, init)
}
