import { createHash } from 'node:crypto'
import type { ClaudeRequest, ClaudeSystemBlock, ClaudeMessage, ClaudeContentBlock } from '../types.js'
import type { Credential } from '../credentials/types.js'
import { generateFakeUserId, isValidUserId } from './user.js'
import { settingsManager } from '../settings/manager.js'
import { sensitiveWordsManager } from '../sensitive-words/manager.js'
import { obfuscateAnthropicRequest } from './obfuscate.js'

type LoggerLike = {
  debug?: (obj: unknown, msg?: string) => void
  warn?: (obj: unknown, msg?: string) => void
}

const BILLING_SALT = '59cf53e54c78'
const BILLING_HEADER_PREFIX = 'x-anthropic-billing-header:'

const CLAUDE_CODE_SYSTEM_PROMPT: ClaudeSystemBlock = {
  type: 'text',
  text: "You are Claude Code, Anthropic's official CLI for Claude.",
}

// Opus 4.7+ silently drops `budget_tokens` upstream, leaving the user with no
// thinking at all. We rewrite to `adaptive` there to preserve intent.
const OPUS_47_PLUS_RE = /^claude-opus-4-(7|8)(?:[-_]|$)/i

function isOpus47OrLater(model: string | undefined): boolean {
  return !!model && OPUS_47_PLUS_RE.test(model)
}

function extractFirstUserText(request: ClaudeRequest): string {
  for (const msg of request.messages) {
    if (msg.role !== 'user') continue
    if (typeof msg.content === 'string') return msg.content
    const text = msg.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('')
    if (text) return text
  }
  return ''
}

function computeBillingHeader(messageText: string): string {
  const version = settingsManager.getCliVersion()
  const sampled = [4, 7, 20].map((i) => messageText[i] ?? '0').join('')
  const versionHash = createHash('sha256').update(`${BILLING_SALT}${sampled}${version}`).digest('hex').slice(0, 3)
  // cch is the literal placeholder used by the real CLI's first-party path; relays
  // (monkeycoding etc.) recompute or whitelist this value, so any non-CLI value
  // gets rejected as "Client error, please upgrade your Claude Code client".
  return `x-anthropic-billing-header: cc_version=${version}.${versionHash}; cc_entrypoint=cli; cch=00000;`
}

function normalizeAnthropicParams(request: ClaudeRequest, logger?: LoggerLike): ClaudeRequest {
  const normalized = { ...request }
  const strippedKeys: string[] = []

  if ('top_p' in normalized) {
    delete normalized.top_p
    strippedKeys.push('top_p')
  }

  // Opus 4.7+ returns 400 for any non-default temperature/top_k regardless of
  // thinking; for other models we only strip them when thinking is on
  // (thinking forbids deterministic sampling).
  const stripTempK = !!normalized.thinking || isOpus47OrLater(normalized.model)
  if (stripTempK) {
    if ('temperature' in normalized) {
      delete normalized.temperature
      strippedKeys.push('temperature')
    }
    if ('top_k' in normalized) {
      delete normalized.top_k
      strippedKeys.push('top_k')
    }
  }

  if (strippedKeys.length > 0) {
    logger?.debug?.(
      { strippedKeys, model: normalized.model, thinking: normalized.thinking?.type },
      'Normalized API parameters'
    )
  }

  return normalized
}

// ---------- Defensive cleanup helpers (ported from clewdr-hub) ----------

function isBillingHeaderText(text: string): boolean {
  return text.trim().toLowerCase().startsWith(BILLING_HEADER_PREFIX)
}

function hasNonEmptySystem(system: ClaudeRequest['system']): boolean {
  if (system == null) return false
  if (typeof system === 'string') return system.trim() !== ''
  return system.some((b) => b && b.type === 'text' && b.text.trim() !== '')
}

