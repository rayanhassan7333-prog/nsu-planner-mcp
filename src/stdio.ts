import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createPlannerMcpServer } from './server.js'

async function runStdioServer() {
  const server = createPlannerMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

runStdioServer().catch((error) => {
  console.error('Fatal error in stdio server:', error)
  process.exit(1)
})
