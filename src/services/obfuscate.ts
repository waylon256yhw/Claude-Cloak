import type { CompiledMatcher } from '../sensitive-words/types.js'
import type { ClaudeRequest, ClaudeMessage } from '../types.js'
import { graphemes, segmentGraphemes } from '../sensitive-words/grapheme.js'

function obfuscateMatch(m: string, zw: string): string {
  if (m.includes(zw)) return m
  const units = graphemes(m)
  if (units.length < 2) return m
  return units[0] + zw + units.slice(1).join('')
}

export function obfuscateText(text: string, matcher: CompiledMatcher): string {
  if (!matcher.ac) return text

  const normalized = text.normalize('NFKC')
  const lowered = normalized.toLowerCase()
  const matches = matcher.ac.search(lowered)
  if (matches.length === 0) return normalized

  const segments = segmentGraphemes(normalized)

  type Rep = { charStart: number; charEnd: number }
  const reps: Rep[] = []

  for (const [endIdx, keywords] of matches) {
    const longest = keywords.reduce((a, b) =>
      (matcher.keyGraphemeLens!.get(a) ?? 0) >= (matcher.keyGraphemeLens!.get(b) ?? 0) ? a : b
    )
    const keyLen = matcher.keyGraphemeLens!.get(longest)!
    const startIdx = endIdx - keyLen + 1
    if (startIdx < 0) continue

    const charStart = segments[startIdx].index
    const charEnd = endIdx + 1 < segments.length ? segments[endIdx + 1].index : normalized.length

    reps.push({ charStart, charEnd })
  }

  reps.sort((a, b) => a.charStart - b.charStart || b.charEnd - b.charStart - (a.charEnd - a.charStart))

  let result = ''
  let pos = 0
  for (const rep of reps) {
    if (rep.charStart < pos) continue
    result += normalized.slice(pos, rep.charStart)
    result += obfuscateMatch(normalized.slice(rep.charStart, rep.charEnd), matcher.zw)
    pos = rep.charEnd
  }
  result += normalized.slice(pos)
  return result
}

function obfuscateRecursive(value: unknown, matcher: CompiledMatcher): unknown {
  if (typeof value === 'string') return obfuscateText(value, matcher)
  if (Array.isArray(value)) return value.map((item) => obfuscateRecursive(item, matcher))
  if (value && typeof value === 'object') {
    const block = value as Record<string, unknown> & { type?: string; text?: string; content?: unknown }
    const result: Record<string, unknown> = { ...block }
    if (block.type === 'text' && typeof block.text === 'string') {
      result.text = obfuscateText(block.text, matcher)
    }
    if ('content' in block && block.content !== undefined) {
      result.content = obfuscateRecursive(block.content, matcher)
    }
    return result
  }
  return value
}

export function obfuscateAnthropicRequest(request: ClaudeRequest, matcher: CompiledMatcher): ClaudeRequest {
  if (!matcher.ac) return request

  const result = { ...request }
  if (result.system) {
    result.system = obfuscateRecursive(result.system, matcher) as ClaudeRequest['system']
  }
  if (result.messages) {
    result.messages = result.messages.map((msg: ClaudeMessage) => ({
      ...msg,
      content: obfuscateRecursive(msg.content, matcher) as ClaudeMessage['content'],
    }))
  }
  return result
}
