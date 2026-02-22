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
import { sensitiveWordsManager } from './sensitive-words/manager.js'

const MAX_BODY_SIZE = 20 * 1024 * 1024

const config = loadConfig()

await credentialManager.init()
await apiKeyManager.init()
await modelManager.init()
await settingsManager.init()

// Trigger sensitive words load (and possible v1→v2 migration)
const allSets = await sensitiveWordsManager.getAllSets()
const migration = sensitiveWordsManager.getMigrationInfo()
if (migration.migrated && migration.wasEnabled && migration.defaultSetId) {
  const allCreds = credentialManager.getAll()
  for (const cred of allCreds) {
    if (!cred.wordSetIds.length) {
      await credentialManager.setWordSetIds(cred.id, [migration.defaultSetId])
    }
  }
  console.log(`Migrated sensitive words v1→v2: assigned default set to ${allCreds.length} credential(s)`)
}

// Clean up stale word set references from credentials
if (allSets.length > 0) {
  const validSetIds = new Set(allSets.map((s) => s.id))
  for (const cred of credentialManager.getAll()) {
    const staleCount = cred.wordSetIds.filter((id) => !validSetIds.has(id)).length
    if (staleCount > 0) {
      await credentialManager.setWordSetIds(cred.id, cred.wordSetIds.filter((id) => validSetIds.has(id)))
      console.log(`Cleaned ${staleCount} stale word set ref(s) from credential "${cred.name}"`)
    }
  }
}

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
