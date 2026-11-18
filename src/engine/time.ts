import type { ParsedTime } from '../types/index.js'

export const DAY_BITS: Record<string, number> = {
  S: 1,  // Sunday
  M: 2,  // Monday
  T: 4,  // Tuesday
  W: 8,  // Wednesday
  R: 16, // Thursday
  F: 32, // Friday
  A: 64, // Saturday
}

export const DAY_NAMES: Record<string, string> = {
  S: 'Sunday',
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  R: 'Thursday',
  F: 'Friday',
  A: 'Saturday',
}

export const SLOT_TIMES = [
  8 * 60,        // 08:00 AM
  9 * 60 + 40,   // 09:40 AM
  11 * 60 + 20,  // 11:20 AM
  13 * 60,       // 01:00 PM
  14 * 60 + 40,  // 02:40 PM
  16 * 60 + 20,  // 04:20 PM
  18 * 60,       // 06:00 PM
]

const timeToMinutesCache = new Map<string, number>()
const scheduleTimeCache = new Map<string, ParsedTime>()

const EMPTY_PARSED_TIME: ParsedTime = Object.freeze({
  days: [],
  rawDays: '',
  s: 0,
  e: 0,
  ss: '',
  es: '',
  dayMask: 0,
})

export function parseTimeToMinutes(input: string): number {
  if (!input) return 0
  const cached = timeToMinutesCache.get(input)
  if (cached !== undefined) return cached

  const match = input.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!match) {
    timeToMinutesCache.set(input, 0)
    return 0
  }

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  const total = hours * 60 + minutes
  timeToMinutesCache.set(input, total)
  return total
}

export function parseScheduleTime(value: string | undefined): ParsedTime {
  if (!value) return EMPTY_PARSED_TIME
  const cached = scheduleTimeCache.get(value)
  if (cached) return cached

  const match = value.match(/^(\S+)\s+(.+)$/)
  if (!match) {
    scheduleTimeCache.set(value, EMPTY_PARSED_TIME)
    return EMPTY_PARSED_TIME
  }

  // If the 'day' portion looks like a time (e.g., '11:20'), treat the whole string as time-only
  if (/^\d+:\d+$/.test(match[1])) {
    const times = value.split('-').map((part) => part.trim())
    const start = times[0] ?? ''
    const end = times[1] ?? ''
    const result: ParsedTime = {
      days: [],
      rawDays: '',
      s: parseTimeToMinutes(start),
      e: parseTimeToMinutes(end || start),
      ss: start,
      es: end || '',
      dayMask: 0,
    }
    scheduleTimeCache.set(value, result)
    return result
  }

  const rawDays = match[1].toUpperCase()
  const times = match[2].split('-').map((part) => part.trim())
  const start = times[0] ?? ''
  const end = times[1] ?? ''
  const days = rawDays.split('')
  let dayMask = 0
  for (let i = 0; i < days.length; i++) {
    dayMask |= DAY_BITS[days[i]] || 0
  }

  const result: ParsedTime = {
    days,
    rawDays,
    s: parseTimeToMinutes(start),
    e: parseTimeToMinutes(end || start),
    ss: start,
    es: end || '',
    dayMask,
  }

  scheduleTimeCache.set(value, result)
  return result
}

export function overlap(a: ParsedTime, b: ParsedTime): boolean {
  if (a.dayMask !== undefined && b.dayMask !== undefined) {
    if ((a.dayMask & b.dayMask) === 0) return false
    return a.s < b.e && b.s < a.e
  }
  if (!a.days.length || !b.days.length) return false
  const sharesDay = a.days.some((day) => b.days.includes(day))
  return sharesDay && a.s < b.e && b.s < a.e
}

export function formatMinutes(mins: number): string {
  const hours24 = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`
}

export function timeToSlot(mins: number): number {
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  SLOT_TIMES.forEach((slot, index) => {
    const diff = Math.abs(mins - slot)
    if (diff < bestDiff) {
      bestDiff = diff
      best = index
    }
  })
  return best + 1 // 1-indexed slot number (Slot 1: 8:00 AM, Slot 2: 9:40 AM, etc.)
}

