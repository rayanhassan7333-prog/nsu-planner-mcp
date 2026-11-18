import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createPlannerMcpServer } from '../src/server.js'

// In serverless instances, keep a session registry for SSE
const sseTransports = new Map<string, SSEServerTransport>()

// Stateless Streamable HTTP transport instance for newer clients (like Claude)
const streamableTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
})

const mcpServer = createPlannerMcpServer()
let streamableConnected = false

async function getConnectedStreamableTransport() {
  if (!streamableConnected) {
    await mcpServer.connect(streamableTransport)
    streamableConnected = true
  }
  return streamableTransport
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // Health check / root
  if (req.method === 'GET' && pathname === '/') {
    return res.status(200).json({
      status: 'online',
      server: 'nsu-course-planner-mcp',
      version: '1.0.0',
      protocols: ['streamable-http', 'sse'],
      endpoints: {
        mcp: '/mcp or /api/mcp (Streamable HTTP - Recommended for Claude)',
        sse: '/sse or /api/sse (SSE Transport)',
        messages: '/api/messages (SSE POST)',
      },
    })
  }

  // 1. Streamable HTTP endpoint (/mcp) - Used by Claude & newer MCP clients
  if (pathname === '/mcp' || pathname === '/api/mcp') {
    const transport = await getConnectedStreamableTransport()
    await transport.handleRequest(req as any, res as any)
    return
  }

  // 2. SSE endpoint (/sse) - Legacy & broad compatibility
  if (req.method === 'GET' && (pathname === '/sse' || pathname === '/api/sse')) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const server = createPlannerMcpServer()
    const transport = new SSEServerTransport('/api/messages', res as any)

    sseTransports.set(transport.sessionId, transport)

    transport.onclose = () => {
      sseTransports.delete(transport.sessionId)
    }

    await server.connect(transport)
    return
  }

  // SSE message handler
  if (req.method === 'POST' && (pathname === '/messages' || pathname === '/api/messages')) {
    const sessionId = (req.query.sessionId as string) || url.searchParams.get('sessionId')
    if (!sessionId) {
      return res.status(400).send('Missing sessionId')
    }

    const transport = sseTransports.get(sessionId)
    if (!transport) {
      return res.status(404).send('Session not found or expired')
    }

    await transport.handlePostMessage(req as any, res as any)
    return
  }

  return res.status(404).send('Not Found')
}
