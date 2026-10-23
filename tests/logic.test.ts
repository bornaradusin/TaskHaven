// The logic: dates, quick add, repeating, the kanban, filters, sharing. Run in Europe/London
// (package.json), so the clocks going back on 25 October 2026 are crossed.

import { describe, expect, it } from 'vitest'
import { dueText, findDate, relativeDay, formatDay, addMonths } from '@/logic/dates'
import { parseQuickAdd } from '@/logic/quickadd'
import { describeRepeat, nextDates, joinInterval, splitInterval } from '@/logic/repeat'
import { bucketOf, currentTasks, reminderTimes, sortTasks, suggestIdentifier, taskIdentifier, upcomingTasks, describeReminder } from '@/logic/tasks'
import { checkFilter, compileFilter, filterDate, filterFromServer, filterToServer } from '@/logic/filter'
import { isPrivateHost, normalizeServer, taskIn } from '@/data/vikunja'
import { newTask, type Project, type Task } from '@/model'

// Friday 23 October 2026, 10:00 in London
const NOW = new Date(2026, 9, 23, 10, 0)
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min)

function found(text: string, now = NOW) {
  const f = findDate(text, now)
  return f ? { date: f.date, cut: text.slice(f.start, f.end) } : null
}

describe('dates', () => {
  it('reads days', () => {
    expect(found('call mum today')?.date).toEqual(at(2026, 10, 23))
    expect(found('call mum tomorrow')?.date).toEqual(at(2026, 10, 24))
    expect(found('in 3 days')?.date).toEqual(at(2026, 10, 26))
    expect(found('in a week')?.date).toEqual(at(2026, 10, 30))
    expect(found('in 2 months')?.date).toEqual(at(2026, 12, 23))
    expect(found('next week')?.date).toEqual(at(2026, 10, 30))
    expect(found('end of month')?.date).toEqual(at(2026, 10, 31))
    expect(found('this weekend')?.date).toEqual(at(2026, 10, 24))
  })

  it('reads weekdays: the next one, a week on if it is today', () => {
    expect(found('monday')?.date).toEqual(at(2026, 10, 26))
    expect(found('next friday')?.date).toEqual(at(2026, 10, 30))
    expect(found('friday')?.date).toEqual(at(2026, 10, 30))
    expect(found('this friday')?.date).toEqual(at(2026, 10, 23))
    expect(found('on sat')?.date).toEqual(at(2026, 10, 24))
    // a short name alone isn't a date
    expect(found('the cat sat on the mat')).toBeNull()
  })

  it('reads dates, this year or the next', () => {
    expect(found('17/11')?.date).toEqual(at(2026, 11, 17))
    expect(found('17/1')?.date).toEqual(at(2027, 1, 17))
    expect(found('1/2/2027')?.date).toEqual(at(2027, 2, 1))
    expect(found('2026-12-24')?.date).toEqual(at(2026, 12, 24))
    expect(found('24 dec')?.date).toEqual(at(2026, 12, 24))
    expect(found('december 24th')?.date).toEqual(at(2026, 12, 24))
    expect(found('3rd of march')?.date).toEqual(at(2027, 3, 3))
    expect(found('24.12.')?.date).toEqual(at(2026, 12, 24))
    expect(found('buy 3.5 kg of flour')).toBeNull()
    expect(found('31/2')).toBeNull()
  })

  it('reads times after a date, and alone', () => {
    expect(found('tomorrow at 5pm')).toEqual({ date: at(2026, 10, 24, 17), cut: 'tomorrow at 5pm' })
    expect(found('monday 17:30')).toEqual({ date: at(2026, 10, 26, 17, 30), cut: 'monday 17:30' })
    expect(found('tomorrow at noon')?.date).toEqual(at(2026, 10, 24, 12))
    expect(found('tomorrow 5 apples')).toEqual({ date: at(2026, 10, 24), cut: 'tomorrow' })
    expect(found('at 15:00')?.date).toEqual(at(2026, 10, 23, 15))
    expect(found('at 9am')?.date).toEqual(at(2026, 10, 24, 9))
    expect(found('look at 3 options')).toBeNull()
  })

  it('says dates', () => {
    expect(relativeDay(at(2026, 10, 23), NOW)).toBe('today')
    expect(relativeDay(at(2026, 10, 24), NOW)).toBe('tomorrow')
    expect(relativeDay(at(2026, 10, 22), NOW)).toBe('yesterday')
    expect(relativeDay(at(2026, 10, 26), NOW)).toBe('in 3 days')
    expect(relativeDay(at(2026, 10, 20), NOW)).toBe('3 days ago')
    expect(relativeDay(at(2026, 11, 20), NOW)).toBe('on Fri 20 Nov')
    expect(formatDay(at(2027, 1, 4), NOW)).toBe('Mon 4 Jan 2027')
    expect(dueText(at(2026, 10, 24).toISOString(), NOW)).toBe('Tomorrow')
    expect(dueText(at(2026, 10, 24, 19).toISOString(), NOW)).toBe('Tomorrow at 19:00')
    expect(addMonths(at(2026, 1, 31), 1)).toEqual(at(2026, 2, 28))
  })
})

