import type { FastifyReply } from 'fastify'

export async function pipeStream(
  response: { status: number; body: ReadableStream | null },
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

  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()

  try {
    while (!signal.aborted) {
      const result = await reader.read()
      if (result.done) break

      if (result.value) {
        const chunk = decoder.decode(result.value, { stream: true })
        const canContinue = reply.raw.write(chunk)

        // Handle backpressure: pause if downstream is slow
        if (!canContinue) {
          await new Promise<void>((resolve) => {
            reply.raw.once('drain', resolve)
          })
        }
      }
    }
  } catch (err) {
    // Abort reader on error or signal
    reader.cancel()
    throw err
  } finally {
    reader.releaseLock()
  }

  reply.raw.end()
}
