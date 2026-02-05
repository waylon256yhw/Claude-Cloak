# Claude Cloak - Project Overview

## Purpose
A lightweight reverse proxy that cloaks API requests as Claude Code CLI format. Transforms incoming requests to appear as legitimate Claude Code CLI traffic for upstream API calls.

## Core Features
- **Request Cloaking**: Transforms requests to Claude CLI format with stealth headers
- **Anthropic Native Format**: Full support for Anthropic API (`/v1/messages`) including tool calling and multimodal content
- **Dual Authentication**: `Authorization: Bearer` and `x-api-key` headers
- **System Prompt Injection**: Auto-injects Claude Code identity
- **SSE Streaming**: Full streaming response support with backpressure handling
- **Multi-Credential Management**: Store/switch multiple upstream API credentials
- **Connection Testing**: One-click upstream API connectivity verification with latency display
- **Strict Mode**: Strip user system messages, keep only Claude Code prompt
- **Sensitive Word Obfuscation**: Auto-obfuscate configurable sensitive words
- **Parameter Normalization**: Strip unsupported parameters (top_p/top_k) to prevent upstream errors
- **Admin Panel**: Web UI for credential management, connection testing, and settings

## Tech Stack
- **Runtime**: Bun (with Node.js fallback)
- **Framework**: Fastify 5
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Container**: Docker + Alpine
- **Key Dependencies**:
  - `fastify` - Web framework
  - `@fastify/helmet` - Security headers
  - `@fastify/rate-limit` - Rate limiting
  - `@fastify/static` - Static file serving

## Architecture
```
Client → Claude Cloak (Fastify) → Upstream Claude API
```

**Cloaking includes:**
- `User-Agent: claude-cli/2.x.x (external, cli)`
- `x-app: cli`
- `anthropic-beta: claude-code-20250219,...`
- Claude Code system prompt injection
- Fake but valid `user_id` generation

## Admin Panel Features
- Add/edit/delete API credentials
- Test connection to upstream API (shows latency)
- Switch active credential at runtime
- Toggle Strict Mode
- Toggle Parameter Normalization
- Manage sensitive word obfuscation list

## Important Notes
- Only supports Anthropic native format (`/v1/messages`), no OpenAI format
- SSRF protection on targetUrl validation
- Admin API requires PROXY_KEY authentication