describe('quick add', () => {
  it('takes labels, project, people, priority and date out of the title', () => {
    const q = parseQuickAdd('Take out the bins tomorrow at 7pm *chores @sam +Home !3', NOW)
    expect(q).toEqual({
      title: 'Take out the bins',
      labels: ['chores'],
      project: 'Home',
      assignees: ['sam'],
      priority: 3,
      dueDate: at(2026, 10, 24, 19).toISOString(),
      repeat: null,
    })
  })

  it('takes quoted names with spaces', () => {
    const q = parseQuickAdd('Book tickets *"day out" +"Weekend in the Lakes"', NOW)
    expect(q.title).toBe('Book tickets')
    expect(q.labels).toEqual(['day out'])
    expect(q.project).toBe('Weekend in the Lakes')
  })

  it('leaves e-mail addresses and words with marks in them alone', () => {
    const q = parseQuickAdd('Email bob@example.com about 2+2', NOW)
    expect(q.title).toBe('Email bob@example.com about 2+2')
    expect(q.assignees).toEqual([])
  })

  it('reads repeats', () => {
    const weekly = parseQuickAdd('Bins every tuesday', NOW)
    expect(weekly.title).toBe('Bins')
    expect(weekly.repeat).toEqual({ every: 7 * 86400, mode: 'due' })
    expect(weekly.dueDate).toBe(at(2026, 10, 27).toISOString())

    const bins = parseQuickAdd('Take out the bins every tuesday at 7pm *chores @sam', NOW)
    expect(bins.title).toBe('Take out the bins')
    expect(bins.dueDate).toBe(at(2026, 10, 27, 19).toISOString())
    expect(bins.repeat).toEqual({ every: 7 * 86400, mode: 'due' })

    const daily = parseQuickAdd('Water plants every 2 days', NOW)
    expect(daily.repeat).toEqual({ every: 2 * 86400, mode: 'due' })
    expect(daily.dueDate).toBe(at(2026, 10, 23).toISOString())

    expect(parseQuickAdd('Rent monthly', NOW).repeat).toEqual({ every: 0, mode: 'month' })
    expect(parseQuickAdd('Car tax every year', NOW).repeat).toEqual({ every: 365 * 86400, mode: 'due' })
    expect(parseQuickAdd('Boiler every 3 months', NOW).repeat).toEqual({ every: 90 * 86400, mode: 'due' })
    expect(parseQuickAdd('Meds every other day', NOW).repeat).toEqual({ every: 2 * 86400, mode: 'due' })
  })

  it('keeps the text when it would be empty', () => {
    expect(parseQuickAdd('tomorrow', NOW).title).toBe('tomorrow')
  })
})

function task(extra: Partial<Task> = {}): Task {
  return { ...newTask('p1', 'u1', NOW.toISOString()), id: 't1', index: 4, title: 'Bins', ...extra }
}

function project(extra: Partial<Project> = {}): Project {
  return {
    id: 'p1', title: 'Home', description: '', color: '', identifier: 'HOME', parentId: null, archived: false, favorite: false, ownerId: 'u1',
    right: 'admin', position: 0, views: {},
    buckets: [{ id: 'todo', title: 'To do', limit: 0, position: 1 }, { id: 'doing', title: 'Doing', limit: 2, position: 2 }, { id: 'done', title: 'Done', limit: 0, position: 3 }],
    doneBucketId: 'done', created: '', updated: '', ...extra,
  }
}

