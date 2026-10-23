// What's done with tasks: their numbers, the kanban columns, sorting and grouping. (Marking
// them done, and repeating ones coming back, is the server's work.)

import { daysBetween, endOfDay, startOfDay } from './dates'
import type { Bucket, Project, Reminder, Task } from '@/model'

/** "HOME-12", or "#12" for a project without an identifier (and "" before it has a number). */
export function taskIdentifier(task: Pick<Task, 'index'>, project?: Pick<Project, 'identifier'> | null): string {
  if (!task.index) return ''
  return project?.identifier ? `${project.identifier}-${task.index}` : `#${task.index}`
}

/** A project's identifier from its title: "Home chores" → "HC", "Garden" → "GARD". */
export function suggestIdentifier(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase()
  return (words[0] ?? '').slice(0, 4).toUpperCase()
}

export function isOverdue(task: Pick<Task, 'done' | 'dueDate'>, now = new Date()): boolean {
  return !task.done && !!task.dueDate && new Date(task.dueDate) < now
}

/** Due before tomorrow and not done (for the overview's warnings). */
export function isDueSoon(task: Pick<Task, 'done' | 'dueDate'>, now = new Date()): boolean {
  return !task.done && !!task.dueDate && daysBetween(now, new Date(task.dueDate)) <= 1
}

/** The bucket a task shows in: its own, or the first one (the done one once it's done). */
export function bucketOf(task: Task, project: Project): string | null {
  if (task.done && project.doneBucketId) return project.doneBucketId
  if (task.bucketId && project.buckets.some((b) => b.id === task.bucketId)) return task.bucketId
  return project.buckets.find((b) => b.id !== project.doneBucketId)?.id ?? project.buckets[0]?.id ?? null
}

/** Whether a bucket is full (its limit reached), not counting a task that's already in it. */
export function bucketFull(bucket: Bucket, tasksIn: number): boolean {
  return bucket.limit > 0 && tasksIn >= bucket.limit
}

/** A position between two others (for dragging into place). */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return Date.now()
  if (before === undefined) return (after as number) - 1024
  if (after === undefined) return before + 1024
  return (before + after) / 2
}

// ---- sorting ----

export type SortKey = 'position' | 'dueDate' | 'priority' | 'title' | 'created' | 'updated' | 'index' | 'percentDone' | 'startDate' | 'endDate' | 'doneAt'

function compareValues(a: unknown, b: unknown): number {
  // nothing (no date) goes last
  const an = a === null || a === undefined || a === ''
  const bn = b === null || b === undefined || b === ''
  if (an || bn) return an === bn ? 0 : an ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function sortTasks(tasks: Task[], key: SortKey = 'position', descending = false): Task[] {
  const dir = descending ? -1 : 1
  return [...tasks].sort((a, b) => {
    let c = compareValues(a[key], b[key])
    // a higher priority is more important: put it first unless asked otherwise
    if (key === 'priority') c = -c
    if (c === 0) c = compareValues(a.position, b.position)
    if (c === 0) c = a.id.localeCompare(b.id)
    return c * dir
  })
}

/** The list view's order: not done first, then by position. */
export function listOrder(tasks: Task[]): Task[] {
  return sortTasks(tasks, 'position').sort((a, b) => Number(a.done) - Number(b.done))
}

/** The overview's current tasks: what's not done, the soonest due first, then by priority. */
export function currentTasks(tasks: Task[], showUndated: boolean, limit = 50): Task[] {
  return tasks
    .filter((t) => !t.done && (showUndated || t.dueDate))
    .sort((a, b) => compareValues(a.dueDate, b.dueDate) || b.priority - a.priority || compareValues(a.position, b.position))
    .slice(0, limit)
}

/** Upcoming: not done and due between two days (inclusive), and overdue ones first if wanted. */
export function upcomingTasks(tasks: Task[], from: Date, to: Date, showOverdue: boolean, now = new Date()): Task[] {
  const start = startOfDay(from).getTime()
  const end = endOfDay(to).getTime()
  return tasks
    .filter((t) => {
      if (t.done) return false
      const dates = [t.dueDate, t.startDate, t.endDate].filter((d): d is string => !!d).map((d) => Date.parse(d))
      if (!dates.length) return false
      if (showOverdue && t.dueDate && Date.parse(t.dueDate) < now.getTime()) return true
      return dates.some((d) => d >= start && d <= end) || (t.startDate && t.endDate ? Date.parse(t.startDate) <= end && Date.parse(t.endDate) >= start : false)
    })
    .sort((a, b) => compareValues(a.dueDate ?? a.startDate, b.dueDate ?? b.startDate))
}

/** When a task's reminders go off. */
export function reminderTimes(task: Pick<Task, 'dueDate' | 'startDate' | 'endDate' | 'reminders'>): Date[] {
  return task.reminders.flatMap((r) => {
    const t = reminderTime(r, task)
    return t ? [t] : []
  })
}

export function reminderTime(r: Reminder, task: Pick<Task, 'dueDate' | 'startDate' | 'endDate'>): Date | null {
  if (r.at) return new Date(r.at)
  const base = r.relativeTo === 'due' ? task.dueDate : r.relativeTo === 'start' ? task.startDate : r.relativeTo === 'end' ? task.endDate : null
  return base ? new Date(Date.parse(base) + r.offset * 60_000) : null
}

/** "1 day before the due date", "at the start", "2 hours after the end". */
export function describeReminder(r: Reminder): string {
  if (r.at || !r.relativeTo) return ''
  const what = { due: 'the due date', start: 'the start', end: 'the end' }[r.relativeTo]
  if (r.offset === 0) return `At ${what}`
  const m = Math.abs(r.offset)
  const amount = m % 1440 === 0 ? plural(m / 1440, 'day') : m % 60 === 0 ? plural(m / 60, 'hour') : plural(m, 'minute')
  return `${amount} ${r.offset < 0 ? 'before' : 'after'} ${what}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
