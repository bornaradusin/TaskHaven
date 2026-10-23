// The demo: a family's server in memory (nothing leaves the phone). Also what the screenshots show.

import { MemoryBackend, World } from './memory'
import { addDays, atHour, nextWeekday, startOfDay } from '@/logic/dates'
import { DEFAULT_SETTINGS, type Bucket, type Label, type LabelRef, type Notice, type Profile, type Right, type Task } from '@/model'

const DAY = 24 * 3600

export interface Demo {
  world: World
  backend: MemoryBackend
  people: Record<'alex' | 'sam' | 'jordan' | 'riley', Profile>
}

/** Alex (signed in) shares Home and Groceries with the family team; Garden with a neighbour. */
export function makeDemo(now = new Date()): Demo {
  const world = new World()
  // the demo's clock starts at `now` and runs on from there
  const startedAt = Date.now()
  world.now = () => new Date(Date.now() - startedAt + now.getTime())
  const iso = (d: Date) => d.toISOString()
  const day = (n: number, hour = 12, minute = 0) => iso(atHour(addDays(startOfDay(now), n), hour, minute))
  const created = day(-20, 9)

  const person = (username: string, name: string): Profile => {
    const profile = { id: world.id(), name, username, email: `${username}@example.com` }
    world.accounts.set(profile.id, { profile, password: 'taskhaven', settings: { ...DEFAULT_SETTINGS }, notices: [], deletionRequested: false, favorites: [] })
    return profile
  }
  const people = {
    alex: person('alex', 'Alex Morgan'),
    sam: person('sam', 'Sam Morgan'),
    jordan: person('jordan', 'Jordan Morgan'),
    riley: person('riley', 'Riley Chen'),
  }
  const { alex, sam, jordan, riley } = people

  const labels: Record<string, Label> = {}
  for (const [key, title, color] of [
    ['chores', 'Chores', '#e8632e'],
    ['shopping', 'Shopping', '#4caf50'],
    ['bills', 'Bills', '#d81b60'],
    ['garden', 'Garden', '#16a085'],
    ['repairs', 'Repairs', '#607d8b'],
  ]) {
    labels[key] = { id: world.id(), title, color, description: '', createdBy: alex.id }
    world.labels.set(labels[key].id, labels[key])
  }
  const ref = (key: string): LabelRef => ({ id: labels[key].id, title: labels[key].title, color: labels[key].color })

  const family = world.id()
  world.teams.set(family, {
    id: family,
    name: 'Family',
    description: 'Everyone at home',
    ownerId: alex.id,
    members: { [alex.id]: 'admin', [sam.id]: 'member', [jordan.id]: 'member' },
    memberIds: [alex.id, sam.id, jordan.id],
    created,
  })

  let position = 0
  const project = (title: string, identifier: string, color: string, extra: { description?: string; parentId?: string; archived?: boolean; owner?: Profile } = {}) => {
    const id = world.id()
    const bucket = (t: string, n: number): Bucket => ({ id: world.id(), title: t, limit: 0, position: n * 100 })
    const buckets = [bucket('To-Do', 1), bucket('Doing', 2), bucket('Done', 3)]
    const p = {
      id,
      title,
      description: extra.description ?? '',
      color,
      identifier,
      parentId: extra.parentId ?? null,
      archived: !!extra.archived,
      favorite: false,
      ownerId: (extra.owner ?? alex).id,
      position: ++position * 100,
      views: { list: `${id}-list`, gantt: `${id}-gantt`, table: `${id}-table`, kanban: `${id}-kanban` },
      buckets,
      doneBucketId: buckets[2].id,
      created,
      updated: created,
      users: {} as Record<string, Right>,
      teams: {} as Record<string, Right>,
      links: [],
      nextIndex: 1,
    }
    world.projects.set(id, p)
    return p
  }

  const inbox = project('Inbox', '', '#607d8b')
  const home = project('Home', 'HOME', '#e8632e', { description: 'Everything around the house. Tick it off when it’s done!' })
  home.teams[family] = 'write'
  const kitchen = project('Kitchen', 'KIT', '#e0a21b', { parentId: home.id })
  const groceries = project('Groceries', 'SHOP', '#4caf50')
  groceries.teams[family] = 'write'
  const garden = project('Garden', 'GARD', '#16a085')
  garden.users[riley.id] = 'read'
  const trip = project('Weekend in the Lakes', 'TRIP', '#1e88e5')
  project('Moving house', 'MOVE', '#795548', { archived: true })
  for (const who of [sam, jordan, riley]) project('Inbox', '', '#607d8b', { owner: who })

  let n = 0
  const task = (p: ReturnType<typeof project>, title: string, extra: Partial<Task> = {}): Task => {
    n++
    const t: Task = {
      id: world.id(),
      projectId: p.id,
      index: p.nextIndex++,
      title,
      description: '',
      done: false,
      doneAt: null,
      dueDate: null,
      startDate: null,
      endDate: null,
      priority: 0,
      percentDone: 0,
      color: '',
      labels: [],
      assignees: [],
      reminders: [],
      repeat: { every: 0, mode: 'due' },
      relations: [],
      attachments: [],
      favorite: false,
      bucketId: p.buckets[0].id,
      position: n * 1024,
      kanbanPosition: n * 1024,
      createdBy: alex.id,
      created,
      updated: created,
      ...extra,
    }
    if (t.done) {
      t.bucketId = p.doneBucketId
      t.doneAt ??= day(-1, 18)
    }
    world.tasks.set(t.id, t)
    return t
  }

  task(inbox, 'Call the dentist about a check-up', { dueDate: day(3, 10) })
  const bins = task(home, 'Take out the bins', {
    dueDate: iso(atHour(nextWeekday(now, 2), 19)),
    repeat: { every: 7 * DAY, mode: 'due' },
    labels: [ref('chores')],
    assignees: [sam.id],
    reminders: [{ at: null, relativeTo: 'due', offset: -60 }],
    description: '<p>Green bin is recycling (every other week). Black bin goes out every week.</p>',
  })
  const tap = task(home, 'Fix the dripping tap in the bathroom', {
    dueDate: day(0, 18),
    priority: 3,
    labels: [ref('repairs')],
    assignees: [alex.id],
    bucketId: home.buckets[1].id,
    percentDone: 50,
  })
  task(home, 'Pay the electricity bill', { dueDate: day(-1), priority: 4, labels: [ref('bills')], assignees: [alex.id] })
  task(home, 'Clean the bathroom', { dueDate: day(2), labels: [ref('chores')], assignees: [jordan.id], repeat: { every: 7 * DAY, mode: 'due' } })
  task(home, 'Water the plants', { dueDate: day(1, 9), labels: [ref('chores')], repeat: { every: 3 * DAY, mode: 'done' }, assignees: [jordan.id] })
  task(home, 'Change the smoke alarm batteries', { dueDate: day(9), repeat: { every: 365 * DAY, mode: 'due' }, priority: 2 })
  task(home, 'Book the boiler service', { priority: 2, labels: [ref('repairs')] })
  task(home, 'Vacuum the stairs', { done: true, labels: [ref('chores')], assignees: [sam.id], createdBy: alex.id })
  task(home, 'Hang the hallway mirror', { done: true, doneAt: day(-3, 15) })
  const washer = task(home, 'Buy a new washer for the tap', { dueDate: day(0, 12), labels: [ref('shopping'), ref('repairs')] })
  tap.relations.push({ kind: 'blocked', taskId: washer.id, projectId: home.id, title: washer.title, done: false })
  washer.relations.push({ kind: 'blocking', taskId: tap.id, projectId: home.id, title: tap.title, done: false })

  task(kitchen, 'Descale the kettle', { dueDate: day(3), labels: [ref('chores')] })
  task(kitchen, 'Clean the oven', { dueDate: day(5), labels: [ref('chores')], assignees: [sam.id], priority: 1 })
  task(kitchen, 'Defrost the freezer', {})

  for (const [title, extra] of [
    ['Milk', {}],
    ['Bread', {}],
    ['Eggs (a dozen)', {}],
    ['Coffee beans', { priority: 2 }],
    ['Washing-up liquid', {}],
    ['Bin bags', { done: true }],
  ] as [string, Partial<Task>][]) {
    task(groceries, title, { labels: [ref('shopping')], dueDate: day(1, 17), ...extra })
  }

  task(garden, 'Mow the lawn', { dueDate: iso(atHour(nextWeekday(now, 6), 10)), labels: [ref('garden')], repeat: { every: 14 * DAY, mode: 'due' } })
  task(garden, 'Plant the tulip bulbs', { startDate: day(1, 9), endDate: day(6, 17), labels: [ref('garden')], percentDone: 20 })
  task(garden, 'Trim the hedge', { startDate: day(4, 9), endDate: day(8, 17), labels: [ref('garden')], priority: 1 })
  task(garden, 'Clear the gutters', { startDate: day(-2, 9), endDate: day(2, 17), priority: 3, labels: [ref('repairs')] })

  task(trip, 'Book the cottage', { done: true, doneAt: day(-6) })
  task(trip, 'Check the tyres and oil', { dueDate: day(6), assignees: [alex.id] })
  task(trip, 'Pack the walking boots', { dueDate: day(7, 8) })
  task(trip, 'Download the offline maps', { dueDate: day(7, 8) })

  const comment = (who: Profile, text: string, at: string) => {
    const list = world.comments.get(bins.id) ?? []
    list.push({ id: world.id(), taskId: bins.id, authorId: who.id, text, created: at, updated: at })
    world.comments.set(bins.id, list)
  }
  comment(sam, '<p>Recycling goes out this week too.</p>', day(-1, 20, 15))
  comment(alex, '<p>Thanks! I’ll leave the boxes flattened by the door.</p>', day(-1, 21, 2))

  const notices = world.accounts.get(alex.id)!.notices
  const notice = (n: Omit<Notice, 'id'>) => notices.push({ ...n, id: world.id() })
  notice({ kind: 'comment', fromId: sam.id, projectId: home.id, taskId: bins.id, title: bins.title, text: 'Recycling goes out this week too.', created: day(-1, 20, 15), read: false })
  notice({ kind: 'shared', fromId: alex.id, projectId: '', taskId: null, title: 'Family', text: 'team:Family', created: day(-20, 9), read: true })
  notice({ kind: 'assigned', fromId: jordan.id, projectId: kitchen.id, taskId: null, title: 'Defrost the freezer', text: '', created: day(-4, 10), read: true })

  world.accounts.get(alex.id)!.favorites = [`p${home.id}`, `p${groceries.id}`, `t${bins.id}`]
  const settings = world.accounts.get(alex.id)!.settings
  settings.defaultProjectId = inbox.id
  settings.recentProjects = [home.id, groceries.id, garden.id, trip.id]

  world.filters.set(world.id(), { id: '', title: 'Urgent', description: 'High priority and not done', query: 'done = false && priority >= 3', ownerId: alex.id })
  for (const [fid, f] of world.filters) f.id = fid

  const backend = new MemoryBackend(world)
  backend.actAs(alex.id)
  return { world, backend, people }
}

export function demoBackend(): MemoryBackend {
  return makeDemo().backend
}
