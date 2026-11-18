import fs from 'node:fs'
import path from 'node:path'
import type { CourseRow } from '../types/index.js'

const SOURCE_DIR = '/Users/rayanhassan/My Drive/Scholars OS/Student record/Advising'
const TARGET_DIR = path.resolve('src/data/semesters')

interface RawCourseItem {
  Course?: string
  Section?: string | number
  Faculty?: string
  Days?: string
  Time?: string
  Room?: string
  'Seats Available'?: string | number
  Credits?: string | number
}

function processAndSave(fileName: string, targetFile: string) {
  const fullPath = path.join(SOURCE_DIR, fileName)
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`)
    return
  }

  const rawContent = fs.readFileSync(fullPath, 'utf-8')
  const rawList: RawCourseItem[] = JSON.parse(rawContent)

  const cleaned: CourseRow[] = rawList
    .filter((item) => item.Course && item.Time)
    .map((item) => {
      const course = String(item.Course || '').trim().toUpperCase()
      const days = String(item.Days || '').trim().toUpperCase()
      let time = String(item.Time || '').trim()

      // Merge Days and Time if Time doesn't start with day characters (e.g. "MW 04:20 PM - 05:50 PM")
      const hasDaysPrefix = /^([A-Za-z]{1,3})\s+\d/.test(time)
      if (!hasDaysPrefix && days) {
        time = `${days} ${time}`
      }

      return {
        Course: course,
        Section: String(item.Section || '').trim(),
        Faculty: String(item.Faculty || 'TBA').trim(),
        Days: days || undefined,
        Time: time,
        Room: String(item.Room || 'TBA').trim(),
        'Seats Available': item['Seats Available'] ?? '0',
        Credits: item.Credits ?? '3',
      }
    })

  fs.writeFileSync(path.join(TARGET_DIR, targetFile), JSON.stringify(cleaned, null, 2))
  console.log(`Successfully converted ${fileName} -> ${targetFile} (${cleaned.length} courses)`)
}

// Q1 = Spring, Q2 = Summer, Q3 = Fall
processAndSave('Courses-Q1-2026.json', 'spring2026.json')
processAndSave('Courses-Q2-2026.json', 'summer2026.json')
processAndSave('Courses-Q3-2026.json', 'fall2026.json')
