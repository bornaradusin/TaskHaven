// Dates as people say and read them: "tomorrow", "next monday", "in 3 days", "17/10 at 15:00";
// and back again ("today", "in 2 days", "Mon 2 Nov").

export const DAY = 24 * 3600 * 1000

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEKDAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** When a date has no time, it's due at this hour. */
export const DEFAULT_HOUR = 12

export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** The same day n months on (the 31st becomes the month's last day). */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d)
  const day = r.getDate()
  r.setDate(1)
  r.setMonth(r.getMonth() + months)
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()
  r.setDate(Math.min(day, last))
  return r
}

export function atHour(d: Date, hour: number, minute = 0): Date {
  const r = new Date(d)
  r.setHours(hour, minute, 0, 0)
  return r
}

/** Whole days from a's day to b's day (local time). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)
}

/** The first day of d's week. */
export function startOfWeek(d: Date, weekStart: number): Date {
  const r = startOfDay(d)
  return addDays(r, -((r.getDay() - weekStart + 7) % 7))
}

/** The next such weekday after today (today's weekday gives a week on). */
export function nextWeekday(now: Date, weekday: number): Date {
  const ahead = (weekday - now.getDay() + 7) % 7 || 7
  return addDays(startOfDay(now), ahead)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "15:00". */
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Mon 2 Nov" (with the year if it isn't this year's). */
export function formatDay(d: Date, now = new Date()): string {
  const name = WEEKDAY_SHORT[d.getDay()]
  const text = `${name[0].toUpperCase()}${name.slice(1)} ${d.getDate()} ${capital(MONTH_SHORT[d.getMonth()])}`
  return d.getFullYear() === now.getFullYear() ? text : `${text} ${d.getFullYear()}`
}

/** "Mon 2 Nov, 15:00". */
export function formatDateTime(d: Date, now = new Date()): string {
  return `${formatDay(d, now)}, ${formatTime(d)}`
}

function capital(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

/** "today", "tomorrow", "yesterday", "in 3 days", "2 days ago", "on Mon 2 Nov". */
export function relativeDay(d: Date, now = new Date()): string {
  const days = daysBetween(now, d)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days < 7) return `in ${days} days`
  if (days < -1 && days > -7) return `${-days} days ago`
  if (days >= 7 && days < 14) return 'in a week'
  if (days <= -7 && days > -14) return 'a week ago'
  return `on ${formatDay(d, now)}`
}

/** "Due today", "Due 2 days ago" …, with the time when it isn't the default one. */
export function dueText(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const day = relativeDay(d, now)
  const time = d.getHours() === DEFAULT_HOUR && d.getMinutes() === 0 ? '' : ` at ${formatTime(d)}`
  return `${capital(day)}${time}`
}

/** For <input type="datetime-local">: "2026-10-23T15:00". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** "2026-10-23" in local time, for grouping by day. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---- reading dates in text ----

export interface FoundDate {
  date: Date
  /** Only a time was said ("at 15:00"): the day is today's (or tomorrow's). */
  timeOnly?: boolean
  /** Where in the text it was, to take it out. */
  start: number
  end: number
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

function count(word: string): number {
  return NUMBER_WORDS[word] ?? parseInt(word, 10)
}

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
/** A time right after a date: " at 5pm", " 17:00", " at noon". */
const TIME_AFTER = /\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\s+at\s+(noon|midnight)\b/y

function monthIndex(word: string): number {
  return MONTH_SHORT.indexOf(word.slice(0, 3))
}

function weekdayIndex(word: string): number {
  return WEEKDAY_SHORT.indexOf(word.slice(0, 3))
}

/** A time from TIME_AFTER's groups ('bad' if it isn't one: "tomorrow 5" but not "tomorrow 5pm"). */
function readTime(hour?: string, minute?: string, half?: string, word?: string): [number, number] | 'bad' {
  if (word === 'noon') return [12, 0]
  if (word === 'midnight') return [0, 0]
  if (hour === undefined) return 'bad'
  let h = parseInt(hour, 10)
  const m = minute ? parseInt(minute, 10) : 0
  if (half) {
    if (h < 1 || h > 12) return 'bad'
    h = (h % 12) + (half === 'pm' ? 12 : 0)
  } else if (!minute) {
    return 'bad' // "tomorrow 5" isn't a time; "tomorrow 5pm" and "tomorrow 17:00" are
  }
  if (h > 23 || m > 59) return 'bad'
  return [h, m]
}

interface Pattern {
  re: RegExp
  /** The day it means (no time). */
  day: (m: RegExpExecArray, now: Date, weekStart: number) => Date | null
}

const PATTERNS: Pattern[] = [
  { re: /\b(today|tonight)\b/, day: (_m, now) => startOfDay(now) },
  { re: /\b(tomorrow|tmrw?)\b/, day: (_m, now) => addDays(startOfDay(now), 1) },
  { re: /\bnext week\b/, day: (_m, now) => addDays(startOfDay(now), 7) },
  { re: /\bnext month\b/, day: (_m, now) => addMonths(startOfDay(now), 1) },
  { re: /\bnext year\b/, day: (_m, now) => new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()) },
  { re: /\bend of (?:the )?month\b/, day: (_m, now) => new Date(now.getFullYear(), now.getMonth() + 1, 0) },
  { re: /\bend of (?:the )?week\b/, day: (_m, now, ws) => addDays(startOfWeek(now, ws), 6) },
  { re: /\b(?:this )?weekend\b/, day: (_m, now) => (now.getDay() === 6 || now.getDay() === 0 ? startOfDay(now) : nextWeekday(now, 6)) },
  { re: /\blater this week\b/, day: (_m, now) => addDays(startOfDay(now), Math.max(1, Math.min(2, 5 - now.getDay()))) },
  { re: /\blater next week\b/, day: (_m, now, ws) => addDays(startOfWeek(addDays(now, 7), ws), 3) },
  {
    re: /\bin (\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten) (day|week|month|year)s?\b/,
    day: (m, now) => {
      const n = count(m[1])
      const base = startOfDay(now)
      if (m[2] === 'day') return addDays(base, n)
      if (m[2] === 'week') return addDays(base, 7 * n)
      if (m[2] === 'month') return addMonths(base, n)
      return addMonths(base, 12 * n)
    },
  },
  // monday, next friday, on sat (the short names only after next/this/on: "the cat sat")
  {
    re: /\b(?:(next|this|on) )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(next|this|on) (mon|tues?|wed|thu|thurs?|fri|sat|sun)\b/,
    day: (m, now) => {
      const wd = weekdayIndex(m[2] ?? m[4])
      if ((m[1] ?? m[3]) === 'this' && now.getDay() === wd) return startOfDay(now)
      return nextWeekday(now, wd)
    },
  },
  // 2026-10-23
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    day: (m) => valid(new Date(+m[1], +m[2] - 1, +m[3]), +m[3]),
  },
  // 23/10, 23/10/2026, 23.10. (with the dot after: "3.5 kg" isn't a date)
  {
    re: /\b(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?\b|\.(\d{1,2})\.(?:(\d{4})\b)?)/,
    day: (m, now) => {
      const y = m[3] ?? m[5]
      const year = y ? (y.length === 2 ? 2000 + +y : +y) : null
      return thisOrNext(+m[1], +(m[2] ?? m[4]) - 1, year, now)
    },
  },
  // 23 oct, 23rd of october
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH_RE}(?: (\\d{4}))?\\b`),
    day: (m, now) => thisOrNext(+m[1], monthIndex(m[2]), m[3] ? +m[3] : null, now),
  },
  // oct 23, october 23rd
  {
    re: new RegExp(`\\b${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`),
    day: (m, now) => thisOrNext(+m[2], monthIndex(m[1]), m[3] ? +m[3] : null, now),
  },
]

function valid(d: Date, day: number): Date | null {
  return d.getDate() === day ? d : null
}

/** That day and month, this year, or next year once it has passed. */
function thisOrNext(day: number, month: number, year: number | null, now: Date): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  let d = new Date(year ?? now.getFullYear(), month, day)
  if (d.getDate() !== day) return null
  if (year === null && d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, day)
  return d
}

/**
 * The first date said in some text, with a time if one follows it ("tomorrow at 5pm");
 * a time alone ("at 15:00") means today, or tomorrow once it's past.
 */
export function findDate(text: string, now = new Date(), weekStart = 1): FoundDate | null {
  const lower = text.toLowerCase()
  let best: FoundDate | null = null
  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, 'g')
    for (let m = re.exec(lower); m; m = re.exec(lower)) {
      if (best && m.index >= best.start) break
      const day = pattern.day(m, now, weekStart)
      if (!day) continue
      let end = m.index + m[0].length
      let date = atHour(day, DEFAULT_HOUR)
      TIME_AFTER.lastIndex = end
      const t = TIME_AFTER.exec(lower)
      if (t) {
        const time = readTime(t[1], t[2], t[3], t[4])
        if (time !== 'bad') {
          date = atHour(day, time[0], time[1])
          end = TIME_AFTER.lastIndex
        }
      }
      best = { date, start: m.index, end }
      break
    }
  }
  if (best) return best
  const alone = /\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\bat (noon|midnight)\b/.exec(lower)
  if (alone) {
    const time = readTime(alone[1], alone[2], alone[3], alone[4])
    if (time !== 'bad') {
      let date = atHour(now, time[0], time[1])
      if (date <= now) date = addDays(date, 1)
      return { date, start: alone.index, end: alone.index + alone[0].length, timeOnly: true }
    }
  }
  return null
}
