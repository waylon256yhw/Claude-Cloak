import type { FastifyInstance } from 'fastify'

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/healthz', async () => ({
    status: 'ok',
    service: 'claude-cloak',
    timestamp: new Date().toISOString(),
  }))

  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'Claude Cloak',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /v1/chat/completions (OpenAI format)',
      'POST /v1/messages (Anthropic format)',
      'GET /v1/models (Model list)',
    ],
  }))
}
