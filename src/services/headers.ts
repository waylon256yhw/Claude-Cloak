import { settingsManager } from '../settings/manager.js'
import type { ClaudeRequest } from '../types.js'

const SDK_VERSION = process.env.SDK_VERSION || '0.94.0'

const OS_NAME_MAP: Record<string, string> = {
  linux: 'Linux',
  darwin: 'MacOS',
  win32: 'Windows',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  android: 'Android',
}

function detectStainlessOS(): string {
  const p = process.platform
  return OS_NAME_MAP[p] || (p ? `Other:${p}` : 'Unknown')
}

function detectStainlessArch(): string {
  const a = process.arch as string
  if (a === 'x64' || a === 'arm64' || a === 'arm' || a === 'x32') return a
  if (a === 'aarch64') return 'arm64'
  if (a === 'x86_64') return 'x64'
  return a ? `other:${a}` : 'unknown'
}

function detectRuntimeVersion(): string {
  const v = process.versions?.node
  return v ? `v${v}` : 'v24.10.0'
}

const STAINLESS_OS = process.env.STAINLESS_OS || detectStainlessOS()
const STAINLESS_ARCH = process.env.STAINLESS_ARCH || detectStainlessArch()
const STAINLESS_RUNTIME = process.env.STAINLESS_RUNTIME || 'node'
const STAINLESS_RUNTIME_VERSION = process.env.STAINLESS_RUNTIME_VERSION || detectRuntimeVersion()

// Body fields that require a matching anthropic-beta token. Without the token,
// upstream rejects the field as "unknown" or "feature not enabled". We add
// each token only when the client actually sent the corresponding field so
// the header reflects real capability use, not invented capability claims.
function buildBetas(model?: string, body?: ClaudeRequest): string {
  const betas: string[] = []
  const isHaiku = model?.toLowerCase().includes('haiku') ?? false

  if (!isHaiku) betas.push('claude-code-20250219')
  betas.push('interleaved-thinking-2025-05-14')

  if (body?.context_management) betas.push('context-management-2025-06-27')
  if (body?.output_config?.effort) betas.push('effort-2025-11-24')
  // output_config.format is the structured-outputs entry point in 2026 CLI.
  if ((body?.output_config as { format?: unknown } | undefined)?.format) {
    betas.push('structured-outputs-2025-12-15')
  }

  return betas.join(',')
}

export function buildStealthHeaders(
  apiKey: string,
  stream = false,
  model?: string,
  sessionId?: string,
  body?: ClaudeRequest,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': `claude-cli/${settingsManager.getCliVersion()} (external, cli)`,
    'x-app': 'cli',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': buildBetas(model, body),
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Stainless-Lang': 'js',
    'X-Stainless-Package-Version': SDK_VERSION,
    'X-Stainless-OS': STAINLESS_OS,
    'X-Stainless-Arch': STAINLESS_ARCH,
    'X-Stainless-Runtime': STAINLESS_RUNTIME,
    'X-Stainless-Runtime-Version': STAINLESS_RUNTIME_VERSION,
    'X-Stainless-Retry-Count': '0',
    'X-Stainless-Timeout': '600',
  }

  if (sessionId) {
    headers['X-Claude-Code-Session-Id'] = sessionId
  }

  if (stream) {
    headers['x-stainless-helper-method'] = 'stream'
  }

  return headers
}
