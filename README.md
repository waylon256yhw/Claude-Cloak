<h1 align="center">
  <img src="assets/logo.svg" width="28" height="28" alt="logo" style="vertical-align: middle;"/>
  Claude Cloak
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Stealth_Proxy-0d9488?style=for-the-badge" alt="Stealth Proxy"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
</p>

<p align="center">
  <em>A lightweight reverse proxy that cloaks API requests as Claude Code CLI format</em>
</p>

---

## Features

- **Request Cloaking**: Transforms all incoming requests to appear as Claude Code CLI
- **IP Obfuscation**: Route upstream requests through Cloudflare WARP SOCKS5 proxy
- **Anthropic Native Format**: Full support for Anthropic API including tool calling and multimodal content
- **Dual Authentication**: Accepts `Authorization: Bearer` and `x-api-key` headers
- **System Prompt Injection**: Automatically injects Claude Code identity
- **Stealth Headers**: Mimics authentic Claude CLI request headers
- **SSE Streaming**: Full support for streaming responses with backpressure handling
- **Multi-Credential Management**: Store multiple upstream API credentials, switch at runtime
- **Strict Mode**: Strip all user system messages, keep only Claude Code prompt
- **Admin Panel**: Web UI for credential and settings management (authentication required)
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

## Docker Image

Pre-built images are available on GitHub Container Registry for easy deployment.

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/CLAUDE-CLOAK)

### Using Docker Run

```bash
docker run -d \
  --name claude-cloak \
  -p 4000:4000 \
  -e TARGET_URL=https://api.anthropic.com \
  -e API_KEY=sk-ant-xxx \
  -e PROXY_KEY=your-secret \
  -v ./data:/app/data \
  ghcr.io/waylon256yhw/claude-cloak:latest
```

### Cloud Platform Deployment

For Zeabur, ClawCloud, Railway, and similar platforms:

| Setting | Value |
|---------|-------|
| Image | `ghcr.io/waylon256yhw/claude-cloak:latest` |
| Port | `4000` |
| Persistent Storage | Mount to `/app/data` |

**Required Environment Variables:**
- `TARGET_URL` - Upstream API base URL (e.g., `https://api.anthropic.com`)
- `API_KEY` - Upstream API credential
- `PROXY_KEY` - Admin panel authentication key

**Optional Environment Variables:**
- `PORT` - Listen port (default: `4000`)
- `REQUEST_TIMEOUT` - Request timeout in ms (default: `60000`)
- `LOG_LEVEL` - Log level: debug, info, warn, error (default: `info`)
- `STRICT_MODE` - Strip user system messages (default: `true`)
- `WARP_PROXY` - SOCKS5 proxy for IP obfuscation

## Supported Clients

Any client that supports **Anthropic API format** can use this proxy:

<table>
  <tr>
    <td align="center" width="200">
      <a href="https://github.com/SillyTavern/SillyTavern">
        <img src="https://github.com/SillyTavern/SillyTavern/raw/release/public/img/ai4.png" width="64" height="64" alt="SillyTavern"/><br/>
        <b>SillyTavern</b>
      </a><br/>
      <sub>Anthropic Format</sub>
    </td>
    <td align="center" width="200">
      <a href="https://github.com/anthropics/anthropic-sdk-typescript">
        <img src="https://avatars.githubusercontent.com/u/77675888?s=200&v=4" width="64" height="64" alt="Anthropic SDK"/><br/>
        <b>Anthropic SDK</b>
      </a><br/>
      <sub>Official Client</sub>
    </td>
    <td align="center" width="200">
      <a href="https://github.com/anthropics/claude-code">
        <img src="https://raw.githubusercontent.com/anthropics/claude-code/refs/heads/main/assets/hero.png" width="64" height="64" alt="Claude Code CLI"/><br/>
        <b>Claude Code CLI</b>
      </a><br/>
      <sub>Official CLI</sub>
    </td>
  </tr>
</table>

> **Note**: This proxy only supports **Anthropic native format** (`/v1/messages`). OpenAI format is not supported.

## Configuration

```env
PORT=4000                              # Proxy listen port
TARGET_URL=https://api.example.com     # Upstream API base URL (without /v1/...)
API_KEY=your-upstream-api-key          # Key for upstream API
PROXY_KEY=your-custom-key              # Key for client authentication
REQUEST_TIMEOUT=60000                  # Request timeout in ms
LOG_LEVEL=info                         # Log level: debug, info, warn, error
STRICT_MODE=true                       # Strip all user system messages (default: true)
WARP_PROXY=socks5h://host.docker.internal:40001  # WARP SOCKS5 proxy (optional)
```

