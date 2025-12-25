# Development Commands

## Local Development
```bash
npm install          # Install dependencies
npm run dev          # Development mode with hot reload (tsx watch)
npm run build        # TypeScript compilation
npm start            # Production start (requires build first)
```

## Docker Operations
```bash
docker compose up -d              # Start container
docker compose down               # Stop container
docker compose logs -f            # View logs
docker compose restart            # Restart container
docker compose up -d --build      # Rebuild and start
```

## Testing & Verification
```bash
curl http://localhost:4000/healthz          # Basic health check
curl http://localhost:4000/health           # Detailed health info
```

## Configuration
```bash
cp .env.example .env    # Create config file
vim .env                # Edit settings
```

## Key Environment Variables
- `PORT` - Listen port (default: 4000)
- `TARGET_URL` - Upstream API base URL
- `API_KEY` - Upstream API key
- `PROXY_KEY` - Client authentication key
- `STRICT_MODE` - Strip user system messages (default: true)
- `WARP_PROXY` - SOCKS5 proxy URL (optional)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `REQUEST_TIMEOUT` - Request timeout in ms
