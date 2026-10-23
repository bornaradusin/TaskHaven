// Filters, written like this:
//   done = false && priority >= 3
//   dueDate < now+7d && labels in chores, garden
//   (assignees in sam || project = Home) && title like bins
// Fields: done, priority, percentDone, dueDate, startDate, endDate, doneAt, created, updated,
// assignees, labels, project, title, description. Operators: = != > >= < <= like in, not in.
// Dates: 2026-10-23, now, now+3d, now-1w, now/d (units s m h d w M y; /d rounds to the day).

import type { Profile, Project, Task } from '@/model'

export interface FilterContext {
  projects: Project[]
  people: Profile[]
  now: Date
}

type Op = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'in' | 'not in'

interface Comparison {
  kind: 'cmp'
  field: string
  op: Op
  values: string[]
}

interface Join {
  kind: 'and' | 'or'
  left: FilterNode
  right: FilterNode
}

type FilterNode = Comparison | Join

const FIELDS = ['done', 'priority', 'percentDone', 'dueDate', 'startDate', 'endDate', 'doneAt', 'created', 'updated', 'assignees', 'labels', 'project', 'title', 'description'] as const
const DATE_FIELDS = new Set(['dueDate', 'startDate', 'endDate', 'doneAt', 'created', 'updated'])
const LIST_FIELDS = new Set(['assignees', 'labels', 'project'])

export class FilterError extends Error {}

// ---- reading ----

interface Token {
  kind: 'word' | 'op' | 'and' | 'or' | 'open' | 'close' | 'comma'
  text: string
  at: number
}

function lex(input: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const two = input.slice(i, i + 2)
    if (two === '&&' || two === '||') {
      out.push({ kind: two === '&&' ? 'and' : 'or', text: two, at: i })
      i += 2
    } else if (two === '!=' || two === '>=' || two === '<=') {
      out.push({ kind: 'op', text: two, at: i })
      i += 2
    } else if (c === '=' || c === '>' || c === '<') {
      out.push({ kind: 'op', text: c, at: i })
      i++
    } else if (c === '(' || c === ')') {
      out.push({ kind: c === '(' ? 'open' : 'close', text: c, at: i })
      i++
    } else if (c === ',') {
      out.push({ kind: 'comma', text: c, at: i })
      i++
    } else if (c === '"' || c === "'") {
      const end = input.indexOf(c, i + 1)
      if (end < 0) throw new FilterError(`A quote at ${i + 1} isn't closed.`)
      out.push({ kind: 'word', text: input.slice(i + 1, end), at: i })
      i = end + 1
    } else {
      let j = i
      while (j < input.length && !/[\s(),=<>!&|"']/.test(input[j])) j++
      // keep "now+3d" and "now/d" together; a bare "!" or "&" is an error
      if (j === i) throw new FilterError(`“${c}” at ${i + 1} doesn’t belong there.`)
      out.push({ kind: 'word', text: input.slice(i, j), at: i })
      i = j
    }
  }
  // "like", "in" and "not in" are words that are operators
  const merged: Token[] = []
  for (let k = 0; k < out.length; k++) {
    const t = out[k]
    const lower = t.text.toLowerCase()
    if (t.kind === 'word' && lower === 'not' && out[k + 1]?.text.toLowerCase() === 'in') {
      merged.push({ kind: 'op', text: 'not in', at: t.at })
      k++
    } else if (t.kind === 'word' && (lower === 'like' || lower === 'in') && merged.length && merged[merged.length - 1].kind === 'word') {
      merged.push({ kind: 'op', text: lower, at: t.at })
    } else {
      merged.push(t)
    }
  }
  return merged
}

export function parseFilter(input: string): FilterNode | null {
  const tokens = lex(input)
  if (!tokens.length) return null
  let pos = 0
  const peek = () => tokens[pos]
  const take = (kind: Token['kind']): Token => {
    const t = tokens[pos]
    if (!t || t.kind !== kind) {
      const what = { word: 'a field or value', op: 'an operator (=, >, like, in …)', and: '&&', or: '||', open: '(', close: ')', comma: ',' }[kind]
      throw new FilterError(t ? `Expected ${what} at ${t.at + 1}, found “${t.text}”.` : `Expected ${what} at the end.`)
    }
    pos++
    return t
  }

  const or = (): FilterNode => {
    let left = and()
    while (peek()?.kind === 'or') {
      pos++
      left = { kind: 'or', left, right: and() }
    }
    return left
  }
  const and = (): FilterNode => {
    let left = unary()
    while (peek()?.kind === 'and') {
      pos++
      left = { kind: 'and', left, right: unary() }
    }
    return left
  }
  const unary = (): FilterNode => {
    if (peek()?.kind === 'open') {
      pos++
      const inner = or()
      take('close')
      return inner
    }
    const fieldToken = take('word')
    const field = FIELDS.find((f) => f.toLowerCase() === fieldToken.text.toLowerCase().replace(/_/g, ''))
    if (!field) throw new FilterError(`“${fieldToken.text}” isn’t something to filter by. Try: ${FIELDS.join(', ')}.`)
    const op = take('op').text as Op
    const values = [take('word').text]
    while (peek()?.kind === 'comma') {
      pos++
      values.push(take('word').text)
    }
    if (values.length > 1 && op !== 'in' && op !== 'not in') throw new FilterError(`Use “in” for a list (${field} in a, b).`)
    if ((op === 'like') && !['title', 'description', 'labels', 'project', 'assignees'].includes(field)) throw new FilterError(`“like” is for words (title like bins).`)
    return { kind: 'cmp', field, op, values }
  }

  const node = or()
  if (pos < tokens.length) throw new FilterError(`Unexpected “${tokens[pos].text}” at ${tokens[pos].at + 1}: join conditions with && or ||.`)
  return node
}

// ---- dates ----

/** "now", "now+3d", "now-1w/d", "2026-10-23", "2026-10-23 15:00". */
export function filterDate(text: string, now: Date): Date | null {
  const m = /^now(?:([+-])(\d+)([smhdwMy]))?(?:\/([dwMy]))?$/.exec(text)
  if (m) {
    const d = new Date(now)
    if (m[1]) {
      const n = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1)
      const unit = m[3]
      if (unit === 's') d.setSeconds(d.getSeconds() + n)
      if (unit === 'm') d.setMinutes(d.getMinutes() + n)
      if (unit === 'h') d.setHours(d.getHours() + n)
      if (unit === 'd') d.setDate(d.getDate() + n)
      if (unit === 'w') d.setDate(d.getDate() + 7 * n)
      if (unit === 'M') d.setMonth(d.getMonth() + n)
      if (unit === 'y') d.setFullYear(d.getFullYear() + n)
    }
    if (m[4] === 'd') d.setHours(0, 0, 0, 0)
    if (m[4] === 'w') {
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    }
    if (m[4] === 'M') {
      d.setHours(0, 0, 0, 0)
      d.setDate(1)
    }
    if (m[4] === 'y') {
      d.setHours(0, 0, 0, 0)
      d.setMonth(0, 1)
    }
    return d
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], iso[4] ? +iso[4] : 0, iso[5] ? +iso[5] : 0)
  return null
}

