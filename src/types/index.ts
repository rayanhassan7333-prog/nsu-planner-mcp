export interface CourseRow {
  Course: string
  Days?: string
  Section: string
  Faculty?: string
  Time: string
  Room?: string
  'Seats Available'?: string | number
  Credits?: string | number
}

export interface ParsedTime {
  days: string[]
  rawDays: string
  s: number
  e: number
  ss: string
  es: string
  dayMask: number
}

export interface SemesterData {
  id: string
  name: string
  isActive?: boolean
  courses: CourseRow[]
}

export interface GenerationPreferences {
  maxDays?: 2 | 3 | 4 | 5 | 6 | null
  maxFinalsPerDay?: number | null // Limit exams on the same day (Odd slots vs Even slots per day)
  dayPattern?: string // e.g. "ST" or "MW" or "RA"
  noEarlyClasses?: boolean // Avoid 08:00 AM slots
  noLateClasses?: boolean  // Avoid evening slots (e.g. after 04:20 PM)
  preferredFacultiesByCourse?: Record<string, string[]>
  limit?: number
}

export interface GeneratedRoutine {
  rank: number
  score: number
  daysCount: number
  uniqueDays: string[]
  maxFinalsOnAnyDay: number
  finalsExamSchedule: Record<string, {
    oddSlotExams: string[]
    evenSlotExams: string[]
  }>
  sections: Array<{
    course: string
    section: string
    faculty: string
    days: string
    time: string
    room: string
    slot: number
  }>
  timetable: Record<string, Array<{
    course: string
    section: string
    faculty: string
    start: string
    end: string
    room: string
  }>>
}
