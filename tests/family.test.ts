// A family on one server, through the app's store and the demo's in-memory server (which behaves
// as a Vikunja server does): accounts, sharing by username and teams, rights, notices, quick add,
// repeats, the board. tests/server.test.ts checks the same against a real Vikunja server.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, World } from '@/data/memory'
import { makeDemo } from '@/data/demo'
import * as app from '@/state'
import { store } from '@/state'

const settle = () => new Promise((r) => setTimeout(r, 0))

let world: World
let alex: MemoryBackend
let sam: MemoryBackend
let jordan: MemoryBackend
const id = (username: string) => [...world.accounts.values()].find((a) => a.profile.username === username)!.profile.id

beforeEach(async () => {
  world = new World()
  sam = new MemoryBackend(world)
  await sam.signUp('sam', 'sam@example.com', 'secret12')
  jordan = new MemoryBackend(world)
  await jordan.signUp('jordan', 'jordan@example.com', 'secret12')
  alex = new MemoryBackend(world)
  app.connect(alex)
  await app.signUp('alex', 'alex@example.com', 'secret12')
  await settle()
})

afterEach(() => app.disconnect())

async function titles(b: MemoryBackend): Promise<string[]> {
  let seen: string[] = []
  const stop = b.watchProjects((ps) => (seen = ps.map((p) => p.title)))
  await settle()
  stop()
  return seen
}

describe('accounts', () => {
  it('signs up, out, and in by username or email', async () => {
    expect(store.user?.username).toBe('alex')
    // a new account starts with an Inbox, where quick add puts tasks
    expect(store.projects.map((p) => p.title)).toEqual(['Inbox'])
    expect(store.settings.defaultProjectId).toBe(store.projects[0].id)
    await app.signOut()
    await settle()
    expect(store.user).toBeNull()
    await expect(app.signIn('alex', 'wrong-password')).rejects.toThrow('don’t match')
    await app.signIn('ALEX@example.com', 'secret12')
    await settle()
    expect(store.user?.username).toBe('alex')
  })

  it('refuses a taken username or email, and short passwords', async () => {
    const other = new MemoryBackend(world)
    await expect(other.signUp('Sam', 'new@example.com', 'secret12')).rejects.toThrow('taken')
    await expect(other.signUp('sammy', 'sam@example.com', 'secret12')).rejects.toThrow('already an account')
    await expect(other.signUp('shorty', 'short@example.com', '1234567')).rejects.toThrow('8 characters')
  })

  it('changes the password', async () => {
    await expect(app.changePassword('wrong-password', 'new-secret')).rejects.toThrow('don’t match')
    await app.changePassword('secret12', 'new-secret')
    await app.signOut()
    await app.signIn('alex', 'new-secret')
    await settle()
    expect(store.user?.username).toBe('alex')
  })
})

describe('sharing a project', () => {
  it('shows a project only to its owner until it’s shared, by username', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    expect(await titles(sam)).toEqual(['Inbox'])
    // nobody finds it without being given it
    await expect(sam.createTask(home, { title: 'Sneaky' })).rejects.toThrow('isn’t there')
    await expect(app.shareWithUser(app.project(home)!, 'nobody', 'write')).rejects.toThrow('nobody with that username')
    await app.shareWithUser(app.project(home)!, 'sam', 'write')
    expect(await titles(sam)).toEqual(['Inbox', 'Home'])
    expect(await titles(jordan)).toEqual(['Inbox'])
    await sam.createTask(home, { title: 'Water the plants' })
    await settle()
    expect(app.allTasks().map((t) => t.title)).toContain('Water the plants')
  })

  it('keeps someone who can only see from changing tasks, or the project', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    const t = await app.createTask(home, { title: 'Bins' })
    await app.shareWithUser(app.project(home)!, 'sam', 'read')
    await expect(sam.updateTask(t, { done: true })).rejects.toThrow('allowed')
    await expect(sam.createTask(home, { title: 'Mine' })).rejects.toThrow('allowed')
    await expect(sam.addComment(t.id, 'Hi')).rejects.toThrow('allowed')
    await expect(sam.updateProject(home, { title: 'Ours' })).rejects.toThrow('allowed')
    await expect(sam.shareWithUser(home, 'jordan', 'admin')).rejects.toThrow('allowed')
    // nor take themselves off it: only admins do that (as on the server)
    await expect(sam.unshareUser(home, id('sam'))).rejects.toThrow('ask whoever shared it')
    // the owner stops sharing
    await app.unshareUser(app.project(home)!, id('sam'))
    expect(await titles(sam)).toEqual(['Inbox'])
  })

  it('lists who it’s shared with, and their rights', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    const p = app.project(home)!
    await app.shareWithUser(p, '@sam', 'read')
    await app.setUserRight(p, id('sam'), 'admin')
    const shares = await app.getShares(p)
    expect(shares.users).toEqual([{ userId: id('sam'), right: 'admin' }])
    // an admin can share it on, and take themselves off
    await sam.shareWithUser(home, 'jordan', 'write')
    expect(await titles(jordan)).toContain('Home')
    await sam.unshareUser(home, id('sam'))
    expect(await titles(sam)).toEqual(['Inbox'])
  })

  it('makes links, for admins', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    const link = await app.createLinkShare(app.project(home)!, 'read', 'Fridge', '')
    expect(app.linkShareUrl(link)).toContain(`/share/${link.hash}/auth`)
    expect((await app.getShares(app.project(home)!)).links).toHaveLength(1)
    await app.deleteLinkShare(app.project(home)!, link.id)
    expect((await app.getShares(app.project(home)!)).links).toHaveLength(0)
  })

  it('gives a project the next free identifier when another project on the server has it', async () => {
    await sam.createProject({ title: 'Home', description: '', color: '', identifier: 'HOME', parentId: null, archived: false, favorite: false, position: 0 })
    const home = await app.createProject({ title: 'Home' })
    await settle()
    expect(app.project(home)?.identifier).toBe('HOME2')
  })

  it('keeps each person’s favourites their own', async () => {
    const home = await app.createProject({ title: 'Home' })
    await app.shareWithUser(app.project(home)!, 'sam', 'write')
    await settle()
    await app.toggleFavorite(home)
    await settle()
    expect(app.isFavorite(home)).toBe(true)
    let samSees = true
    sam.watchProjects((ps) => (samSees = ps.find((p) => p.id === home)!.favorite))
    await settle()
    expect(samSees).toBe(false)
  })
})

