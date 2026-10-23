// Quick add: one line becomes a task:
//   *label  *"two words"   a label (made if it's new)
//   +project               which project it goes in
//   @name                  who it's assigned to
//   !1 … !5                priority
//   tomorrow, next friday, in 3 days, 23/10 at 15:00 …   the due date
//   every day, every 2 weeks, weekly, monthly, every monday …   repeating
// "Take out the bins every tuesday *chores @sam" is a task "Take out the bins", due next
// Tuesday at noon, repeating weekly, labelled chores, assigned to Sam.

import { addDays, atHour, DEFAULT_HOUR, findDate, nextWeekday, startOfDay } from './dates'
import type { Priority, Repeat } from '@/model'

export interface QuickAdd {
  title: string
  labels: string[]
  project: string | null
  assignees: string[]
  priority: Priority
  dueDate: string | null
  repeat: Repeat | null
}

const DAY_S = 24 * 3600

/** "*word", '*"two words"' or "*'two words'" after a space or at the start. */
function tokens(text: string, prefix: string): { values: string[]; rest: string } {
  const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|\\s)${p}(?:"([^"]+)"|'([^']+)'|([^\\s"']+))`, 'g')
  const values: string[] = []
  const rest = text.replace(re, (_all, space: string, dq?: string, sq?: string, word?: string) => {
    values.push((dq ?? sq ?? word ?? '').trim())
    return space
  })
  return { values: values.filter(Boolean), rest }
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

interface FoundRepeat {
  repeat: Repeat
  /** The first one, for "every monday". */
  first: Date | null
  start: number
  end: number
}

function findRepeat(text: string, now: Date): FoundRepeat | null {
  const lower = text.toLowerCase()
  const simple: Record<string, Repeat> = {
    daily: { every: DAY_S, mode: 'due' },
    weekly: { every: 7 * DAY_S, mode: 'due' },
    fortnightly: { every: 14 * DAY_S, mode: 'due' },
    monthly: { every: 0, mode: 'month' },
    yearly: { every: 365 * DAY_S, mode: 'due' },
    annually: { every: 365 * DAY_S, mode: 'due' },
  }
  const word = /\b(daily|weekly|fortnightly|monthly|yearly|annually)\b/.exec(lower)
  const every = /\bevery (?:(\d+|other) )?(hour|day|week|month|year)s?\b/.exec(lower)
  const weekday = /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(lower)
  const found = [word, every, weekday].filter((m): m is RegExpExecArray => m !== null).sort((a, b) => a.index - b.index)[0]
  if (!found) return null
  const span = { start: found.index, end: found.index + found[0].length }
  if (found === word) return { repeat: simple[found[1]], first: null, ...span }
  if (found === weekday) {
    return { repeat: { every: 7 * DAY_S, mode: 'due' }, first: nextWeekday(now, WEEKDAYS.indexOf(found[1])), ...span }
  }
  const n = found[1] === 'other' ? 2 : found[1] ? Math.max(1, parseInt(found[1], 10)) : 1
  const unit = found[2]
  // (the server's monthly is one month exactly; more are counted as 30 days, as its web app does)
  if (unit === 'month') return { repeat: n === 1 ? { every: 0, mode: 'month' } : { every: n * 30 * DAY_S, mode: 'due' }, first: null, ...span }
  if (unit === 'year') return { repeat: { every: n * 365 * DAY_S, mode: 'due' }, first: null, ...span }
  const seconds = { hour: 3600, day: DAY_S, week: 7 * DAY_S }[unit as 'hour' | 'day' | 'week']
  return { repeat: { every: n * seconds, mode: 'due' }, first: null, ...span }
}

function cut(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' ' + text.slice(end)
}

export function parseQuickAdd(input: string, now = new Date(), weekStart = 1): QuickAdd {
  let text = ` ${input} `

  const labels = tokens(text, '*')
  text = labels.rest
  const project = tokens(text, '+')
  text = project.rest
  const people = tokens(text, '@')
  text = people.rest

  let priority: Priority = 0
  text = text.replace(/(^|\s)!([1-5])(?=\s|$)/, (_all, space: string, n: string) => {
    priority = parseInt(n, 10) as Priority
    return space
  })

  const repeat = findRepeat(text, now)
  if (repeat) text = cut(text, repeat.start, repeat.end)

  let due: Date | null = null
  const date = findDate(text, now, weekStart)
  if (date) {
    // "every tuesday at 7pm": the time goes with the weekday
    due = date.timeOnly && repeat?.first ? atHour(repeat.first, date.date.getHours(), date.date.getMinutes()) : date.date
    text = cut(text, date.start, date.end)
  } else if (repeat?.first) {
    due = atHour(repeat.first, DEFAULT_HOUR)
  } else if (repeat) {
    // repeating from today on (tomorrow, once today's time has gone)
    due = atHour(startOfDay(now), DEFAULT_HOUR)
    if (due <= now) due = addDays(due, 1)
  }

  const title = text.replace(/\s+/g, ' ').trim()
  return {
    title: title || input.trim(),
    labels: [...new Set(labels.values)],
    project: project.values[0] ?? null,
    assignees: [...new Set(people.values)],
    priority,
    dueDate: due ? due.toISOString() : null,
    repeat: repeat?.repeat ?? null,
  }
}

/** The parts quick add understood, to show under the box while typing. */
export function describeQuickAdd(q: QuickAdd): string[] {
  const parts: string[] = []
  if (q.project) parts.push(`in ${q.project}`)
  for (const l of q.labels) parts.push(`label ${l}`)
  for (const a of q.assignees) parts.push(`for ${a}`)
  if (q.priority) parts.push(`priority ${q.priority}`)
  return parts
}
