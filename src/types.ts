export interface Config {
  port: number
  targetUrl: string | null
  apiKey: string | null
  proxyKey: string
  requestTimeout: number
  logLevel: string
}

export interface ClaudeSystemBlock {
  type: 'text'
  text: string
}

// Anthropic content blocks with full tool calling support
export interface ClaudeTextBlock {
  type: 'text'
  text: string
}

export interface ClaudeImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface ClaudeToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ClaudeToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ClaudeTextBlock[]
  is_error?: boolean
}

export type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeImageBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

export interface ClaudeTool {
  name: string
  description?: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: ClaudeSystemBlock[] | string
  messages: ClaudeMessage[]
  tools?: ClaudeTool[]
  metadata?: { user_id: string }
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
}
