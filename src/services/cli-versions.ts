const GITHUB_RELEASES_URL = 'https://api.github.com/repos/anthropics/claude-code/releases'
const FETCH_TIMEOUT = 5000
const CACHE_TTL = 60 * 60 * 1000

const BUNDLED_VERSIONS = ['2.1.81', '2.1.80', '2.1.77']
const SEMVER_RE = /^\d+\.\d+\.\d+$/

interface VersionCache {
  versions: string[]
  fetchedAt: number
}

export interface CliVersionsResponse {
  versions: string[]
  selected: string
  source: 'github' | 'cache' | 'bundled'
  fetchedAt: number | null
}

let cache: VersionCache | null = null
let inflight: Promise<string[]> | null = null

export function stripVersionPrefix(v: string): string {
  return v.replace(/^v/, '')
}

export function isValidCliVersion(v: string): boolean {
  return SEMVER_RE.test(v)
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i]
  }
  return 0
}

async function fetchLatestVersions(): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(`${GITHUB_RELEASES_URL}?per_page=5`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/vnd.github+json' },
    })
    if (!res.ok) return []
    const releases = await res.json() as Array<{ tag_name: string }>
    return releases
      .map(r => stripVersionPrefix(r.tag_name))
      .filter(v => SEMVER_RE.test(v))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function ensureCache(): Promise<{ versions: string[]; source: 'github' | 'cache' | 'bundled' }> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return { versions: cache.versions, source: 'cache' }
  }

  if (!inflight) {
    inflight = fetchLatestVersions().finally(() => { inflight = null })
  }
  const fetched = await inflight

  if (fetched.length > 0) {
    cache = { versions: fetched, fetchedAt: Date.now() }
    return { versions: fetched, source: 'github' }
  }

  if (cache) {
    return { versions: cache.versions, source: 'cache' }
  }

  return { versions: [], source: 'bundled' }
}

export async function getAvailableVersions(currentVersion: string): Promise<CliVersionsResponse> {
  const { versions: fetched, source } = await ensureCache()

  const all = new Set([...fetched, ...BUNDLED_VERSIONS])
  if (currentVersion && isValidCliVersion(currentVersion)) {
    all.add(currentVersion)
  }

  const versions = [...all].sort(compareSemver)

  return {
    versions,
    selected: currentVersion,
    source,
    fetchedAt: cache?.fetchedAt ?? null,
  }
}

export async function refreshVersionCache(): Promise<{ source: 'github' | 'cache' | 'bundled' }> {
  inflight = null
  const prev = cache
  const fetched = await fetchLatestVersions()
  if (fetched.length > 0) {
    cache = { versions: fetched, fetchedAt: Date.now() }
    return { source: 'github' }
  }
  if (prev) {
    cache = prev
    return { source: 'cache' }
  }
  return { source: 'bundled' }
}
