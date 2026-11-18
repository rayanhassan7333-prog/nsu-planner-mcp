import type { CourseRow, GenerationPreferences, GeneratedRoutine } from '../types/index.js'
import { parseScheduleTime, overlap, DAY_NAMES, formatMinutes, timeToSlot } from './time.js'

export function computeFinalsPerDay(sections: CourseRow[]): {
  maxFinalsOnAnyDay: number
  finalsExamSchedule: Record<string, { oddSlotExams: string[]; evenSlotExams: string[] }>
} {
  // Day group mapping:
  // At NSU:
  // ST courses hold exams on designated exam days for ST.
  // MW courses hold exams on designated exam days for MW.
  // Single days (R, A, F) have their own exam days.
  // Within a day group, Odd slots (1, 3, 5) share an exam day and Even slots (2, 4, 6) share another exam day!
  const groups: Record<string, { odd: string[]; even: string[] }> = {}

  for (const s of sections) {
    const parsed = parseScheduleTime(s.Time)
    const slot = timeToSlot(parsed.s) // 1 = 8:00am, 2 = 9:40am, 3 = 11:20am, etc.
    const dayGroup = parsed.rawDays || 'OTHER'

    if (!groups[dayGroup]) {
      groups[dayGroup] = { odd: [], even: [] }
    }

    const courseLabel = `${s.Course}.${s.Section} (Slot ${slot})`
    if (slot % 2 === 1) {
      groups[dayGroup].odd.push(courseLabel)
    } else {
      groups[dayGroup].even.push(courseLabel)
    }
  }

  let maxFinalsOnAnyDay = 0
  const finalsExamSchedule: Record<string, { oddSlotExams: string[]; evenSlotExams: string[] }> = {}

  for (const [dayGroup, data] of Object.entries(groups)) {
    finalsExamSchedule[dayGroup] = {
      oddSlotExams: data.odd,
      evenSlotExams: data.even,
    }
    if (data.odd.length > maxFinalsOnAnyDay) maxFinalsOnAnyDay = data.odd.length
    if (data.even.length > maxFinalsOnAnyDay) maxFinalsOnAnyDay = data.even.length
  }

  return {
    maxFinalsOnAnyDay,
    finalsExamSchedule,
  }
}

function buildTimetable(sections: CourseRow[]): Record<string, Array<{
  course: string
  section: string
  faculty: string
  start: string
  end: string
  room: string
}>> {
  const timetable: Record<string, Array<{
    course: string
    section: string
    faculty: string
    start: string
    end: string
    room: string
  }>> = {}

  for (const s of sections) {
    const parsed = parseScheduleTime(s.Time)
    for (const d of parsed.days) {
      const dayName = DAY_NAMES[d] || d
      if (!timetable[dayName]) timetable[dayName] = []
      timetable[dayName].push({
        course: s.Course,
        section: String(s.Section),
        faculty: s.Faculty || 'TBA',
        start: formatMinutes(parsed.s),
        end: formatMinutes(parsed.e),
        room: s.Room || 'TBA',
      })
    }
  }

  // Sort each day chronologically
  for (const day of Object.keys(timetable)) {
    timetable[day].sort((a, b) => a.start.localeCompare(b.start))
  }

  return timetable
}