// ---- matching ----

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case '=':
      return a === b
    case '!=':
      return a !== b
    case '>':
      return a > b
    case '>=':
      return a >= b
    case '<':
      return a < b
    case '<=':
      return a <= b
    default:
      return false
  }
}

function words(task: Task, field: string, ctx: FilterContext): string[] {
  if (field === 'labels') return task.labels.flatMap((l) => [l.title.toLowerCase(), l.id])
  if (field === 'project') {
    const p = ctx.projects.find((x) => x.id === task.projectId)
    return p ? [p.title.toLowerCase(), p.id.toLowerCase(), p.identifier.toLowerCase()].filter(Boolean) : []
  }
  if (field === 'assignees') {
    return task.assignees.flatMap((id) => {
      const person = ctx.people.find((x) => x.id === id)
      return person
        ? [person.username.toLowerCase(), person.name.toLowerCase(), person.name.toLowerCase().split(' ')[0], id.toLowerCase()].filter(Boolean)
        : [id.toLowerCase()]
    })
  }
  return []
}

function matches(node: FilterNode, task: Task, ctx: FilterContext): boolean {
  if (node.kind !== 'cmp') {
    return node.kind === 'and' ? matches(node.left, task, ctx) && matches(node.right, task, ctx) : matches(node.left, task, ctx) || matches(node.right, task, ctx)
  }
  const { field, op, values } = node
  const wanted = values.map((v) => v.toLowerCase())

  if (LIST_FIELDS.has(field)) {
    const have = words(task, field, ctx)
    const any = wanted.some((w) => (op === 'like' ? have.some((h) => h.includes(w)) : have.includes(w)))
    if (op === '=' || op === 'in' || op === 'like') return any
    if (op === '!=' || op === 'not in') return !any
    throw new FilterError(`${field} takes =, !=, in, not in or like.`)
  }
  if (field === 'title' || field === 'description') {
    const text = task[field].toLowerCase()
    if (op === 'like') return text.includes(wanted[0])
    if (op === '=') return text === wanted[0]
    if (op === '!=') return text !== wanted[0]
    if (op === 'in') return wanted.includes(text)
    if (op === 'not in') return !wanted.includes(text)
    throw new FilterError(`${field} takes =, != or like.`)
  }
  if (field === 'done') {
    const value = wanted[0] === 'true' ? true : wanted[0] === 'false' ? false : null
    if (value === null) throw new FilterError('done is true or false.')
    if (op === '=') return task.done === value
    if (op === '!=') return task.done !== value
    throw new FilterError('done takes = or !=.')
  }
  if (DATE_FIELDS.has(field)) {
    const iso = task[field as 'dueDate']
    const dates = values.map((v) => filterDate(v, ctx.now))
    if (dates.some((d) => !d)) throw new FilterError(`“${values.join(', ')}” isn’t a date (try now+7d or 2026-10-23).`)
    if (!iso) return op === '!=' || op === 'not in'
    const t = Date.parse(iso)
    if (op === 'in') return dates.some((d) => sameDay(t, d!))
    if (op === 'not in') return !dates.some((d) => sameDay(t, d!))
    return compare(t, op, dates[0]!.getTime())
  }
  // priority, percentDone
  const numbers = values.map((v) => Number(v))
  if (numbers.some((n) => isNaN(n))) throw new FilterError(`${field} is a number.`)
  const have = task[field as 'priority']
  if (op === 'in') return numbers.includes(have)
  if (op === 'not in') return !numbers.includes(have)
  return compare(have, op, numbers[0])
}

