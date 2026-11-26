import { createServer } from 'node:http'

const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:5174'])
let server

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export async function startServer(port = 3001) {
  if (server?.listening) return server
  const { handler } = await import('../src/handler.js')

  server = createServer(async (request, reply) => {
    const origin = request.headers.origin || ''
    const cors = corsHeaders(origin)
    if (request.method === 'OPTIONS') {
      reply.writeHead(204, cors)
      reply.end()
      return
    }

    try {
      const url = new URL(request.url, 'http://localhost')
      const summaryMatch = url.pathname.match(/^\/exhibits\/([^/]+)\/ratings$/)
      const isPostRating = request.method === 'POST' && url.pathname === '/ratings'
      const isGetSummary = request.method === 'GET' && summaryMatch
      const routeKey = isPostRating
        ? 'POST /ratings'
        : isGetSummary
          ? 'GET /exhibits/{id}/ratings'
          : `${request.method} ${url.pathname}`
      let id
      if (isGetSummary) {
        try { id = decodeURIComponent(summaryMatch[1]) } catch { id = summaryMatch[1] }
      }

      const result = await handler({
        version: '2.0',
        routeKey,
        rawPath: url.pathname,
        pathParameters: id === undefined ? undefined : { id },
        headers: request.headers,
        body: await requestBody(request),
        isBase64Encoded: false,
      })

      reply.writeHead(result.statusCode, {
        'Content-Type': result.headers?.['Content-Type'] || 'application/json',
        ...cors,
      })
      reply.end(result.body)
    } catch (error) {
      console.error(error)
      reply.writeHead(500, { 'Content-Type': 'application/json', ...cors })
      reply.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.removeAllListeners('error')
      resolve()
    })
  })
  return server
}

export async function stopServer() {
  if (!server?.listening) return
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}
