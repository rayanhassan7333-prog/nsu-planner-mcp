import path from 'path'
import express from 'express'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createPlannerMcpServer } from './server.js'
import { listAvailableSemesters, getCoursesForSemester } from './data/index.js'
import { checkSectionsForConflicts } from './engine/conflict.js'
import { solveRoutines } from './engine/solver.js'
import type { CourseRow } from './types/index.js'

const app = express()
const port = process.env.PORT || 3000

// In serverless instances, keep a session registry for SSE
const sseTransports = new Map<string, SSEServerTransport>()

// Standard middleware
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})
app.use(express.json())

// Serve static assets (logo.png, favicon.ico, etc.) safely across local and Vercel serverless environments
const publicDir = path.join(process.cwd(), 'public')
app.use(express.static(publicDir))

// Health check / root
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    server: 'nsu-course-planner-mcp',
    version: '1.0.0',
    protocols: ['streamable-http', 'sse', 'rest-openapi'],
    endpoints: {
      mcp: '/mcp (Streamable HTTP)',
      sse: '/sse (SSE Transport)',
      openapi: '/api/openapi.json (OpenAPI 3.1 Spec for ChatGPT)',
      semesters: '/api/semesters',
      search: '/api/search',
      conflicts: '/api/conflicts',
      generate: '/api/generate',
    },
  })
})

// ==========================================
// REST API Endpoints (Used by ChatGPT Actions)
// ==========================================

// 1. Semesters
app.get('/api/semesters', (_req, res) => {
  res.json(listAvailableSemesters())
})

// 2. Search courses
app.get('/api/search', (req, res) => {
  const semester = req.query.semester as string | undefined
  const query = req.query.query as string | undefined
  const faculty = req.query.faculty as string | undefined
  const days = req.query.days as string | undefined
  const hasSeatsOnly = req.query.hasSeatsOnly === 'true'

  const { semester: semName, courses } = getCoursesForSemester(semester)
  let results = courses
  if (query) {
    const q = query.toUpperCase().trim()
    results = results.filter((c) => c.Course.toUpperCase().includes(q))
  }
  if (faculty) {
    const f = faculty.toUpperCase().trim()
    results = results.filter((c) => (c.Faculty || '').toUpperCase().includes(f))
  }
  if (days) {
    const d = days.toUpperCase().trim()
    results = results.filter((c) => (c.Time || '').toUpperCase().includes(d))
  }
  if (hasSeatsOnly) {
    results = results.filter((c) => Number(c['Seats Available'] || 0) > 0)
  }
  res.json({ semester: semName, count: results.length, results: results.slice(0, 50) })
})

// 3. Conflict detection
app.post('/api/conflicts', (req, res) => {
  const { sections, semester } = req.body || {}
  const { semester: semName, courses } = getCoursesForSemester(semester)
  const foundSections: CourseRow[] = []
  const missing: string[] = []

  for (const item of sections || []) {
    const match = courses.find(
      (c) =>
        c.Course.toUpperCase() === (item.course || '').toUpperCase() &&
        String(c.Section) === String(item.section)
    )
    if (match) foundSections.push(match)
    else missing.push(`${item.course} Section ${item.section}`)
  }

  const report = checkSectionsForConflicts(foundSections)
  res.json({
    semester: semName,
    checkedSectionsCount: foundSections.length,
    missingFromCatalog: missing,
    hasConflict: report.hasConflict,
    conflicts: report.conflicts,
  })
})

// 4. Routine generation
app.post('/api/generate', (req, res) => {
  const { courses: targetCourses, maxDays, maxFinalsPerDay, noEarlyClasses, noLateClasses, preferredFaculties, semester, limit } = req.body || {}
  const { semester: semName, courses } = getCoursesForSemester(semester)
  const routines = solveRoutines(courses, targetCourses || [], {
    maxDays: (maxDays as 2 | 3 | 4 | null) || null,
    maxFinalsPerDay: maxFinalsPerDay || null,
    noEarlyClasses,
    noLateClasses,
    preferredFacultiesByCourse: preferredFaculties,
    limit: limit || 3,
  })
  res.json({
    semester: semName,
    targetCourses: targetCourses || [],
    foundRoutinesCount: routines.length,
    routines,
  })
})

// 5. OpenAPI JSON specification for ChatGPT Actions
app.get('/api/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'NSU Advising Planner API',
      description: 'Course catalog, clash detection, and routine generation API for North South University (NSU).',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'https://nsu-planner-mcp.vercel.app',
      },
    ],
    paths: {
      '/api/semesters': {
        get: {
          operationId: 'listSemesters',
          summary: 'List available semesters',
          responses: {
            '200': {
              description: 'List of academic terms',
            },
          },
        },
      },
      '/api/search': {
        get: {
          operationId: 'searchCourses',
          summary: 'Search course catalog by course code, faculty, days, or seats',
          parameters: [
            { name: 'query', in: 'query', schema: { type: 'string' }, description: 'Course code query, e.g. CSE115' },
            { name: 'faculty', in: 'query', schema: { type: 'string' }, description: 'Faculty initial, e.g. TBZ' },
            { name: 'days', in: 'query', schema: { type: 'string' }, description: 'Days filter, e.g. ST or MW' },
            { name: 'hasSeatsOnly', in: 'query', schema: { type: 'boolean' }, description: 'Only sections with seats > 0' },
            { name: 'semester', in: 'query', schema: { type: 'string' }, description: 'Semester ID (defaults to active)' },
          ],
          responses: {
            '200': {
              description: 'Matching course sections',
            },
          },
        },
      },
      '/api/conflicts': {
        post: {
          operationId: 'checkConflicts',
          summary: 'Check if a list of course sections clash in time',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          course: { type: 'string' },
                          section: { type: 'string' },
                        },
                        required: ['course', 'section'],
                      },
                    },
                    semester: { type: 'string' },
                  },
                  required: ['sections'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Conflict detection report',
            },
          },
        },
      },
      '/api/generate': {
        post: {
          operationId: 'generateRoutines',
          summary: 'Generate optimal conflict-free weekly class routines',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    courses: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'List of target course codes, e.g. ["CSE115", "MAT116"]',
                    },
                    maxDays: { type: 'integer', description: 'Preferred days per week (2, 3, or 4)' },
                    noEarlyClasses: { type: 'boolean', description: 'Avoid 8:00 AM classes' },
                    noLateClasses: { type: 'boolean', description: 'Avoid evening classes after 4:20 PM' },
                    semester: { type: 'string', description: 'Semester ID' },
                    limit: { type: 'integer', description: 'Number of routines to return' },
                  },
                  required: ['courses'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Generated routine options',
            },
          },
        },
      },
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
