import type { Config } from './types.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    targetUrl: requireEnv('TARGET_URL'),
    apiKey: requireEnv('API_KEY'),
    proxyKey: requireEnv('PROXY_KEY'),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
  }
}
