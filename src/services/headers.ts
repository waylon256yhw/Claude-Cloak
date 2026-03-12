const CLI_VERSION = process.env.CLI_VERSION || '2.1.74'
const SDK_VERSION = process.env.SDK_VERSION || '0.78.0'

function buildBetas(model?: string): string {
  const betas: string[] = []
  const isHaiku = model?.toLowerCase().includes('haiku') ?? false

  if (!isHaiku) betas.push('claude-code-20250219')
  betas.push('interleaved-thinking-2025-05-14')
  betas.push('context-management-2025-06-27')
  betas.push('prompt-caching-scope-2026-01-05')

  return betas.join(',')
}

export function buildStealthHeaders(apiKey: string, stream = false, model?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': `claude-cli/${CLI_VERSION} (external, cli)`,
    'x-app': 'cli',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': buildBetas(model),
    'anthropic-dangerous-direct-browser-access': 'true',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Stainless-Lang': 'js',
    'X-Stainless-Package-Version': SDK_VERSION,
    'X-Stainless-OS': 'Linux',
    'X-Stainless-Arch': 'x64',
    'X-Stainless-Runtime': 'node',
    'X-Stainless-Runtime-Version': 'v22.13.1',
    'X-Stainless-Retry-Count': '0',
    'X-Stainless-Timeout': '600',
  }

  if (stream) {
    headers['x-stainless-helper-method'] = 'stream'
  }

  return headers
}
