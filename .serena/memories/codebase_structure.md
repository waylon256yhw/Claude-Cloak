# Codebase Structure

```
claude-cloak/
├── src/
│   ├── server.ts           # Entry point - Fastify app setup
│   ├── config.ts           # Environment config (loadConfig, requireEnv)
│   ├── types.ts            # TypeScript type definitions
│   ├── routes/
│   │   ├── health.ts       # Health check endpoints (/healthz, /health)
│   │   ├── models.ts       # Models endpoint (/v1/models)
│   │   ├── proxy.ts        # Main proxy logic (/v1/messages, /v1/chat/completions)
│   │   └── admin.ts        # Admin API routes
│   ├── services/
│   │   ├── auth.ts         # Authentication logic
│   │   ├── headers.ts      # Stealth header generation
│   │   ├── transform.ts    # Request format conversion
│   │   ├── stream.ts       # SSE stream handling
│   │   ├── user.ts         # User ID generation
│   │   └── socks.ts        # WARP SOCKS5 proxy client
│   ├── credentials/
│   │   ├── manager.ts      # Credential CRUD operations
│   │   ├── storage.ts      # JSON file persistence
│   │   └── types.ts        # Credential types
│   └── settings/
│       └── manager.ts      # Runtime settings (Strict Mode toggle)
├── public/                 # Admin Panel frontend (static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                   # Persistent storage (Docker volume)
├── assets/                 # Logo and branding assets
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Key Entry Points
- `src/server.ts` - Main application entry
- `src/routes/proxy.ts` - Core proxy logic
- `src/services/` - Business logic modules