function systemToText(system: ClaudeRequest['system']): string {
  if (system == null) return ''
  if (typeof system === 'string') return system
  return system
    .filter((b): b is ClaudeSystemBlock => !!b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n\n')
}

function asSystemArray(system: ClaudeRequest['system']): ClaudeSystemBlock[] {
  if (!system) return []
  if (Array.isArray(system)) return system
  return [{ type: 'text', text: String(system) }]
}

/** B1: drop any client-supplied billing-header blocks so our injection is idempotent. */
function stripBillingHeadersFromSystem(req: ClaudeRequest): ClaudeRequest {
  if (!req.system) return req
  if (typeof req.system === 'string') {
    return isBillingHeaderText(req.system) ? { ...req, system: '' } : req
  }
  const filtered = req.system.filter((b) => !(b && b.type === 'text' && isBillingHeaderText(b.text)))
  return { ...req, system: filtered }
}

/** B2: clear an effectively-empty system so downstream branches see a clean None. */
function dropEmptySystem(req: ClaudeRequest): ClaudeRequest {
  return hasNonEmptySystem(req.system) ? req : { ...req, system: undefined }
}

/** B3: strip empty text blocks; drop messages whose content drains to nothing. Other block kinds preserved. */
function dropEmptyMessageTextBlocks(req: ClaudeRequest): ClaudeRequest {
  const messages = req.messages.flatMap<ClaudeMessage>((m) => {
    if (typeof m.content === 'string') {
      return m.content.trim() === '' ? [] : [m]
    }
    const kept = m.content.filter((b: ClaudeContentBlock) => b.type !== 'text' || b.text.trim() !== '')
    return kept.length === 0 ? [] : [{ ...m, content: kept }]
  })
  return { ...req, messages }
}

/** B4: zero-input safety net — if cleanup left only a system, inject a benign user turn. */
function fillSystemOnlyUserPlaceholder(req: ClaudeRequest): ClaudeRequest {
  if (req.messages.length > 0) return req
  if (!hasNonEmptySystem(req.system)) return req
  return { ...req, messages: [{ role: 'user', content: 'Continue.' }] }
}

// ---------- Main enhancer ----------

export async function enhanceAnthropicRequest(
  request: ClaudeRequest,
  logger?: LoggerLike,
  credential?: Credential
): Promise<ClaudeRequest> {
  let enhanced: ClaudeRequest = { ...request }

  // 1-4: defensive cleanup of client input — before any stealth injection so we
  // sanitize first then add our own blocks.
  enhanced = stripBillingHeadersFromSystem(enhanced)
  enhanced = dropEmptySystem(enhanced)
  enhanced = dropEmptyMessageTextBlocks(enhanced)
  enhanced = fillSystemOnlyUserPlaceholder(enhanced)

  // Capture original text before any obfuscation for stable cch sampling.
  const firstUserText = extractFirstUserText(enhanced)

  // strictMode: relocate the user's system content into a leading user message
  // so the wire-visible top-level `system` array contains only our CC identity
  // (matching real CLI shape) while the user's intent survives in the
  // conversation. Non-strict: prepend identity alongside the user's system.
  if (settingsManager.isStrictMode() && hasNonEmptySystem(enhanced.system)) {
    const demoted = systemToText(enhanced.system).trim()
    if (demoted) {
      enhanced.messages = [{ role: 'user', content: demoted }, ...enhanced.messages]
    }
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT]
  } else if (!enhanced.system || (Array.isArray(enhanced.system) && enhanced.system.length === 0)) {
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT]
  } else {
    enhanced.system = [CLAUDE_CODE_SYSTEM_PROMPT, ...asSystemArray(enhanced.system)]
  }

  if (!enhanced.metadata) {
    enhanced.metadata = { user_id: generateFakeUserId() }
  } else if (!enhanced.metadata.user_id || !isValidUserId(enhanced.metadata.user_id)) {
    enhanced.metadata.user_id = generateFakeUserId()
  }

  // Thinking handling: preserve user intent without inventing thinking config.
  if (enhanced.thinking?.type === 'enabled') {
    if (isOpus47OrLater(enhanced.model)) {
      // Opus 4.7+ drops `budget_tokens` silently — rewrite so thinking actually fires.
      enhanced.thinking = {
        type: 'adaptive',
        display: enhanced.thinking.display ?? 'summarized',
      }
    } else if (enhanced.thinking.display == null) {
      // Otherwise: default display so the chain is visible to the client.
      enhanced.thinking.display = 'summarized'
    }
  }

  if (settingsManager.getNormalizeParameters()) {
    enhanced = normalizeAnthropicParams(enhanced, logger)
  }

  if (credential?.wordSetIds?.length) {
    try {
      const matcher = sensitiveWordsManager.getMergedMatcher(credential.wordSetIds)
      enhanced = obfuscateAnthropicRequest(enhanced, matcher)
    } catch (err) {
      logger?.warn?.({ err }, 'Word obfuscation failed, continuing without obfuscation')
    }
  }

  // Inject billing header last so obfuscation cannot touch it.
  const billingHeader: ClaudeSystemBlock = {
    type: 'text',
    text: computeBillingHeader(firstUserText),
  }
  enhanced.system = [billingHeader, ...(enhanced.system as ClaudeSystemBlock[])]

  return enhanced
}
