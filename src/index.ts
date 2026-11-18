import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createPlannerMcpServer } from './server.js'

const app = express()
const port = process.env.PORT || 3000
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || ''

// Map to track active SSE transports by session ID
const transports = new Map<string, SSEServerTransport>()

// Middleware for optional Bearer / Query token authentication
app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next() // If no token is set in env, allow all
  const token = req.query.token || req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized: Invalid MCP token' })
    return
  }
  next()
})

// Health / Status endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    server: 'nsu-course-planner-mcp',
    version: '1.0.0',
    documentation: 'Connect your MCP client to /sse',
  })
})

// SSE endpoint for Gemini / MCP Clients
app.get('/sse', async (_req, res) => {
  const mcpServer = createPlannerMcpServer()
  const transport = new SSEServerTransport('/messages', res)

  transports.set(transport.sessionId, transport)

  transport.onclose = () => {
    transports.delete(transport.sessionId)
  }

  await mcpServer.connect(transport)
})

// Message handler endpoint
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string
  const transport = transports.get(sessionId)

  if (!transport) {
    res.status(404).send('Session not found')
    return
  }

  await transport.handlePostMessage(req, res)
})

app.listen(port, () => {
  console.log(`NSU Planner MCP Server running at http://localhost:${port}`)
  console.log(`SSE endpoint: http://localhost:${port}/sse`)
})
