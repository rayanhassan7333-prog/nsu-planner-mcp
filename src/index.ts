import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createPlannerMcpServer } from './server.js'

const app = express()
const port = process.env.PORT || 3000

// In serverless instances, keep a session registry for SSE
const sseTransports = new Map<string, SSEServerTransport>()

// Streamable HTTP transport for modern MCP clients (Claude)
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

// 1. Streamable HTTP endpoint (/mcp)
app.all('/mcp', async (req, res) => {
  try {
    const transport = await getConnectedStreamableTransport()
    await transport.handleRequest(req, res)
  } catch (err: any) {
    console.error('Error in /mcp handler:', err)
    res.status(500).json({ error: err.message })
  }
})

// 2. SSE endpoint (/sse)
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
