import { join } from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { loadConfig } from './config.js'
import { createAdminAuthHook, createProxyAuthHook } from './services/auth.js'
import { healthRoutes } from './routes/health.js'
import { modelsRoutes } from './routes/models.js'
import { proxyRoutes } from './routes/proxy.js'
import { adminRoutes } from './routes/admin.js'
import { credentialManager } from './credentials/manager.js'
import { apiKeyManager } from './apikeys/manager.js'
import { modelManager } from './models/manager.js'
import { settingsManager } from './settings/manager.js'

const MAX_BODY_SIZE = 20 * 1024 * 1024

const config = loadConfig()

await credentialManager.init()
await apiKeyManager.init()
await modelManager.init()
await settingsManager.init()

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
  bodyLimit: MAX_BODY_SIZE,
})

fastify.addHook('onSend', async (_request, reply) => {
  reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'")
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
})

await fastify.register(healthRoutes)

await fastify.register(fastifyStatic, {
  root: join(process.cwd(), 'public'),
  prefix: '/admin/',
  decorateReply: false,
})

const adminAuthHook = createAdminAuthHook(config)
await fastify.register(async (instance) => {
  instance.addHook('preHandler', adminAuthHook)
  await adminRoutes(instance, config)
}, { prefix: '/admin/api' })

const proxyAuthHook = createProxyAuthHook()
await fastify.register(async (instance) => {
  instance.addHook('preHandler', proxyAuthHook)
  await modelsRoutes(instance, config)
  await proxyRoutes(instance, config)
})

fastify.setNotFoundHandler(async (request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: 'Endpoint not supported',
    available_endpoints: [
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

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down gracefully...`)
    await fastify.close()
    process.exit(0)
  })
}
