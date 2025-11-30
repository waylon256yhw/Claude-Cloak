import { join } from 'node:path'
import Fastify from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { loadConfig } from './config.js'
import { createAuthHook } from './services/auth.js'
import { healthRoutes } from './routes/health.js'
import { modelsRoutes } from './routes/models.js'
import { proxyRoutes } from './routes/proxy.js'
import { adminRoutes } from './routes/admin.js'
import { credentialManager } from './credentials/manager.js'

const config = loadConfig()

await credentialManager.init()

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
})

await fastify.register(helmet, { contentSecurityPolicy: false })
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

await fastify.register(healthRoutes)

await fastify.register(fastifyStatic, {
  root: join(process.cwd(), 'public'),
  prefix: '/admin/',
  decorateReply: false,
})

await fastify.register(async (instance) => {
  await adminRoutes(instance, config)
}, { prefix: '/admin/api' })

const authHook = createAuthHook(config)
fastify.addHook('preHandler', async (request, reply) => {
  if (
    request.url === '/healthz' ||
    request.url === '/health' ||
    request.url.startsWith('/admin/')
  ) return
  return authHook(request, reply)
})

await fastify.register(async (instance) => {
  await modelsRoutes(instance, config)
  await proxyRoutes(instance, config)
})

fastify.setNotFoundHandler(async (request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: 'Endpoint not supported',
    available_endpoints: [
      'POST /v1/chat/completions',
      'POST /v1/messages',
      'GET /v1/models',
      'GET /healthz',
      'GET /admin/',
    ],
  })
})

try {
  await fastify.listen({ port: config.port, host: '0.0.0.0' })
  console.log(`Claude Proxy running on port ${config.port}`)
  console.log(`Admin panel: http://localhost:${config.port}/admin/`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