function sameDay(t: number, d: Date): boolean {
  const a = new Date(t)
  return a.getFullYear() === d.getFullYear() && a.getMonth() === d.getMonth() && a.getDate() === d.getDate()
}

/** A filter's test for tasks; it throws FilterError (with what's wrong) for a bad filter. */
export function compileFilter(query: string, ctx: FilterContext): (task: Task) => boolean {
  const node = parseFilter(query)
  if (!node) return () => true
  // try it once, so a bad value shows up now and not while showing the tasks
  matchesOrThrow(node, ctx)
  return (task) => matches(node, task, ctx)
}

function matchesOrThrow(node: FilterNode, ctx: FilterContext): void {
  const probe: Task = {
    id: '', projectId: '', index: 0, title: '', description: '', done: false, doneAt: null, dueDate: ctx.now.toISOString(),
    startDate: ctx.now.toISOString(), endDate: ctx.now.toISOString(), priority: 0, percentDone: 0, color: '', labels: [],
    assignees: [], reminders: [], repeat: { every: 0, mode: 'due' }, relations: [], attachments: [], favorite: false, bucketId: null, position: 0,
    kanbanPosition: 0, createdBy: '', created: ctx.now.toISOString(), updated: ctx.now.toISOString(),
  }
  const walk = (n: FilterNode): void => {
    if (n.kind === 'cmp') matches(n, probe, ctx)
    else {
      walk(n.left)
      walk(n.right)
    }
  }
  walk(node)
}

// ---- as the server writes them ----

const SNAKE: Record<string, string> = { percentDone: 'percent_done', dueDate: 'due_date', startDate: 'start_date', endDate: 'end_date', doneAt: 'done_at' }

function quoted(v: string): string {
  return /^[^\s(),=<>!&|"']+$/.test(v) ? v : `"${v.replace(/"/g, "'")}"`
}

/**
 * A filter written again with its fields and values changed: fields by `field`, each value by
 * `value` (given its field). Anything it can't read stays as it was.
 */
function rewrite(query: string, field: (name: string) => string, value: (field: string, v: string) => string): string {
  let tokens: Token[]
  try {
    tokens = lex(query)
  } catch {
    return query
  }
  const out: string[] = []
  let current = ''
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const prev = tokens[i - 1]
    if (t.kind === 'word' && tokens[i + 1]?.kind === 'op') {
      current = FIELDS.find((f) => f.toLowerCase() === t.text.toLowerCase().replace(/_/g, '')) ?? t.text
      out.push(field(current))
    } else if (t.kind === 'word' && (prev?.kind === 'op' || prev?.kind === 'comma')) {
      out.push(quoted(value(current, t.text)))
    } else if (t.kind === 'comma') {
      out[out.length - 1] += ','
    } else {
      out.push(t.kind === 'word' ? quoted(t.text) : t.text)
    }
  }
  return out.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')')
}

/** A filter as the server takes it: labels and projects by id, fields as it names them. */
export function filterToServer(query: string, ctx: { labels: { id: string; title: string }[]; projects: Pick<Project, 'id' | 'title' | 'identifier'>[] }): string {
  return rewrite(
    query,
    (f) => SNAKE[f] ?? f,
    (f, v) => {
      const lower = v.toLowerCase()
      if (f === 'labels') return ctx.labels.find((l) => l.title.toLowerCase() === lower)?.id ?? v
      if (f === 'project') return ctx.projects.find((p) => p.title.toLowerCase() === lower || p.identifier.toLowerCase() === lower)?.id ?? v
      return v
    },
  )
}

/** A filter from the server in words: labels and projects by name. */
export function filterFromServer(query: string, ctx: { labels: { id: string; title: string }[]; projects: Pick<Project, 'id' | 'title'>[] }): string {
  return rewrite(
    query,
    (f) => f,
    (f, v) => {
      if (f === 'labels') return ctx.labels.find((l) => l.id === v)?.title ?? v
      if (f === 'project') return ctx.projects.find((p) => p.id === v)?.title ?? v
      return v
    },
  )
}

/** An error message for a filter, or "" if it's fine. */
export function checkFilter(query: string, ctx: FilterContext): string {
  try {
    compileFilter(query, ctx)
    return ''
  } catch (e) {
    return e instanceof FilterError ? e.message : 'That filter can’t be read.'
  }
}
