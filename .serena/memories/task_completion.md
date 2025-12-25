# Task Completion Checklist

## Before Committing Changes

1. **Type Check**
   ```bash
   npm run build
   ```
   Ensure no TypeScript errors.

2. **Test Locally**
   ```bash
   npm run dev
   curl http://localhost:4000/healthz
   ```

3. **Docker Build Test** (if modifying Dockerfile or dependencies)
   ```bash
   docker compose up -d --build
   docker compose logs -f
   ```

## No Linting/Formatting Tools Configured
This project does not have explicit linting or formatting tools (no ESLint, Prettier). Follow existing code style in the codebase.

## No Test Suite
No automated tests configured. Manual testing via curl or client applications required.
