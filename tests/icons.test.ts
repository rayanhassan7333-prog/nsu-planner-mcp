import test from 'node:test'
import assert from 'node:assert'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createPlannerMcpServer } from '../src/server.js'

test('server metadata exposes icons complying with MCP specification for Gemini/Claude', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createPlannerMcpServer()
  await server.connect(serverTransport)

  const client = new Client({ name: 'gemini-client', version: '1.0.0' }, { capabilities: {} })
  await client.connect(clientTransport)

  const serverInfo = client.getServerVersion()
  assert.ok(serverInfo, 'serverInfo must be defined')
  assert.ok(Array.isArray(serverInfo.icons), 'icons must be an array')
  assert.ok(serverInfo.icons.length > 0, 'icons array must not be empty')

  const base64Icon = serverInfo.icons[0]
  assert.ok(base64Icon.src.startsWith('data:image/png;base64,'), 'Primary icon should be a data:image/png;base64 URI')
  assert.strictEqual(base64Icon.mimeType, 'image/png')
  assert.deepStrictEqual(base64Icon.sizes, ['64x64'])

  const httpsIcon = serverInfo.icons.find((i: any) => i.src.startsWith('https://'))
  assert.ok(httpsIcon, 'Should also supply an https:// fallback icon')
})
