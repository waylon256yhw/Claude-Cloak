// Minimal Anthropic-shaped echo server.
//
// Logs every incoming request as a `::REQ:: {...}` JSON chunk to stdout,
// and replies with the smallest valid Anthropic message envelope so the
// real Claude Code CLI sees a successful turn and exits cleanly (rather
// than hanging while it waits for more SSE frames).
//
// Usage:
//   node echo-server.mjs [port]
// Default port: 7700.

import http from 'node:http'

const PORT = Number(process.argv[2] || 7700)

http
  .createServer((req, res) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', () => {
      let parsed = null
      if (body) {
        try {
          parsed = JSON.parse(body)
        } catch {
          parsed = { _raw: body.slice(0, 2000) }
        }
      }
      console.log(
        '::REQ::',
        JSON.stringify(
          {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: parsed,
          },
          null,
          2,
        ),
      )

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          type: 'message',
          id: 'msg_cc_capture_echo',
          role: 'assistant',
          model: 'echo',
          content: [{ type: 'text', text: 'echo' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      )
    })
  })
  .listen(PORT, () => {
    console.error(`echo-server listening on ${PORT}`)
  })
