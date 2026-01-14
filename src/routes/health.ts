import type { FastifyInstance } from 'fastify'

export async function healthRoutes(fastify: FastifyInstance) {
  // Redirect root to admin panel
  fastify.get('/', async (request, reply) => {
    return reply.redirect('/admin/')
  })

  fastify.get('/healthz', async () => ({
    status: 'ok',
    service: 'claude-cloak',
    version: process.env.APP_VERSION || 'dev',
    timestamp: new Date().toISOString(),
  }))

  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'Claude Cloak',
    timestamp: new Date().toISOString(),
    endpoints: [
      'POST /v1/messages (Anthropic format)',
      'GET /v1/models (Model list)',
    ],
  }))
}