describe('teams', () => {
  it('shares a project with a team: whoever is in it sees it, whoever leaves doesn’t', async () => {
    const home = await app.createProject({ title: 'Home' })
    const teamId = await app.createTeam('Family')
    await settle()
    const team = () => store.teams.find((t) => t.id === teamId)!
    await app.addTeamMember(team(), 'sam')
    await app.shareWithTeam(app.project(home)!, teamId, 'write')
    expect(await titles(sam)).toContain('Home')
    // someone added later sees it too
    await settle()
    await app.addTeamMember(team(), 'jordan')
    expect(await titles(jordan)).toContain('Home')
    // and the server tells them they're in the team
    let notices: string[] = []
    jordan.watchNotices((n) => (notices = n.map((x) => `${x.kind} ${x.text}`)))
    await settle()
    expect(notices).toContain('shared team:Family')
    // a member leaves by themselves
    await jordan.removeTeamMember(teamId, id('jordan'))
    expect(await titles(jordan)).not.toContain('Home')
    await expect(sam.addTeamMember(teamId, 'jordan')).rejects.toThrow('allowed')
    await settle()
    await app.removeTeamMember(team(), id('sam'))
    expect(await titles(sam)).not.toContain('Home')
  })
})

describe('tasks', () => {
  it('quick-adds with labels, people, priority and dates, and the server tells whoever is assigned', async () => {
    const home = await app.createProject({ title: 'Home' })
    await app.shareWithUser(app.project(home)!, 'sam', 'write')
    await settle()
    const t = (await app.quickAdd('Take out the bins tomorrow at 7pm *chores @sam !3', home))!
    expect(t.title).toBe('Take out the bins')
    expect(t.labels.map((l) => l.title)).toEqual(['chores'])
    expect(t.priority).toBe(3)
    expect(new Date(t.dueDate!).getHours()).toBe(19)
    expect(t.assignees).toEqual([id('sam')])
    await settle()
    expect(store.labels.map((l) => l.title)).toEqual(['chores'])
    let notices: string[] = []
    sam.watchNotices((n) => (notices = n.map((x) => `${x.kind} ${x.title}`)))
    await settle()
    expect(notices).toContain('assigned Take out the bins')

    await expect(app.quickAdd('Something +Nowhere', home)).rejects.toThrow('no project called')
    const groceries = await app.createProject({ title: 'Groceries' })
    await settle()
    expect((await app.quickAdd('Milk +groceries'))!.projectId).toBe(groceries)
    // without a project: the default one (the Inbox)
    expect((await app.quickAdd('Call the dentist'))!.projectId).toBe(store.settings.defaultProjectId)
  })

  it('brings repeating tasks back, and done ones go to the done column', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    const bins = (await app.quickAdd('Bins every day', home))!
    const once = (await app.quickAdd('Fix the tap', home))!
    await settle()
    await app.setDone(app.findTask(home, bins.id)!, true)
    await app.setDone(app.findTask(home, once.id)!, true)
    await settle()
    const b = app.findTask(home, bins.id)!
    expect(b.done).toBe(false)
    expect(Date.parse(b.dueDate!)).toBeGreaterThan(Date.parse(bins.dueDate!))
    const o = app.findTask(home, once.id)!
    expect(o.done).toBe(true)
    expect(o.bucketId).toBe(app.project(home)!.doneBucketId)
  })

  it('marks a task done when it’s dropped in the done column, and not done out of it', async () => {
    const home = await app.createProject({ title: 'Home' })
    await settle()
    const p = app.project(home)!
    const t = await app.createTask(home, { title: 'Hang the mirror' })
    await settle()
    await app.moveTaskToBucket(app.findTask(home, t.id)!, p.doneBucketId!, 10)
    await settle()
    expect(app.findTask(home, t.id)!.done).toBe(true)
    await app.moveTaskToBucket(app.findTask(home, t.id)!, p.buckets[0].id, 10)
    await settle()
    expect(app.findTask(home, t.id)!.done).toBe(false)
    // a full column takes no more
    await app.updateBucket(p, p.buckets[1].id, { limit: 1 })
    const a = await app.createTask(home, { title: 'A' })
    const b = await app.createTask(home, { title: 'B' })
    await app.moveTaskToBucket(a, p.buckets[1].id, 1)
    await expect(app.moveTaskToBucket(b, p.buckets[1].id, 2)).rejects.toThrow('full')
  })

  it('relates tasks both ways, and moves tasks between projects', async () => {
    const home = await app.createProject({ title: 'Home' })
    const garden = await app.createProject({ title: 'Garden' })
    await settle()
    const tap = await app.createTask(home, { title: 'Fix the tap' })
    const washer = await app.createTask(home, { title: 'Buy a washer' })
    await app.relate(tap, 'blocked', washer)
    await settle()
    expect(app.findTask(home, tap.id)!.relations).toMatchObject([{ kind: 'blocked', taskId: washer.id, title: 'Buy a washer' }])
    expect(app.findTask(home, washer.id)!.relations).toMatchObject([{ kind: 'blocking', taskId: tap.id }])
    const moved = (await app.moveTask(app.findTask(home, washer.id)!, garden))!
    await settle()
    expect(moved.projectId).toBe(garden)
    expect(moved.index).toBe(1)
    await app.unrelate(app.findTask(home, tap.id)!, app.findTask(home, tap.id)!.relations[0])
    await settle()
    expect(app.findTask(null, washer.id)!.relations).toEqual([])
  })

  it('keeps comments to their authors, and a label to its maker', async () => {
    const home = await app.createProject({ title: 'Home' })
    await app.shareWithUser(app.project(home)!, 'sam', 'write')
    await settle()
    const t = await app.createTask(home, { title: 'Bins' })
    await app.addComment(t, '<p>Green bin this week</p>')
    let comments: { id: string; text: string }[] = []
    sam.watchComments(t.id, (c) => (comments = c))
    await settle()
    expect(comments.map((c) => c.text)).toEqual(['<p>Green bin this week</p>'])
    await expect(sam.updateComment(t.id, comments[0].id, 'Mine')).rejects.toThrow('someone else’s')

    const label = await app.createLabel('Chores', '#e8632e')
    await app.updateTask(app.findTask(home, t.id)!, { labels: [label] })
    await app.saveLabel({ ...label, title: 'Housework' })
    await settle()
    expect(app.findTask(home, t.id)!.labels[0].title).toBe('Housework')
    // Sam sees it (it's on a task he can see), but can't change it
    let samLabels: string[] = []
    sam.watchLabels((l) => (samLabels = l.map((x) => x.title)))
    await settle()
    expect(samLabels).toEqual(['Housework'])
    await expect(sam.updateLabel(label.id, { title: 'Mine' })).rejects.toThrow('someone else’s')
  })

  it('keeps saved filters on the server, each person’s own', async () => {
    const fid = await app.saveFilter({ title: 'Urgent', description: '', query: 'done = false && priority >= 3' })
    await settle()
    expect(store.filters.map((f) => f.id)).toEqual([fid])
    let samFilters: unknown[] = ['x']
    sam.watchFilters((f) => (samFilters = f))
    await settle()
    expect(samFilters).toEqual([])
  })
})

describe('the demo', () => {
  it('is a family with shared projects', async () => {
    app.disconnect()
    const demo = makeDemo(new Date(2026, 9, 23, 10))
    app.connect(demo.backend)
    await settle()
    expect(store.user?.username).toBe('alex')
    expect(store.projects.map((p) => p.title)).toEqual(expect.arrayContaining(['Home', 'Groceries', 'Garden', 'Weekend in the Lakes']))
    expect(app.allTasks().length).toBeGreaterThan(20)
    expect(store.notices.length).toBeGreaterThan(0)
    expect(store.filters.map((f) => f.title)).toEqual(['Urgent'])
    // Sam sees Home through the family team, not Alex's garden
    demo.backend.actAs(demo.people.sam.id)
    await settle()
    expect(store.projects.map((p) => p.title)).toEqual(expect.arrayContaining(['Home', 'Groceries', 'Kitchen']))
    expect(store.projects.map((p) => p.title)).not.toContain('Garden')
  })
})
