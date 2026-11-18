import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createPlannerMcpServer } from '../src/server.js'

// In serverless instances, keep a session registry
const transports = new Map<string, SSEServerTransport>()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  // Health check / root
  if (req.method === 'GET' && (pathname === '/' || pathname === '/api' || pathname === '/api/index')) {
    return res.status(200).json({
      status: 'online',
      server: 'nsu-course-planner-mcp',
      version: '1.0.0',
      endpoints: {
        sse: '/sse or /api/sse',
        messages: '/messages or /api/messages',
      },
    })
  }

  // SSE endpoint
  if (req.method === 'GET' && (pathname === '/sse' || pathname === '/api/sse')) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const mcpServer = createPlannerMcpServer()
    const transport = new SSEServerTransport('/api/messages', res as any)

    transports.set(transport.sessionId, transport)

    transport.onclose = () => {
      transports.delete(transport.sessionId)
    }

    await mcpServer.connect(transport)
    return
  }

  // Message handler endpoint
  if (req.method === 'POST' && (pathname === '/messages' || pathname === '/api/messages')) {
    const sessionId = (req.query.sessionId as string) || url.searchParams.get('sessionId')
    if (!sessionId) {
      return res.status(400).send('Missing sessionId')
    }

    const transport = transports.get(sessionId)
    if (!transport) {
      return res.status(404).send('Session not found or expired')
    }

    await transport.handlePostMessage(req as any, res as any)
    return
  }

  return res.status(404).send('Not Found')
}
