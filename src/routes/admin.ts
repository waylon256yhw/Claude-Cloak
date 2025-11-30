import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Config } from '../types.js'
import { credentialManager } from '../credentials/manager.js'
import type { CreateCredentialInput, UpdateCredentialInput } from '../credentials/types.js'

interface IdParams {
  id: string
}

export async function adminRoutes(fastify: FastifyInstance, config: Config) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers.authorization
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : request.headers['x-api-key']
    if (key !== config.proxyKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid admin key' })
      return reply
    }
  })

  fastify.get('/credentials', async () => {
    return credentialManager.getAll()
  })

  fastify.get<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    const cred = credentialManager.getById(request.params.id)
    if (!cred) {
      reply.code(404).send({ error: 'Not Found', message: 'Credential not found' })
      return
    }
    return cred
  })

  fastify.post<{ Body: CreateCredentialInput }>('/credentials', async (request, reply) => {
    const { name, targetUrl, apiKey } = request.body || {}
    if (!name || !targetUrl || !apiKey) {
      reply.code(400).send({ error: 'Bad Request', message: 'Missing required fields: name, targetUrl, apiKey' })
      return
    }
    try {
      return await credentialManager.create({ name, targetUrl, apiKey })
    } catch (err) {
      reply.code(500).send({ error: 'Internal Server Error', message: (err as Error).message })
    }
  })

  fastify.put<{ Params: IdParams; Body: UpdateCredentialInput }>('/credentials/:id', async (request, reply) => {
    try {
      return await credentialManager.update(request.params.id, request.body || {})
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.delete<{ Params: IdParams }>('/credentials/:id', async (request, reply) => {
    try {
      await credentialManager.remove(request.params.id)
      return { success: true }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.post<{ Params: IdParams }>('/credentials/:id/activate', async (request, reply) => {
    try {
      return await credentialManager.activate(request.params.id)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('not found')) {
        reply.code(404).send({ error: 'Not Found', message: msg })
      } else {
        reply.code(500).send({ error: 'Internal Server Error', message: msg })
      }
    }
  })

  fastify.get('/active', async (request, reply) => {
    const active = credentialManager.getActive()
    if (!active) {
      reply.code(404).send({ error: 'Not Found', message: 'No active credential configured' })
      return
    }
    return { id: active.id, name: active.name, targetUrl: active.targetUrl }
  })
}
