import type { Config } from './types.js'
import { validateProxyUrl } from './services/proxy-fetch.js'

function requireEnv(name: string): string {
  const envValue = process.env[name]
  if (!envValue) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return envValue
}

export function loadConfig(): Config {
  const outboundProxy = process.env.OUTBOUND_PROXY?.trim() || null
  if (outboundProxy) {
    validateProxyUrl(outboundProxy)
  }
  return {
    port: parseInt(process.env.PORT || '4000', 10),
    targetUrl: process.env.TARGET_URL || null,
    apiKey: process.env.API_KEY || null,
    proxyKey: requireEnv('PROXY_KEY'),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
    testRequestTimeout: parseInt(process.env.TEST_REQUEST_TIMEOUT || '15000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    outboundProxy,
  }
}
