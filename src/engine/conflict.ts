import type { CourseRow, ParsedTime } from '../types/index.js'
import { parseScheduleTime, overlap, DAY_NAMES } from './time.js'

export interface ConflictDetail {
  hasConflict: boolean
  conflicts: Array<{
    courseA: string
    sectionA: string
    timeA: string
    courseB: string
    sectionB: string
    timeB: string
    overlappingDays: string[]
    reason: string
  }>
}

export function checkSectionsForConflicts(sections: CourseRow[]): ConflictDetail {
  const parsedTimes: Array<{ row: CourseRow; parsed: ParsedTime }> = sections.map((row) => ({
    row,
    parsed: parseScheduleTime(row.Time),
  }))

  const conflicts: ConflictDetail['conflicts'] = []

  for (let i = 0; i < parsedTimes.length; i++) {
    for (let j = i + 1; j < parsedTimes.length; j++) {
      const a = parsedTimes[i]
      const b = parsedTimes[j]

      if (overlap(a.parsed, b.parsed)) {
        const sharedDayChars = a.parsed.days.filter((d) => b.parsed.days.includes(d))
        const overlappingDays = sharedDayChars.map((d) => DAY_NAMES[d] || d)

        conflicts.push({
          courseA: a.row.Course,
          sectionA: String(a.row.Section),
          timeA: a.row.Time,
          courseB: b.row.Course,
          sectionB: String(b.row.Section),
          timeB: b.row.Time,
          overlappingDays,
          reason: `Time clash between ${a.row.Course} Sec ${a.row.Section} and ${b.row.Course} Sec ${b.row.Section} on ${overlappingDays.join(', ')}`,
        })
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  }
}
