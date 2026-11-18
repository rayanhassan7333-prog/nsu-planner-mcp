import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listAvailableSemesters, getCoursesForSemester } from './data/index.js'
import { checkSectionsForConflicts } from './engine/conflict.js'
import { solveRoutines } from './engine/solver.js'
import type { CourseRow } from './types/index.js'

export function createPlannerMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'NSU Advising Planner',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // 1. Tool: list_semesters
  server.tool(
    'list_semesters',
    'List all available academic semesters (active and historical) loaded in the system.',
    {},
    async () => {
      const semesters = listAvailableSemesters()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(semesters, null, 2),
          },
        ],
      }
    }
  )

  // 2. Tool: search_courses
  server.tool(
    'search_courses',
    'Search course catalog by course code, faculty initials, days, or open seats.',
    {
      query: z.string().optional().describe('Course code query, e.g. "CSE115" or "MAT"'),
      faculty: z.string().optional().describe('Faculty initial query, e.g. "TBZ" or "RAH1"'),
      days: z.string().optional().describe('Days filter, e.g. "ST" or "MW" or "R"'),
      hasSeatsOnly: z.boolean().optional().describe('Only show sections with seats available > 0'),
      semester: z.string().optional().describe('Semester ID, e.g. "spring2026" or "fall2025" (defaults to active)'),
    },
    async (args) => {
      const { semester, courses } = getCoursesForSemester(args.semester)
      let results = courses

      if (args.query) {
        const q = args.query.toUpperCase().trim()
        results = results.filter((c) => c.Course.toUpperCase().includes(q))
      }

      if (args.faculty) {
        const f = args.faculty.toUpperCase().trim()
        results = results.filter((c) => (c.Faculty || '').toUpperCase().includes(f))
      }

      if (args.days) {
        const d = args.days.toUpperCase().trim()
        results = results.filter((c) => (c.Time || '').toUpperCase().includes(d))
      }

      if (args.hasSeatsOnly) {
        results = results.filter((c) => {
          const seats = Number(c['Seats Available'] || 0)
          return seats > 0
        })
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                semester,
                count: results.length,
                results: results.slice(0, 50), // Cap payload size
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )

  // 3. Tool: check_conflicts
  server.tool(
    'check_conflicts',
    'Check if a specific set of course sections have any time clashes or overlaps.',
    {
      sections: z.array(
        z.object({
          course: z.string().describe('Course code, e.g. CSE115'),
          section: z.string().describe('Section number, e.g. "1"'),
        })
      ).describe('List of course sections to check'),
      semester: z.string().optional().describe('Semester ID (defaults to active)'),
    },
    async (args) => {
      const { semester, courses } = getCoursesForSemester(args.semester)
      const foundSections: CourseRow[] = []
      const missing: string[] = []

      for (const item of args.sections) {
        const match = courses.find(
          (c) =>
            c.Course.toUpperCase() === item.course.toUpperCase() &&
            String(c.Section) === String(item.section)
        )
        if (match) {
          foundSections.push(match)
        } else {
          missing.push(`${item.course} Section ${item.section}`)
        }
      }

      const report = checkSectionsForConflicts(foundSections)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                semester,
                checkedSectionsCount: foundSections.length,
                missingFromCatalog: missing,
                hasConflict: report.hasConflict,
                conflicts: report.conflicts,
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )

  // 4. Tool: generate_routines
  server.tool(
    'generate_routines',
    'Generate optimal non-conflicting weekly routines for a set of target courses with preferences.',
    {
      courses: z.array(z.string()).describe('List of target course codes, e.g. ["CSE115", "MAT116", "ENG102"]'),
      maxDays: z.number().optional().describe('Preferred max days per week, e.g. 2 or 4'),
      maxFinalsPerDay: z.number().optional().describe('Maximum number of final exams you can handle on the same day (e.g. 1 or 2). Odd slots (1,3,5) and Even slots (2,4,6) share final exam days at NSU.'),
      noEarlyClasses: z.boolean().optional().describe('Avoid 08:00 AM slots if possible'),
      noLateClasses: z.boolean().optional().describe('Avoid late evening classes (past 04:20 PM)'),
      preferredFaculties: z.record(z.string(), z.array(z.string())).optional().describe('Course-specific preferred faculty initials, e.g. {"CSE115": ["TBZ"]}'),
      semester: z.string().optional().describe('Semester ID (defaults to active)'),
      limit: z.number().optional().describe('Number of top routine combinations to return (default 3)'),
    },
    async (args) => {
      const { semester, courses } = getCoursesForSemester(args.semester)
      const routines = solveRoutines(courses, args.courses, {
        maxDays: (args.maxDays as 2 | 3 | 4 | null) || null,
        maxFinalsPerDay: args.maxFinalsPerDay || null,
        noEarlyClasses: args.noEarlyClasses,
        noLateClasses: args.noLateClasses,
        preferredFacultiesByCourse: args.preferredFaculties,
        limit: args.limit || 3,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                semester,
                targetCourses: args.courses,
                foundRoutinesCount: routines.length,
                routines,
              },
              null,
              2
            ),
          },
        ],
      }
    }
  )

  return server
}
