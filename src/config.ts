import type { Config } from './types.js'
import { validateProxyUrl } from './services/proxy-fetch.js'

export function loadConfig(): Config {
  const outboundProxy = process.env.OUTBOUND_PROXY?.trim() || null
  if (outboundProxy) {
    validateProxyUrl(outboundProxy)
  }

  const adminKey = process.env.ADMIN_KEY || process.env.PROXY_KEY
  if (!adminKey) {
    throw new Error('Missing required environment variable: ADMIN_KEY')
  }

  return {
    port: parseInt(process.env.PORT || '4000', 10),
    targetUrl: process.env.TARGET_URL || null,
    apiKey: process.env.API_KEY || null,
    adminKey,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),
    testRequestTimeout: parseInt(process.env.TEST_REQUEST_TIMEOUT || '15000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    outboundProxy,
  }
}