## WARP Proxy Setup (Optional)

Enable IP obfuscation by routing upstream requests through Cloudflare WARP:

### Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Host Machine                                                   │
│                                                                 │
│  ┌─────────────┐    ┌──────────────────────────────────────┐   │
│  │ warp-svc    │    │  Docker: claude-cloak                │   │
│  │ SOCKS5      │◄───│                                      │   │
│  │ :40000      │    │  User ──direct──▶ Proxy ──SOCKS5──┐  │   │
│  └──────┬──────┘    │                                   │  │   │
│         │           │                                   ▼  │   │
│  ┌──────┴──────┐    │                            ┌─────────┴┐  │
│  │ socat       │    │                            │ Upstream │  │
│  │ :40001      │    │                            │ Request  │  │
│  └─────────────┘    └────────────────────────────┴──────────┘  │
│         │                                                       │
└─────────┼───────────────────────────────────────────────────────┘
          │ WARP Tunnel
          ▼
   Cloudflare WARP
   (Masked Exit IP)
          │
          ▼
   Upstream Claude API
```

**Key Points:**
- **User → Docker**: Direct TCP connection (your real IP visible to proxy)
- **Docker → Upstream**: Routed through WARP (upstream sees Cloudflare IP)
- Cloudflare WARP free tier is sufficient

### Host Setup

```bash
# Install Cloudflare WARP
curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | \
  gpg --dearmor -o /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] \
  https://pkg.cloudflareclient.com/ bookworm main" | \
  tee /etc/apt/sources.list.d/cloudflare-client.list
apt-get update && apt-get install cloudflare-warp

# Configure SOCKS5 proxy mode
warp-cli --accept-tos registration new
warp-cli --accept-tos mode proxy
warp-cli --accept-tos proxy port 40000
warp-cli --accept-tos connect

# Verify
curl --socks5 127.0.0.1:40000 https://ipinfo.io/ip  # Should show Cloudflare IP
```

Since WARP only binds to 127.0.0.1, create a systemd service to forward to Docker:

```bash
# /etc/systemd/system/warp-proxy-forward.service
[Unit]
Description=Forward WARP SOCKS5 proxy to Docker
After=warp-svc.service

[Service]
ExecStart=/usr/bin/socat TCP-LISTEN:40001,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:40000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now warp-proxy-forward
```

### Enable in .env

```env
WARP_PROXY=socks5h://host.docker.internal:40001
```

> Use `socks5h://` (not `socks5://`) to ensure DNS queries also go through WARP.

## ⚠️ Important Limitations

**Avoid `system` role messages in your requests!**

Claude Cloak automatically injects Claude Code system prompts. Additional `system` messages may trigger upstream detection.

**Strict Mode (enabled by default)** automatically strips all user system messages, keeping only the Claude Code identity. To disable:
- Set `STRICT_MODE=false` in `.env`, or
- Toggle in Admin Panel (`/admin/`)

With Strict Mode **enabled** (default), all user system messages are stripped for maximum stealth.

With Strict Mode **disabled**, user system messages are preserved but prepended with Claude Code prompt.

## API Usage

### Standard Request

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
| POST | `/v1/messages` | Anthropic native format (with tool calling support) |
| GET | `/admin/` | Admin Panel (Web UI, requires authentication) |

## Admin Panel

Access the web-based admin panel at `/admin/` to:
- **Manage Credentials**: Add, edit, delete, and switch between multiple upstream API credentials
- **Toggle Strict Mode**: Enable/disable system message stripping at runtime
- **Monitor Status**: View proxy health status

> **Security**: Admin API endpoints require authentication using `PROXY_KEY`.

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
│   │   ├── proxy.ts        # Main proxy logic
│   │   └── admin.ts        # Admin API routes
│   ├── services/
│   │   ├── auth.ts         # Authentication
│   │   ├── headers.ts      # Stealth headers
│   │   ├── transform.ts    # Format conversion
│   │   ├── stream.ts       # SSE handling
│   │   ├── user.ts         # User ID generation
│   │   └── socks.ts        # WARP SOCKS5 proxy
│   ├── credentials/
│   │   ├── manager.ts      # Credential CRUD operations
│   │   ├── storage.ts      # JSON file persistence
│   │   └── types.ts        # Credential types
│   └── settings/
│       └── manager.ts      # Runtime settings (Strict Mode)
├── public/                 # Admin Panel frontend
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                   # Persistent storage (Docker volume)
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
