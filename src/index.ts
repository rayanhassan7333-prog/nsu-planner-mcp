import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createPlannerMcpServer } from './server.js'

const app = express()
const port = process.env.PORT || 3000

// In serverless instances, keep a session registry for SSE
const sseTransports = new Map<string, SSEServerTransport>()

// Standard JSON body parsing needed for Streamable HTTP POST
app.use(express.json())

// Serve static assets (logo.png, favicon.ico)
app.use(express.static('public'))

// Health check / root
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    server: 'nsu-course-planner-mcp',
    version: '1.0.0',
    protocols: ['streamable-http', 'sse'],
    endpoints: {
      mcp: '/mcp (Streamable HTTP)',
      sse: '/sse (SSE Transport)',
    },
  })
})

// 1. Streamable HTTP endpoint (/mcp) - used by Claude & modern MCP clients
app.post('/mcp', async (req, res) => {
  const server = createPlannerMcpServer()
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)

    res.on('close', () => {
      transport.close()
      server.close()
    })
  } catch (error: any) {
    console.error('Error handling MCP request:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message || 'Internal server error',
        },
        id: null,
      })
    }
  }
})

app.get('/mcp', async (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed. Use POST for Streamable HTTP.',
    },
    id: null,
  })
})

// 2. SSE endpoint (/sse) - used by Gemini & older MCP clients
app.get('/sse', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const server = createPlannerMcpServer()
  const transport = new SSEServerTransport('/messages', res)

  sseTransports.set(transport.sessionId, transport)

  transport.onclose = () => {
    sseTransports.delete(transport.sessionId)
  }

  await server.connect(transport)
})

// SSE message handler
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string
  if (!sessionId) {
    res.status(400).send('Missing sessionId')
    return
  }

  const transport = sseTransports.get(sessionId)
  if (!transport) {
    res.status(404).send('Session not found or expired')
    return
  }

  await transport.handlePostMessage(req, res)
})

export default app

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`NSU Planner MCP Server running on port ${port}`)
  })
}