export function solveRoutines(
  coursesData: CourseRow[],
  targetCourseCodes: string[],
  preferences: GenerationPreferences = {}
): GeneratedRoutine[] {
  // 1. Group sections by target course code
  const courseCodeMap = new Map<string, CourseRow[]>()
  for (const code of targetCourseCodes) {
    const normalized = code.trim().toUpperCase()
    const matches = coursesData.filter(
      (c) => c.Course.trim().toUpperCase() === normalized
    )
    if (matches.length > 0) {
      courseCodeMap.set(normalized, matches)
    }
  }

  // If any target course has 0 sections found in the catalog, we cannot make a full routine
  const availableTargetCodes = targetCourseCodes
    .map((c) => c.trim().toUpperCase())
    .filter((c) => courseCodeMap.has(c))

  if (availableTargetCodes.length === 0) {
    return []
  }

  // Pre-filter sections based on hard preferences if desired
  const sectionsPerCourse: CourseRow[][] = availableTargetCodes.map((code) => {
    let pool = courseCodeMap.get(code)!
    if (preferences.preferredFacultiesByCourse?.[code]?.length) {
      const preferred = preferences.preferredFacultiesByCourse[code].map((f) => f.toUpperCase())
      const filtered = pool.filter((c) => preferred.includes((c.Faculty || '').toUpperCase()))
      if (filtered.length > 0) pool = filtered
    }
    return pool
  })

  // 2. Combinatorial Backtracking to find non-conflicting schedules
  const validCombinations: CourseRow[][] = []
  const maxLimit = preferences.limit || 5

  function backtrack(index: number, currentCombo: CourseRow[]) {
    if (validCombinations.length >= 100) return // Cap search at 100 valid combos to rank
    if (index === sectionsPerCourse.length) {
      validCombinations.push([...currentCombo])
      return
    }

    const currentCandidates = sectionsPerCourse[index]
    for (const candidate of currentCandidates) {
      const candParsed = parseScheduleTime(candidate.Time)

      // Filter: no early morning classes
      if (preferences.noEarlyClasses && candParsed.s <= 8 * 60) {
        continue
      }
      // Filter: no late classes
      if (preferences.noLateClasses && candParsed.e >= 18 * 60) {
        continue
      }

      // Check conflict with already chosen courses
      let clash = false
      for (const chosen of currentCombo) {
        if (overlap(candParsed, parseScheduleTime(chosen.Time))) {
          clash = true
          break
        }
      }

      if (!clash) {
        currentCombo.push(candidate)
        
        // Check partial finals limit constraint
        if (preferences.maxFinalsPerDay) {
          const finalsInfo = computeFinalsPerDay(currentCombo)
          if (finalsInfo.maxFinalsOnAnyDay > preferences.maxFinalsPerDay) {
            currentCombo.pop()
            continue
          }
        }

        backtrack(index + 1, currentCombo)
        currentCombo.pop()
      }
    }
  }

  backtrack(0, [])

  // 3. Score and Rank combinations
  const ranked = validCombinations.map((combo) => {
    const daysSet = new Set<string>()
    let totalFacultyMatches = 0
    let lateSlotPenalty = 0

    for (const sec of combo) {
      const parsed = parseScheduleTime(sec.Time)
      parsed.days.forEach((d) => daysSet.add(d))

      if (parsed.s >= 16 * 60) {
        lateSlotPenalty += 1
      }

      const prefFaculty = preferences.preferredFacultiesByCourse?.[sec.Course.toUpperCase()]
      if (prefFaculty?.includes(sec.Faculty?.toUpperCase() || '')) {
        totalFacultyMatches += 2
      }
    }

    // Fewer days per week is usually favored (e.g. 2 days vs 4 days)
    const daysCount = daysSet.size
    let dayPenalty = 0
    if (preferences.maxDays && daysCount > preferences.maxDays) {
      dayPenalty += 10
    }

    const score = 100 + (totalFacultyMatches * 10) - (daysCount * 5) - (lateSlotPenalty * 2) - dayPenalty

    return {
      combo,
      score,
      daysCount,
      uniqueDays: Array.from(daysSet).map((d) => DAY_NAMES[d] || d),
    }
  })

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score)

  // 4. Format top results
  return ranked.slice(0, maxLimit).map((item, idx) => {
    const finalsInfo = computeFinalsPerDay(item.combo)
    return {
      rank: idx + 1,
      score: item.score,
      daysCount: item.daysCount,
      uniqueDays: item.uniqueDays,
      maxFinalsOnAnyDay: finalsInfo.maxFinalsOnAnyDay,
      finalsExamSchedule: finalsInfo.finalsExamSchedule,
      sections: item.combo.map((s) => {
        const parsed = parseScheduleTime(s.Time)
        return {
          course: s.Course,
          section: String(s.Section),
          faculty: s.Faculty || 'TBA',
          days: s.Days || parsed.rawDays,
          time: s.Time,
          room: s.Room || 'TBA',
          slot: timeToSlot(parsed.s),
        }
      }),
      timetable: buildTimetable(item.combo),
    }
  })
}
