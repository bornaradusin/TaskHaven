// Repeating tasks: once one is done it comes back, its dates moved on.

import { addDays, addMonths, atHour } from './dates'
import { repeats, type Reminder, type Repeat, type Task } from '@/model'

type Dated = Pick<Task, 'dueDate' | 'startDate' | 'endDate' | 'reminders' | 'repeat'>

const HOUR = 3600
const DAY = 24 * HOUR
const YEAR = 365 * DAY
const MONTH = 30 * DAY

function move(iso: string | null, by: (d: Date) => Date): string | null {
  return iso ? by(new Date(iso)).toISOString() : null
}

function moveReminders(reminders: Reminder[], by: (d: Date) => Date): Reminder[] {
  return reminders.map((r) => (r.at ? { ...r, at: by(new Date(r.at)).toISOString() } : r))
}

/** The date the others go by: the due date, else the start, else the end. */
function anchor(task: Dated): Date | null {
  const iso = task.dueDate ?? task.startDate ?? task.endDate
  return iso ? new Date(iso) : null
}

/**
 * A repeating task's dates for its next time, once it's done at `now`; null if it doesn't repeat.
 * (It stays not done: the caller keeps done false.)
 */
export function nextDates(task: Dated, now: Date): Pick<Task, 'dueDate' | 'startDate' | 'endDate' | 'reminders'> | null {
  const { every, mode } = task.repeat
  if (!repeats(task.repeat)) return null
  const base = anchor(task)
  const shift = (by: (d: Date) => Date) => ({
    dueDate: move(task.dueDate, by),
    startDate: move(task.startDate, by),
    endDate: move(task.endDate, by),
    reminders: moveReminders(task.reminders, by),
  })
  if (!base) return shift((d) => d)

  if (mode === 'month') {
    // the same day next month, until it's ahead of now (at least once)
    let months = 1
    while (addMonths(base, months) <= now) months += 1
    return shift((d) => addMonths(d, months))
  }
  if (mode === 'done') {
    // from now: the anchor date becomes now + the interval, the others keep their distance
    // (whole days keep the time of day it had: due 9:00, done at 15:00 → 9:00, that many days on)
    const target =
      every % DAY === 0 ? atHour(addDays(now, every / DAY), base.getHours(), base.getMinutes()) : new Date(now.getTime() + every * 1000)
    const delta = target.getTime() - base.getTime()
    return shift((d) => new Date(d.getTime() + delta))
  }
  // 'due': by the interval, until it's ahead of now (at least once). Whole days go by the
  // calendar, so "every week at 19:00" stays at 19:00 when the clocks change.
  if (every % DAY === 0) {
    const days = every / DAY
    let n = days
    while (addDays(base, n) <= now) n += days
    return shift((d) => addDays(d, n))
  }
  const step = every * 1000
  let delta = step
  if (base.getTime() + delta <= now.getTime()) delta += Math.ceil((now.getTime() - base.getTime() - delta + 1) / step) * step
  return shift((d) => new Date(d.getTime() + delta))
}

/** "Every day", "Every 2 weeks", "Every month" … */
export function describeRepeat(repeat: Repeat): string {
  const { every, mode } = repeat
  if (!repeats(repeat)) return 'Doesn’t repeat'
  if (mode === 'month') return 'Every month'
  const units: [number, string][] = [
    [YEAR, 'year'],
    [7 * DAY, 'week'],
    [DAY, 'day'],
    [HOUR, 'hour'],
  ]
  let text = `Every ${every} seconds`
  for (const [size, name] of units) {
    if (every % size === 0) {
      const n = every / size
      text = n === 1 ? `Every ${name}` : `Every ${n} ${name}s`
      break
    }
  }
  return mode === 'done' ? `${text}, from when it’s done` : text
}

/** The choices in the task's Repeat menu. */
export const REPEAT_CHOICES: { label: string; repeat: Repeat }[] = [
  { label: 'Every day', repeat: { every: DAY, mode: 'due' } },
  { label: 'Every week', repeat: { every: 7 * DAY, mode: 'due' } },
  { label: 'Every 2 weeks', repeat: { every: 14 * DAY, mode: 'due' } },
  { label: 'Every month', repeat: { every: 0, mode: 'month' } },
  { label: 'Every year', repeat: { every: YEAR, mode: 'due' } },
]

/** An interval as an amount and a unit, for the custom repeat form. */
export function splitInterval(repeat: Repeat): { amount: number; unit: 'hours' | 'days' | 'weeks' | 'months' | 'years' } {
  const { every, mode } = repeat
  if (mode === 'month') return { amount: 1, unit: 'months' }
  if (every > 0 && every % YEAR === 0) return { amount: every / YEAR, unit: 'years' }
  if (every > 0 && every % (7 * DAY) === 0) return { amount: every / (7 * DAY), unit: 'weeks' }
  if (every > MONTH && every % MONTH === 0) return { amount: every / MONTH, unit: 'months' }
  if (every > 0 && every % (7 * DAY) === 0) return { amount: every / (7 * DAY), unit: 'weeks' }
  if (every > 0 && every % DAY === 0) return { amount: every / DAY, unit: 'days' }
  if (every > 0 && every % HOUR === 0) return { amount: every / HOUR, unit: 'hours' }
  return { amount: 1, unit: 'days' }
}

export function joinInterval(amount: number, unit: 'hours' | 'days' | 'weeks' | 'months' | 'years', fromDone: boolean): Repeat {
  const n = Math.max(1, Math.round(amount))
  // the server's "monthly" is one month exactly; more months are counted as 30 days each
  if (unit === 'months' && n === 1 && !fromDone) return { every: 0, mode: 'month' }
  const size = { hours: HOUR, days: DAY, weeks: 7 * DAY, months: MONTH, years: YEAR }[unit]
  return { every: n * size, mode: fromDone ? 'done' : 'due' }
}