describe('repeating', () => {
  it('moves weekly tasks on by the calendar, past now, keeping the time across the clock change', () => {
    // due Tuesday 20 Oct 19:00 (summer time); done Friday 23rd → Tuesday 27th 19:00 (winter time)
    const t = task({ dueDate: at(2026, 10, 20, 19).toISOString(), repeat: { every: 7 * 86400, mode: 'due' }, reminders: [{ at: at(2026, 10, 20, 18).toISOString(), relativeTo: null, offset: 0 }] })
    const next = nextDates(t, NOW)!
    expect(next.dueDate).toBe(at(2026, 10, 27, 19).toISOString())
    expect(next.reminders[0].at).toBe(at(2026, 10, 27, 18).toISOString())
  })

  it('moves on more than once when it is far behind', () => {
    const t = task({ dueDate: at(2026, 10, 1).toISOString(), repeat: { every: 7 * 86400, mode: 'due' } })
    expect(nextDates(t, NOW)!.dueDate).toBe(at(2026, 10, 29).toISOString())
  })

  it('moves on at least once when it is ahead already', () => {
    const t = task({ dueDate: at(2026, 10, 30).toISOString(), repeat: { every: 86400, mode: 'due' } })
    expect(nextDates(t, NOW)!.dueDate).toBe(at(2026, 10, 31).toISOString())
  })

  it('repeats from when it was done, keeping the time of day and the gaps between dates', () => {
    const t = task({ dueDate: at(2026, 10, 10, 9).toISOString(), startDate: at(2026, 10, 9, 9).toISOString(), repeat: { every: 3 * 86400, mode: 'done' } })
    const next = nextDates(t, NOW)!
    expect(next.dueDate).toBe(at(2026, 10, 26, 9).toISOString())
    expect(next.startDate).toBe(at(2026, 10, 25, 9).toISOString())
  })

  it('repeats monthly on the same day', () => {
    const t = task({ dueDate: at(2026, 10, 31).toISOString(), repeat: { every: 0, mode: 'month' } })
    expect(nextDates(t, NOW)!.dueDate).toBe(at(2026, 11, 30).toISOString())
    // a year is 365 days, as on the server
    const y = task({ dueDate: at(2026, 3, 1).toISOString(), repeat: { every: 365 * 86400, mode: 'due' } })
    expect(nextDates(y, NOW)!.dueDate).toBe(at(2027, 3, 1).toISOString())
  })

  it('says repeats', () => {
    expect(describeRepeat({ every: 86400, mode: 'due' })).toBe('Every day')
    expect(describeRepeat({ every: 14 * 86400, mode: 'due' })).toBe('Every 2 weeks')
    expect(describeRepeat({ every: 3 * 86400, mode: 'done' })).toBe('Every 3 days, from when it’s done')
    expect(describeRepeat({ every: 365 * 86400, mode: 'due' })).toBe('Every year')
    expect(describeRepeat({ every: 0, mode: 'month' })).toBe('Every month')
    expect(describeRepeat({ every: 0, mode: 'due' })).toBe('Doesn’t repeat')
    expect(splitInterval(joinInterval(3, 'weeks', false))).toEqual({ amount: 3, unit: 'weeks' })
    expect(splitInterval(joinInterval(2, 'years', false))).toEqual({ amount: 2, unit: 'years' })
  })
})

