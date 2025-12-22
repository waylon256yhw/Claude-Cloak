import type { FastifyReply } from 'fastify'

export async function pipeStream(
  response: { status: number; body: ReadableStream | null },
  reply: FastifyReply,
  signal: AbortSignal,
  idleTimeout?: number
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

  // Idle timeout: reset on each chunk, abort if no data for too long
  let timeoutId: NodeJS.Timeout | undefined
  const resetIdleTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId)
    if (idleTimeout) {
      timeoutId = setTimeout(() => {
        reader.cancel()
      }, idleTimeout)
    }
  }

  try {
    resetIdleTimeout() // Start idle timeout

    while (!signal.aborted) {
      const result = await reader.read()
      if (result.done) break

      if (result.value) {
        const chunk = decoder.decode(result.value, { stream: true })

        // Check if response is still writable before writing
        if (reply.raw.destroyed || reply.raw.writableEnded) {
          break
        }

        const canContinue = reply.raw.write(chunk)

        // Reset idle timeout after successful chunk write
        resetIdleTimeout()

        // Handle backpressure: pause if downstream is slow
        // Race drain with close/abort to avoid hanging on disconnect
        if (!canContinue && !reply.raw.destroyed) {
          await Promise.race([
            new Promise<void>((resolve) => {
              reply.raw.once('drain', resolve)
            }),
            new Promise<void>((resolve) => {
              reply.raw.once('close', resolve)
              reply.raw.once('error', resolve)
            }),
            new Promise<void>((resolve) => {
              if (signal.aborted) resolve()
              else signal.addEventListener('abort', () => resolve(), { once: true })
            })
          ])

          // If connection closed/aborted during backpressure, stop streaming
          if (reply.raw.destroyed || signal.aborted) {
            break
          }
        }
      }
    }
  } catch (err) {
    // Abort reader on error or signal
    reader.cancel()
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    reader.releaseLock()
  }

  // Only end if not already destroyed/ended
  if (!reply.raw.destroyed && !reply.raw.writableEnded) {
    reply.raw.end()
  }
}
