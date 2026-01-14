import type {
  ClaudeRequest,
  ClaudeSystemBlock,
} from '../types.js'
import { generateFakeUserId, isValidUserId } from './user.js'
import { settingsManager } from '../settings/manager.js'
import { sensitiveWordsManager } from '../sensitive-words/manager.js'
import { obfuscateAnthropicRequest } from './obfuscate.js'

type LoggerLike = {
  debug?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

const CLAUDE_CODE_SYSTEM_PROMPT: ClaudeSystemBlock = {
  type: 'text',
  text: "You are Claude Code, Anthropic's official CLI for Claude.",
}

function normalizeAnthropicParams(request: ClaudeRequest, logger?: LoggerLike): ClaudeRequest {
  const normalized = { ...request }
  const strippedKeys: string[] = []

  if ('top_p' in normalized) {
    delete normalized.top_p
    strippedKeys.push('top_p')
  }

  if (strippedKeys.length > 0) {
    logger?.debug?.({ strippedKeys, model: normalized.model }, 'Normalized API parameters')
  }

  return normalized
}

export async function enhanceAnthropicRequest(request: ClaudeRequest, logger?: LoggerLike): Promise<ClaudeRequest> {
  let enhanced = { ...request }

  if (settingsManager.isStrictMode()) {
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT]
  } else if (!enhanced.system || enhanced.system.length === 0) {
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT]
  } else {
    const existingSystem = Array.isArray(enhanced.system)
      ? enhanced.system
      : [{ type: 'text' as const, text: String(enhanced.system) }]
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT, ...existingSystem]
  }

  if (!enhanced.metadata) {
    enhanced.metadata = { user_id: generateFakeUserId() }
  } else if (!enhanced.metadata.user_id || !isValidUserId(enhanced.metadata.user_id)) {
    enhanced.metadata.user_id = generateFakeUserId()
  }

  if (settingsManager.getNormalizeParameters()) {
    enhanced = normalizeAnthropicParams(enhanced, logger)
  }

  try {
    if (await sensitiveWordsManager.isEnabled()) {
      const matcher = await sensitiveWordsManager.getCompiledMatcher()
      enhanced = obfuscateAnthropicRequest(enhanced, matcher)
    }
  } catch (err) {
    logger?.warn?.({ err }, 'Word obfuscation failed, continuing without obfuscation')
  }

  return enhanced
}
