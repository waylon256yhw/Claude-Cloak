# Claude Cloak

A lightweight reverse proxy that cloaks various Claude API requests as Claude Code CLI format, enabling unified access through a single endpoint.

## Features

- **Request Cloaking**: Transforms all incoming requests to appear as Claude Code CLI
- **Dual API Format**: Supports both OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) formats
- **Dual Authentication**: Accepts `Authorization: Bearer` and `x-api-key` headers
- **System Prompt Injection**: Automatically injects Claude Code identity
- **Stealth Headers**: Mimics authentic Claude CLI request headers
- **SSE Streaming**: Full support for streaming responses
- **Docker Ready**: One-command deployment with Docker Compose

## Quick Start

```bash
# Clone and configure
cd claude-cloak
cp .env.example .env
vim .env  # Edit your settings

# Deploy
docker compose up -d

# Verify
curl http://localhost:4000/healthz
```

## Configuration

```env
PORT=4000                              # Proxy listen port
TARGET_URL=https://api.example.com     # Upstream API base URL (without /v1/...)
API_KEY=your-upstream-api-key          # Key for upstream API
PROXY_KEY=your-custom-key              # Key for client authentication
REQUEST_TIMEOUT=60000                  # Request timeout in ms
LOG_LEVEL=info                         # Log level: debug, info, warn, error
```

## ⚠️ Important Limitations

**Do NOT include `system` role messages in your requests!**

Claude Cloak automatically injects Claude Code system prompts. If you include additional `system` messages, it may trigger upstream detection mechanisms that inspect system prompts, potentially exposing the cloaking.

❌ **Bad - Will trigger detection:**
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello"}
  ]
}
```

✅ **Good - Safe to use:**
```json
{
  "messages": [
    {"role": "user", "content": "Hello"}
  ]
}
```

**Workaround**: If you need to provide instructions, include them in the first user message instead:
```json
{
  "messages": [
    {"role": "user", "content": "You are a helpful assistant.\n\nUser question: Hello"}
  ]
}
```

## API Usage

### Anthropic Format

```bash
curl -X POST https://your-domain/v1/messages \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### OpenAI Format

```bash
curl -X POST https://your-domain/v1/chat/completions \
  -H "x-api-key: YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Streaming

```bash
curl -X POST https://your-domain/v1/messages \
  -H "Authorization: Bearer YOUR_PROXY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Health check |
| GET | `/health` | Detailed health info |
| GET | `/v1/models` | List available models |
| POST | `/v1/messages` | Anthropic format |
| POST | `/v1/chat/completions` | OpenAI format |

## Authentication

Supports two authentication methods (checked in order):

1. **x-api-key header**: `x-api-key: YOUR_PROXY_KEY`
2. **Bearer token**: `Authorization: Bearer YOUR_PROXY_KEY`

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│ Claude Cloak │────▶│  Upstream   │
│  (Any SDK)  │     │              │     │   Claude    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  Cloaking   │
                    │  - Headers  │
                    │  - System   │
                    │  - User ID  │
                    └─────────────┘
```

**Cloaking includes:**
- `User-Agent: claude-cli/2.0.55 (external, cli)`
- `x-app: cli`
- `anthropic-beta: claude-code-20250219,...`
- Claude Code system prompt injection
- Fake but valid `user_id` generation

## Project Structure

```
claude-cloak/
├── src/
│   ├── server.ts           # Entry point
│   ├── config.ts           # Environment config
│   ├── types.ts            # TypeScript types
│   ├── routes/
│   │   ├── health.ts       # Health endpoints
│   │   ├── models.ts       # Models endpoint
│   │   └── proxy.ts        # Main proxy logic
│   └── services/
│       ├── auth.ts         # Authentication
│       ├── headers.ts      # Stealth headers
│       ├── transform.ts    # Format conversion
│       ├── stream.ts       # SSE handling
│       └── user.ts         # User ID generation
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build
npm run build

# Production
npm start
```

## Docker Commands

```bash
docker compose up -d      # Start
docker compose down       # Stop
docker compose logs -f    # View logs
docker compose restart    # Restart
docker compose up -d --build  # Rebuild and start
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify 5
- **Language**: TypeScript
- **Container**: Docker + Alpine

## License

MIT
