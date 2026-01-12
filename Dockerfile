FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget && chown -R bun:bun /app
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --chown=bun:bun --from=builder /app/dist ./dist
COPY --chown=bun:bun public ./public
RUN mkdir -p data && chown bun:bun data
USER bun
ENV PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-4000}/healthz || exit 1
CMD ["bun", "dist/server.js"]
