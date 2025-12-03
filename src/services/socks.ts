import type { Dispatcher } from 'undici'
import { fetch as undiciFetch } from 'undici'
import { socksDispatcher } from 'fetch-socks'
import type { Config } from '../types.js'

let dispatcher: Dispatcher | undefined
let proxyUrl: string | null = null

const CONNECT_TIMEOUT = 10000

export function initSocksProxy(config: Config) {
  dispatcher = undefined
  proxyUrl = null

  if (!config.warpProxy) return

  const urlStr = config.warpProxy.trim()
  if (!urlStr.startsWith('socks5://') && !urlStr.startsWith('socks5h://')) {
    throw new Error(`Invalid WARP_PROXY format: must start with socks5:// or socks5h://, got: ${urlStr}`)
  }

  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error(`Invalid WARP_PROXY URL: ${urlStr}`)
  }

  if (!url.port) {
    throw new Error(`WARP_PROXY missing port: ${urlStr}`)
  }

  const port = parseInt(url.port, 10)
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid WARP_PROXY port: ${url.port}`)
  }

  dispatcher = socksDispatcher({
    type: 5,
    host: url.hostname,
    port,
  }, {
    connect: {
      timeout: CONNECT_TIMEOUT,
    },
  })

  proxyUrl = urlStr
}

export function getProxyDispatcher(): Dispatcher | undefined {
  return dispatcher
}

export function getProxyUrl(): string | null {
  return proxyUrl
}

export function isProxyError(err: Error & { code?: string; cause?: { code?: string } }): boolean {
  const code = err.code || err.cause?.code
  const msg = err.message || ''

  const proxyCodes = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ]

  if (code && proxyCodes.includes(code)) return true
  if (msg.includes('Proxy') || msg.includes('SOCKS') || msg.includes('connect')) return true

  return false
}

export { undiciFetch }
