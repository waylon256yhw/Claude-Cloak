export interface Config {
  port: number
  targetUrl: string | null
  apiKey: string | null
  proxyKey: string
  requestTimeout: number
  logLevel: string
  warpProxy: string | null
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface OpenAIChatRequest {
  model?: string
  messages: OpenAIMessage[]
  max_tokens?: number
  temperature?: number
  stream?: boolean
}

export interface ClaudeSystemBlock {
  type: 'text'
  text: string
}

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

export interface ClaudeContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: ClaudeSystemBlock[]
  messages: ClaudeMessage[]
  metadata?: { user_id: string }
  temperature?: number
  stream?: boolean
}
