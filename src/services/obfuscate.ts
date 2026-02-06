import type { CompiledMatcher } from '../sensitive-words/types.js'
import type { ClaudeRequest, ClaudeMessage, ClaudeSystemBlock } from '../types.js'
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
    const charEnd = endIdx + 1 < segments.length
      ? segments[endIdx + 1].index
      : normalized.length

    reps.push({ charStart, charEnd })
  }

  reps.sort((a, b) => a.charStart - b.charStart || (b.charEnd - b.charStart) - (a.charEnd - a.charStart))

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

type ContentBlock = { type: string; text?: string; content?: unknown; [key: string]: unknown }

function obfuscateContentRecursive(content: unknown, matcher: CompiledMatcher): unknown {
  if (typeof content === 'string') {
    return obfuscateText(content, matcher)
  }

  if (Array.isArray(content)) {
    return content.map((item) => obfuscateContentRecursive(item, matcher))
  }

  if (content && typeof content === 'object') {
    const block = content as ContentBlock
    const result: Record<string, unknown> = { ...block }

    if (block.type === 'text' && typeof block.text === 'string') {
      result.text = obfuscateText(block.text, matcher)
    }

    if ('content' in block && block.content !== undefined) {
      result.content = obfuscateContentRecursive(block.content, matcher)
    }

    return result
  }

  return content
}

function obfuscateContent(
  content: string | ContentBlock[],
  matcher: CompiledMatcher
): string | ContentBlock[] {
  return obfuscateContentRecursive(content, matcher) as string | ContentBlock[]
}

function obfuscateSystem(
  system: ClaudeSystemBlock[] | string | undefined,
  matcher: CompiledMatcher
): ClaudeSystemBlock[] | string | undefined {
  if (!system) return system

  if (typeof system === 'string') {
    return obfuscateText(system, matcher)
  }

  if (Array.isArray(system)) {
    return system.map((block) => {
      if (block.type === 'text' && typeof block.text === 'string') {
        return { ...block, text: obfuscateText(block.text, matcher) }
      }
      return block
    })
  }

  return system
}

export function obfuscateAnthropicRequest(
  request: ClaudeRequest,
  matcher: CompiledMatcher
): ClaudeRequest {
  if (!matcher.ac) return request

  const result = { ...request }

  if (result.system) {
    result.system = obfuscateSystem(result.system, matcher) as ClaudeSystemBlock[]
  }

  if (result.messages) {
    result.messages = result.messages.map((msg: ClaudeMessage) => ({
      ...msg,
      content: obfuscateContent(msg.content as string | ContentBlock[], matcher),
    })) as ClaudeMessage[]
  }

  return result
}
