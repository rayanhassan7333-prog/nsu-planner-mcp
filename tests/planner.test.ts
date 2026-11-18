import test from 'node:test'
import assert from 'node:assert/strict'
import { parseScheduleTime, overlap } from '../src/engine/time.js'
import { checkSectionsForConflicts } from '../src/engine/conflict.js'
import { solveRoutines } from '../src/engine/solver.js'
import { getCoursesForSemester } from '../src/data/index.js'
import type { CourseRow } from '../src/types/index.js'

test('time parser parses days and slot minutes correctly', () => {
  const parsed = parseScheduleTime('ST 09:40 AM - 11:10 AM')
  assert.deepEqual(parsed.days, ['S', 'T'])
  assert.equal(parsed.s, 9 * 60 + 40)
  assert.equal(parsed.e, 11 * 60 + 10)
})

test('overlap detection flags clashes correctly', () => {
  const a = parseScheduleTime('ST 09:40 AM - 11:10 AM')
  const b = parseScheduleTime('ST 10:00 AM - 11:30 AM')
  const c = parseScheduleTime('MW 09:40 AM - 11:10 AM')

  assert.equal(overlap(a, b), true, 'Same day overlapping time should clash')
  assert.equal(overlap(a, c), false, 'Different days should never clash')
})

test('conflict checker reports section collisions', () => {
  const sections: CourseRow[] = [
    {
      Course: 'CSE115',
      Section: '1',
      Time: 'ST 09:40 AM - 11:10 AM',
    },
    {
      Course: 'MAT116',
      Section: '1',
      Time: 'ST 09:40 AM - 11:10 AM',
    },
  ]

  const report = checkSectionsForConflicts(sections)
  assert.equal(report.hasConflict, true)
  assert.equal(report.conflicts.length, 1)
})

test('solver generates non-conflicting routine from catalog data', () => {
  const { courses } = getCoursesForSemester('spring2026')
  const routines = solveRoutines(courses, ['CSE115', 'MAT116', 'ENG102'], {
    limit: 3,
  })

  assert.ok(routines.length > 0, 'Should find at least 1 valid routine')
  assert.equal(routines[0].sections.length, 3, 'Should have all 3 courses')
  
  // Verify that the sections in routine 0 do not clash
  const sectionRows: CourseRow[] = routines[0].sections.map((s) => ({
    Course: s.course,
    Section: s.section,
    Time: s.time,
  }))
  const conflictReport = checkSectionsForConflicts(sectionRows)
  assert.equal(conflictReport.hasConflict, false, 'Generated routine must have zero time conflicts')
})
