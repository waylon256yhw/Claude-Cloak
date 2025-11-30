import type {
  OpenAIChatRequest,
  OpenAIMessage,
  ClaudeRequest,
  ClaudeMessage,
  ClaudeSystemBlock,
} from '../types.js'
import { generateFakeUserId, isValidUserId } from './user.js'
import { settingsManager } from '../settings/manager.js'

const CLAUDE_CODE_SYSTEM_PROMPT: ClaudeSystemBlock = {
  type: 'text',
  text: "You are Claude Code, Anthropic's official CLI for Claude.",
}

export function convertOpenAIToClaude(request: OpenAIChatRequest): ClaudeRequest {
  const {
    model = 'claude-3-5-sonnet-20241022',
    messages = [],
    max_tokens = 4096,
    temperature,
    stream = false,
  } = request

  const conversationMessages = messages.filter((m) => m.role !== 'system')

  let system: ClaudeSystemBlock[]
  if (settingsManager.isStrictMode()) {
    system = [CLAUDE_CODE_SYSTEM_PROMPT]
  } else {
    const systemMessages = messages.filter((m) => m.role === 'system')
    system = [
      CLAUDE_CODE_SYSTEM_PROMPT,
      ...systemMessages.map((m) => ({
        type: 'text' as const,
        text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ]
  }

  const claudeMessages: ClaudeMessage[] = conversationMessages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  }))

  const claudeRequest: ClaudeRequest = {
    model,
    max_tokens,
    system,
    messages: claudeMessages,
    metadata: { user_id: generateFakeUserId() },
  }

  if (temperature !== undefined) {
    claudeRequest.temperature = temperature
  }

  if (stream) {
    claudeRequest.stream = true
  }

  return claudeRequest
}

export function enhanceAnthropicRequest(request: ClaudeRequest): ClaudeRequest {
  const enhanced = { ...request }

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

  return enhanced
}
