# Claude Cloak - Project Overview

## Purpose
A lightweight reverse proxy that cloaks API requests as Claude Code CLI format. Transforms incoming requests to appear as legitimate Claude Code CLI traffic for upstream API calls.

## Core Features
- **Request Cloaking**: Transforms requests to Claude CLI format with stealth headers
- **IP Obfuscation**: Routes upstream requests through Cloudflare WARP SOCKS5 proxy
- **Dual API Format**: Supports OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`)
- **Dual Authentication**: `Authorization: Bearer` and `x-api-key` headers
- **System Prompt Injection**: Auto-injects Claude Code identity
- **SSE Streaming**: Full streaming response support
- **Multi-Credential Management**: Store/switch multiple upstream API credentials
- **Strict Mode**: Strip user system messages, keep only Claude Code prompt
- **Admin Panel**: Web UI for management

## Tech Stack
- **Runtime**: Node.js 20+
- **Framework**: Fastify 5
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Container**: Docker + Alpine
- **Key Dependencies**:
  - `fastify` - Web framework
  - `fetch-socks` / `undici` - SOCKS proxy support
  - `@fastify/helmet` - Security headers
  - `@fastify/rate-limit` - Rate limiting
  - `@fastify/static` - Static file serving

## Architecture
```
Client → Claude Cloak (Fastify) → [WARP SOCKS5] → Upstream Claude API
```

**Cloaking includes:**
- `User-Agent: claude-cli/2.0.55 (external, cli)`
- `x-app: cli`
- `anthropic-beta: claude-code-20250219,...`
- Claude Code system prompt injection
- Fake but valid `user_id` generation