describe('tasks', () => {
  it('numbers tasks', () => {
    expect(taskIdentifier(task(), project())).toBe('HOME-4')
    expect(taskIdentifier(task(), project({ identifier: '' }))).toBe('#4')
    expect(taskIdentifier(task({ index: 0 }), project())).toBe('')
    expect(suggestIdentifier('Home chores')).toBe('HC')
    expect(suggestIdentifier('Garden')).toBe('GARD')
  })

  it('shows a task in its column on the board', () => {
    const p = project()
    expect(bucketOf(task({ bucketId: null }), p)).toBe('todo')
    expect(bucketOf(task({ bucketId: 'gone' }), p)).toBe('todo')
    expect(bucketOf(task({ done: true, bucketId: 'todo' }), p)).toBe('done')
  })

  it('sorts, with no date last and high priority first', () => {
    const a = task({ id: 'a', dueDate: at(2026, 10, 25).toISOString(), priority: 1, position: 3 })
    const b = task({ id: 'b', dueDate: null, priority: 4, position: 1 })
    const c = task({ id: 'c', dueDate: at(2026, 10, 24).toISOString(), priority: 2, position: 2 })
    expect(sortTasks([a, b, c], 'dueDate').map((t) => t.id)).toEqual(['c', 'a', 'b'])
    expect(sortTasks([a, b, c], 'priority').map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(sortTasks([a, b, c], 'position').map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(currentTasks([a, b, c], false).map((t) => t.id)).toEqual(['c', 'a'])
    expect(currentTasks([a, b, c], true).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('finds upcoming tasks', () => {
    const overdue = task({ id: 'o', dueDate: at(2026, 10, 20).toISOString() })
    const soon = task({ id: 's', dueDate: at(2026, 10, 25).toISOString() })
    const later = task({ id: 'l', dueDate: at(2026, 11, 25).toISOString() })
    const span = task({ id: 'r', startDate: at(2026, 10, 1).toISOString(), endDate: at(2026, 11, 1).toISOString() })
    const done = task({ id: 'd', done: true, dueDate: at(2026, 10, 24).toISOString() })
    const all = [overdue, soon, later, span, done]
    expect(upcomingTasks(all, NOW, at(2026, 10, 30), false, NOW).map((t) => t.id).sort()).toEqual(['r', 's'])
    expect(upcomingTasks(all, NOW, at(2026, 10, 30), true, NOW).map((t) => t.id).sort()).toEqual(['o', 'r', 's'])
  })

  it('works out reminders', () => {
    const t = task({
      dueDate: at(2026, 10, 24, 19).toISOString(),
      reminders: [
        { at: null, relativeTo: 'due', offset: -60 },
        { at: at(2026, 10, 24, 8).toISOString(), relativeTo: null, offset: 0 },
        { at: null, relativeTo: 'start', offset: 0 },
      ],
    })
    expect(reminderTimes(t)).toEqual([at(2026, 10, 24, 18), at(2026, 10, 24, 8)])
    expect(describeReminder({ at: null, relativeTo: 'due', offset: -1440 })).toBe('1 day before the due date')
    expect(describeReminder({ at: null, relativeTo: 'end', offset: 120 })).toBe('2 hours after the end')
  })
})

describe('filters', () => {
  const ctx = {
    now: NOW,
    projects: [project(), project({ id: 'p2', title: 'Garden', identifier: 'GARD' })],
    people: [{ id: 'u1', name: 'Alex Morgan', username: 'alex', email: '' }, { id: 'u2', name: 'Sam Morgan', username: 'sammy', email: '' }],
  }
  const tasks = [
    task({ id: 'a', title: 'Take out the bins', priority: 3, dueDate: at(2026, 10, 24).toISOString(), labels: [{ id: 'l1', title: 'Chores', color: '' }], assignees: ['u2'] }),
    task({ id: 'b', title: 'Pay the bill', priority: 5, done: true, dueDate: at(2026, 10, 1).toISOString() }),
    task({ id: 'c', title: 'Mow the lawn', projectId: 'p2', priority: 1, dueDate: at(2026, 11, 20).toISOString() }),
    task({ id: 'd', title: 'Someday', priority: 0 }),
  ]
  const run = (q: string) => tasks.filter(compileFilter(q, ctx)).map((t) => t.id)

  it('filters', () => {
    expect(run('done = false')).toEqual(['a', 'c', 'd'])
    expect(run('done = false && priority >= 3')).toEqual(['a'])
    expect(run('priority > 2 || project = Garden')).toEqual(['a', 'b', 'c'])
    expect(run('dueDate < now+7d && done = false')).toEqual(['a'])
    expect(run('dueDate > now')).toEqual(['a', 'c'])
    expect(run('labels in chores, garden')).toEqual(['a'])
    expect(run('labels not in chores')).toEqual(['b', 'c', 'd'])
    expect(run('assignees = sam')).toEqual(['a'])
    expect(run('assignees in sammy')).toEqual(['a'])
    // as the server writes them: snake_case, and labels and projects by id
    expect(run('due_date < now+7d && done = false')).toEqual(['a'])
    expect(run('labels in l1')).toEqual(['a'])
    expect(run('project in p2')).toEqual(['c'])
    expect(run('assignees in "Sam Morgan"')).toEqual(['a'])
    expect(run('title like bin')).toEqual(['a'])
    expect(run('title like the')).toEqual(['a', 'b', 'c'])
    expect(run('(project = gard || priority = 5) && done = false')).toEqual(['c'])
    expect(run('dueDate in 2026-10-24')).toEqual(['a'])
    expect(run('')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('says what is wrong', () => {
    expect(checkFilter('done = maybe', ctx)).toBe('done is true or false.')
    expect(checkFilter('colour = red', ctx)).toMatch(/isn’t something to filter by/)
    expect(checkFilter('done = false priority > 1', ctx)).toMatch(/join conditions with && or \|\|/)
    expect(checkFilter('dueDate < soon', ctx)).toMatch(/isn’t a date/)
    expect(checkFilter('priority =', ctx)).toMatch(/at the end/)
    expect(checkFilter('priority > 2 && done = false', ctx)).toBe('')
  })

  it('reads filter dates', () => {
    expect(filterDate('now/d', NOW)).toEqual(at(2026, 10, 23, 0))
    expect(filterDate('now+1w/d', NOW)).toEqual(at(2026, 10, 30, 0))
    expect(filterDate('now-1M', NOW)).toEqual(at(2026, 9, 23, 10))
    expect(filterDate('now/w', NOW)).toEqual(at(2026, 10, 19, 0))
  })
})

describe('filters on the server', () => {
  const names = { labels: [{ id: '7', title: 'Chores' }, { id: '8', title: 'Big jobs' }], projects: [{ id: '3', title: 'Home', identifier: 'HOME' }] }

  it('go to the server with ids and its field names, and come back in words', () => {
    const q = 'done = false && labels in Chores, "Big jobs" && dueDate < now+7d && project = home'
    const out = filterToServer(q, names)
    expect(out).toBe('done = false && labels in 7, 8 && due_date < now+7d && project = 3')
    expect(filterFromServer(out, names)).toBe('done = false && labels in Chores, "Big jobs" && dueDate < now+7d && project = Home')
    // what it doesn't know stays as it was
    expect(filterToServer('(priority >= 3 || labels = Unknown)', names)).toBe('(priority >= 3 || labels = Unknown)')
  })
})

describe('the server’s address', () => {
  it('is https unless it’s at home', () => {
    expect(normalizeServer('192.168.1.20:3456')).toBe('http://192.168.1.20:3456')
    expect(normalizeServer('nas.local:3456/')).toBe('http://nas.local:3456')
    expect(normalizeServer('tasks.example.com')).toBe('https://tasks.example.com')
    expect(normalizeServer('https://tasks.example.com/api/v1/')).toBe('https://tasks.example.com')
    expect(normalizeServer('https://example.com/vikunja')).toBe('https://example.com/vikunja')
    expect(normalizeServer('http://10.0.0.5')).toBe('http://10.0.0.5')
    expect(normalizeServer('http://100.101.102.103:3456')).toBe('http://100.101.102.103:3456')
  })

  it('refuses plain http over the internet, and what isn’t an address', () => {
    expect(() => normalizeServer('http://tasks.example.com')).toThrow(/must use https/)
    expect(() => normalizeServer('ftp://nas.local')).toThrow(/https/)
    expect(() => normalizeServer('')).toThrow(/address/)
    expect(isPrivateHost('172.20.1.1')).toBe(true)
    expect(isPrivateHost('172.32.1.1')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
  })
})

describe('tasks from the server', () => {
  it('reads its dates, repeats, reminders and relations', () => {
    const t = taskIn({
      id: 12, project_id: 3, index: 4, title: 'Bins', done: false, done_at: '0001-01-01T00:00:00Z', due_date: '2026-10-27T19:00:00Z',
      start_date: '0001-01-01T00:00:00Z', end_date: null, priority: 3, percent_done: 0.5, hex_color: 'e8632e',
      labels: [{ id: 7, title: 'Chores', hex_color: '' }], assignees: [{ id: 2, username: 'sam' }],
      reminders: [{ relative_to: 'due_date', relative_period: -3600 }, { reminder: '2026-10-26T09:00:00Z' }],
      repeat_after: 604800, repeat_mode: 0, related_tasks: { blocking: [{ id: 13, project_id: 3, title: 'Tap', done: true }] },
      attachments: [{ id: 5, file: { name: 'a.jpg', mime: 'image/jpeg; x=y', size: 10 }, created_by: { id: 1 }, created: '2026-10-20T10:00:00Z' }],
      created_by: { id: 1 }, created: '2026-10-01T10:00:00Z', updated: '2026-10-02T10:00:00Z',
    })
    expect(t).toMatchObject({
      id: '12', projectId: '3', index: 4, doneAt: null, dueDate: '2026-10-27T19:00:00.000Z', startDate: null, endDate: null,
      percentDone: 50, color: '#e8632e', assignees: ['2'], repeat: { every: 604800, mode: 'due' },
      reminders: [{ at: null, relativeTo: 'due', offset: -60 }, { at: '2026-10-26T09:00:00.000Z', relativeTo: null, offset: 0 }],
      relations: [{ kind: 'blocking', taskId: '13', title: 'Tap', done: true }],
      attachments: [{ id: '5', name: 'a.jpg', type: 'image/jpeg', size: 10 }],
    })
    expect(t.labels).toEqual([{ id: '7', title: 'Chores', color: '#9e9e9e' }])
    expect(taskIn({ id: 1, project_id: 1, repeat_mode: 1, repeat_after: 0 }).repeat).toEqual({ every: 0, mode: 'month' })
    expect(taskIn({ id: 1, project_id: 1, repeat_mode: 2, repeat_after: 86400 }).repeat).toEqual({ every: 86400, mode: 'done' })
  })
})
