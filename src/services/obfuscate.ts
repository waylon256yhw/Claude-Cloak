import type { CompiledMatcher } from '../sensitive-words/types.js'
import type { ClaudeRequest, ClaudeMessage, ClaudeSystemBlock } from '../types.js'
import { graphemes } from '../sensitive-words/grapheme.js'

function obfuscateMatch(m: string, zw: string): string {
  if (m.includes(zw)) return m
  const units = graphemes(m)
  if (units.length < 2) return m
  return units[0] + zw + units.slice(1).join('')
}

export function obfuscateText(text: string, matcher: CompiledMatcher): string {
  if (!matcher.regexList?.length) return text

  let result = text
  for (const regex of matcher.regexList) {
    result = result.replace(regex, (m) => obfuscateMatch(m, matcher.zw))
  }
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
  if (!matcher.regexList?.length) return request

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
