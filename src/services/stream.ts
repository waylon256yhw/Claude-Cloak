import type { FastifyReply } from 'fastify'

export async function pipeStream(
  response: Response,
  reply: FastifyReply,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) {
    reply.code(response.status).send({ error: 'No response body' })
    return
  }

  reply.raw.writeHead(response.status, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      reply.raw.write(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }

  reply.raw.end()
}
