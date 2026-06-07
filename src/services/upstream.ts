import type { Config } from '../types.js'
import type { ApiKey } from '../apikeys/types.js'
import type { Credential } from '../credentials/types.js'
import { credentialManager } from '../credentials/manager.js'

export interface UpstreamConfig {
  targetUrl: string
  apiKey: string
  proxyUrl?: string | null
  credential?: Credential
}

export function resolveUpstream(apiKeyEntity: ApiKey | undefined, config: Config): UpstreamConfig | null {
  if (apiKeyEntity?.credentialId) {
    const cred = credentialManager.getById(apiKeyEntity.credentialId)
    if (cred?.enabled) {
      return { targetUrl: cred.targetUrl, apiKey: cred.apiKey, proxyUrl: cred.proxyUrl, credential: cred }
    }
  }
  if (config.targetUrl && config.apiKey) {
    return { targetUrl: config.targetUrl, apiKey: config.apiKey }
  }
  return null
}
