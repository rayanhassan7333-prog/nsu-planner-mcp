import type { CourseRow, SemesterData } from '../types/index.js'
import fall2026Data from './semesters/fall2026.json' with { type: 'json' }
import summer2026Data from './semesters/summer2026.json' with { type: 'json' }
import spring2026Data from './semesters/spring2026.json' with { type: 'json' }

const semestersRegistry: Record<string, SemesterData> = {
  fall2026: {
    id: 'fall2026',
    name: 'Fall 2026',
    isActive: true, // Most recent semester set as active
    courses: fall2026Data as CourseRow[],
  },
  summer2026: {
    id: 'summer2026',
    name: 'Summer 2026',
    isActive: false,
    courses: summer2026Data as CourseRow[],
  },
  spring2026: {
    id: 'spring2026',
    name: 'Spring 2026',
    isActive: false,
    courses: spring2026Data as CourseRow[],
  },
}

export function listAvailableSemesters(): Array<{ id: string; name: string; isActive: boolean; courseCount: number }> {
  return Object.values(semestersRegistry).map((s) => ({
    id: s.id,
    name: s.name,
    isActive: !!s.isActive,
    courseCount: s.courses.length,
  }))
}

export function getCoursesForSemester(semesterId?: string): { semester: string; courses: CourseRow[] } {
  if (semesterId) {
    const normalized = semesterId.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (semestersRegistry[normalized]) {
      return {
        semester: semestersRegistry[normalized].name,
        courses: semestersRegistry[normalized].courses,
      }
    }
  }

  // Fallback to active semester (Fall 2026)
  const active = Object.values(semestersRegistry).find((s) => s.isActive) || Object.values(semestersRegistry)[0]
  return {
    semester: active.name,
    courses: active.courses,
  }
}
