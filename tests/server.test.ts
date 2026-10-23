// TaskHaven against a real Vikunja server: VIKUNJA_URL=http://127.0.0.1:3456 npm run test:server
// (the server must take new accounts: each run makes its own people). Skipped without one.

import { describe, expect, it, beforeAll, vi } from 'vitest'
import { VikunjaBackend } from '@/data/vikunja'
import type { Backend } from '@/data/backend'
import type { Notice, Profile, Project, Settings, Task } from '@/model'

const SERVER = process.env.VIKUNJA_URL ?? ''
// Sam's phone reaches the same server by another name, so each keeps their own sign-in
const SAM_SERVER = SERVER.replace('127.0.0.1', 'localhost')
const run = SERVER && SAM_SERVER !== SERVER ? describe : describe.skip
const tag = Math.random().toString(36).slice(2, 8)
vi.setConfig({ testTimeout: 30000 })

/** Fetches again until what's wanted is there (the server tells people a moment later). */
async function until<T>(b: Backend, read: () => Promise<T>, ok: (v: T) => boolean, tries = 20): Promise<T> {
  let v = await read()
  for (let i = 0; i < tries && !ok(v); i++) {
    await new Promise((r) => setTimeout(r, 300))
    await b.refresh()
    v = await read()
  }
  return v
}

/** The latest a watcher said, once it says something matching. */
function next<T>(watch: (cb: (v: T) => void) => () => void, ok: (v: T) => boolean = () => true, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop: (() => void) | null = null
    const timer = setTimeout(() => {
      stop?.()
      reject(new Error('Nothing came'))
    }, ms)
    stop = watch((v) => {
      if (!ok(v)) return
      clearTimeout(timer)
      queueMicrotask(() => stop?.())
      resolve(v)
    })
  })
}

async function account(name: string, server: string): Promise<{ b: VikunjaBackend; me: Profile }> {
  const b = new VikunjaBackend(server)
  await b.signUp(`${name}_${tag}`, `${name}_${tag}@example.com`, 'secret-password')
  const me = await next<Profile | null>((cb) => b.onAuth(cb), (u) => !!u?.username)
  return { b, me: me! }
}

const tasksOf = (b: Backend) => next<Task[]>((cb) => b.watchTasks(cb))
const projectsOf = (b: Backend) => next<Project[]>((cb) => b.watchProjects(cb))

run('a Vikunja server', () => {
  let alex: { b: VikunjaBackend; me: Profile }
  let sam: { b: VikunjaBackend; me: Profile }
  let home: Project

  beforeAll(async () => {
    localStorage.clear()
    alex = await account('alex', SERVER)
    sam = await account('sam', SAM_SERVER)
  }, 30000)

  it('says what it is', async () => {
    const info = await alex.b.info()
    expect(info.version).toMatch(/^v?\d/)
    expect(info.localLogin).toBe(true)
  })

  it('signs in by username or email, and refuses a wrong password', async () => {
    // (on a phone of its own: what Alex's is keeping is put back afterwards)
    const kept = { ...localStorage }
    localStorage.clear()
    const b = new VikunjaBackend(SERVER)
    await expect(b.signIn(`alex_${tag}`, 'wrong-password')).rejects.toMatchObject({ code: 'auth' })
    await b.signIn(`alex_${tag}@example.com`, 'secret-password')
    const me = await next<Profile | null>((cb) => b.onAuth(cb), (u) => !!u?.username)
    expect(me?.username).toBe(`alex_${tag}`)
    // a second start of the app is still signed in (the session is kept on the phone)
    const again = new VikunjaBackend(SERVER)
    const still = await next<Profile | null>((cb) => again.onAuth(cb), (u) => !!u?.username)
    expect(still?.id).toBe(me?.id)
    await again.refresh()
    await b.signOut()
    expect(b.server).toBe(SERVER.replace(/\/+$/, ''))
    localStorage.clear()
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v)
  })

  it('keeps each account’s projects to itself until they’re shared', async () => {
    home = await alex.b.createProject({ title: `Home ${tag}`, description: '', color: '#e8632e', identifier: `H${tag}`.slice(0, 10).toUpperCase(), parentId: null, archived: false, favorite: false, position: 0 })
    expect(home.right).toBe('admin')
    await alex.b.createTask(home.id, { title: 'Take out the bins' })
    await sam.b.refresh()
    expect((await projectsOf(sam.b)).some((p) => p.id === home.id)).toBe(false)
    expect((await tasksOf(sam.b)).some((t) => t.projectId === home.id)).toBe(false)
    // nor can Sam get at it directly
    await expect(sam.b.createTask(home.id, { title: 'Sneaky' })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('shares a project by username, with what they may do', async () => {
    expect(await alex.b.findUser('nobody_at_all_' + tag)).toBeNull()
    const found = await alex.b.findUser(`sam_${tag}`)
    expect(found?.username).toBe(`sam_${tag}`)
    await alex.b.shareWithUser(home.id, `sam_${tag}`, 'read')
    await sam.b.refresh()
    const seen = (await projectsOf(sam.b)).find((p) => p.id === home.id)
    expect(seen?.right).toBe('read')
    await expect(sam.b.createTask(home.id, { title: 'Not allowed yet' })).rejects.toMatchObject({ code: 'permission-denied' })
    await alex.b.setUserRight(home.id, found!.id, 'write')
    // (rights are asked for again after a while; a new start asks at once)
    const fresh = new VikunjaBackend(SAM_SERVER)
    const right = (await next<Project[]>((cb) => fresh.watchProjects(cb), (ps) => ps.some((p) => p.id === home.id && p.right === 'write'))).find((p) => p.id === home.id)?.right
    expect(right).toBe('write')
    const shares = await alex.b.getShares(home.id)
    expect(shares.users).toEqual([{ userId: found!.id, right: 'write' }])
  })

  it('assigns, comments and tells people', async () => {
    const t = await sam.b.createTask(home.id, { title: 'Clean the bathroom' })
    const saved = await alex.b.updateTask(t, { assignees: [sam.me.id], priority: 3, description: '<p>Use the green spray</p>' })
    expect(saved.assignees).toEqual([sam.me.id])
    expect(saved.priority).toBe(3)
    // the rest of the task is as it was (the server replaces a task with what it's sent)
    expect(saved.title).toBe('Clean the bathroom')
    await alex.b.addComment(t.id, '<p>Thanks!</p>')
    const comments = await next((cb: (c: { text: string }[]) => void) => alex.b.watchComments(t.id, cb), (c) => c.length > 0)
    expect(comments[0].text).toContain('Thanks!')
    const notices = await until(sam.b, () => next<Notice[]>((cb) => sam.b.watchNotices(cb)), (n) => n.some((x) => x.kind === 'assigned'))
    const assigned = notices.find((n) => n.kind === 'assigned')!
    expect(assigned.title).toBe('Clean the bathroom')
    expect(assigned.fromId).toBe(alex.me.id)
    await sam.b.markRead(assigned.id, true)
    await sam.b.refresh()
    expect((await next<Notice[]>((cb) => sam.b.watchNotices(cb))).find((n) => n.id === assigned.id)?.read).toBe(true)
  })

  it('brings a repeating task back with its next dates', async () => {
    const due = new Date(Date.now() - 3600_000)
    due.setMinutes(0, 0, 0)
    const t = await alex.b.createTask(home.id, { title: 'Water the plants', dueDate: due.toISOString(), repeat: { every: 3 * 86400, mode: 'due' }, reminders: [{ at: null, relativeTo: 'due', offset: -60 }] })
    expect(t.repeat).toEqual({ every: 3 * 86400, mode: 'due' })
    expect(t.reminders).toEqual([{ at: null, relativeTo: 'due', offset: -60 }])
    const done = await alex.b.updateTask(t, { done: true })
    expect(done.done).toBe(false)
    expect(Date.parse(done.dueDate!)).toBe(due.getTime() + 3 * 86400_000)
    const monthly = await alex.b.createTask(home.id, { title: 'Pay the rent', dueDate: '2030-01-31T09:00:00.000Z', repeat: { every: 0, mode: 'month' } })
    expect(monthly.repeat.mode).toBe('month')
    const later = await alex.b.updateTask(monthly, { done: true })
    expect(later.done).toBe(false)
    // the same day next month, or its last day (as TaskHaven's demo does it)
    expect(later.dueDate).toBe('2030-02-28T09:00:00.000Z')
  })

  it('has a board: columns, a done column, and moving tasks', async () => {
    await alex.b.loadBoard(home.id)
    let p = (await projectsOf(alex.b)).find((x) => x.id === home.id)!
    expect(p.buckets.length).toBeGreaterThanOrEqual(3)
    expect(p.doneBucketId).not.toBeNull()
    const t = await alex.b.createTask(home.id, { title: 'Fix the tap' })
    await alex.b.moveToBucket(t, p.doneBucketId!, 100)
    const moved = (await tasksOf(alex.b)).find((x) => x.id === t.id)!
    expect(moved.done).toBe(true)
    expect(moved.bucketId).toBe(p.doneBucketId)
    await alex.b.createBucket(home.id, 'Waiting')
    p = (await projectsOf(alex.b)).find((x) => x.id === home.id)!
    const waiting = p.buckets.find((b) => b.title === 'Waiting')!
    await alex.b.updateBucket(home.id, waiting.id, { title: 'On hold', limit: 2 })
    p = (await projectsOf(alex.b)).find((x) => x.id === home.id)!
    expect(p.buckets.find((b) => b.id === waiting.id)).toMatchObject({ title: 'On hold', limit: 2 })
    await alex.b.deleteBucket(home.id, waiting.id)
    p = (await projectsOf(alex.b)).find((x) => x.id === home.id)!
    expect(p.buckets.some((b) => b.id === waiting.id)).toBe(false)
  })

  it('keeps the list order', async () => {
    await alex.b.loadOrder(home.id)
    const mine = (await tasksOf(alex.b)).filter((t) => t.projectId === home.id && !t.done)
    const last = mine[mine.length - 1]
    await alex.b.setPosition(last, 0.5)
    await alex.b.loadOrder(home.id)
    expect((await tasksOf(alex.b)).find((t) => t.id === last.id)?.position).toBe(0.5)
  })

  it('has labels, which only their maker changes', async () => {
    const label = await alex.b.createLabel('Chores', '#e8632e')
    const t = await alex.b.createTask(home.id, { title: 'Vacuum the stairs', labels: [label] })
    expect(t.labels.map((l) => l.title)).toEqual(['Chores'])
    await alex.b.updateLabel(label.id, { title: 'Housework', color: '#4caf50' })
    await sam.b.refresh()
    const seen = (await tasksOf(sam.b)).find((x) => x.id === t.id)!
    expect(seen.labels).toEqual([{ id: label.id, title: 'Housework', color: '#4caf50' }])
    await expect(sam.b.updateLabel(label.id, { title: 'Mine now' })).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('shares through a team', async () => {
    const teamId = await alex.b.createTeam(`Family ${tag}`, '')
    const garden = await alex.b.createProject({ title: `Garden ${tag}`, description: '', color: '', identifier: '', parentId: null, archived: false, favorite: false, position: 0 })
    await alex.b.addTeamMember(teamId, `sam_${tag}`)
    await alex.b.shareWithTeam(garden.id, teamId, 'write')
    await sam.b.refresh()
    expect((await projectsOf(sam.b)).some((p) => p.id === garden.id)).toBe(true)
    const team = (await next((cb: (t: { id: string; memberIds: string[] }[]) => void) => sam.b.watchTeams(cb))).find((t) => t.id === teamId)
    expect(team?.memberIds.sort()).toEqual([alex.me.id, sam.me.id].sort())
    // out of the team, out of the project
    await alex.b.removeTeamMember(teamId, sam.me.id)
    await sam.b.refresh()
    expect((await projectsOf(sam.b)).some((p) => p.id === garden.id)).toBe(false)
  })

  it('makes share links', async () => {
    const link = await alex.b.createLinkShare(home.id, 'read', 'Fridge', '')
    expect(alex.b.linkShareUrl(link)).toMatch(new RegExp(`/share/${link.hash}/auth$`))
    expect((await alex.b.getShares(home.id)).links.map((l) => l.id)).toContain(link.id)
    await alex.b.deleteLinkShare(home.id, link.id)
    expect((await alex.b.getShares(home.id)).links).toEqual([])
  })

  it('keeps settings, a name and saved filters on the server', async () => {
    await alex.b.saveSettings({ weekStart: 0, theme: 'dark', recentProjects: [home.id] })
    await alex.b.updateProfile({ name: 'Alex Morgan' })
    const fresh = new VikunjaBackend(SERVER)
    const s = await next<Settings>((cb) => fresh.watchSettings(cb), (x) => x.theme === 'dark')
    expect(s).toMatchObject({ weekStart: 0, theme: 'dark', recentProjects: [home.id] })
    const me = await next<Profile | null>((cb) => fresh.onAuth(cb), (u) => !!u?.name)
    expect(me?.name).toBe('Alex Morgan')
    const id = await alex.b.saveFilter({ title: 'Housework', description: '', query: 'done = false && labels in Housework && dueDate < now+7d' })
    const filters = await next((cb: (f: { id: string; query: string }[]) => void) => alex.b.watchFilters(cb), (f) => f.some((x) => x.id === id))
    expect(filters.find((f) => f.id === id)?.query).toBe('done = false && labels in Housework && dueDate < now+7d')
    await alex.b.deleteFilter(id)
  })

  it('moves a task to another project, and deletes things', async () => {
    const box = await alex.b.createProject({ title: `Box ${tag}`, description: '', color: '', identifier: '', parentId: null, archived: false, favorite: false, position: 0 })
    const t = await alex.b.createTask(home.id, { title: 'Pack the books' })
    const moved = await alex.b.updateTask(t, { projectId: box.id })
    expect(moved.projectId).toBe(box.id)
    await alex.b.deleteTask(moved)
    expect((await tasksOf(alex.b)).some((x) => x.id === t.id)).toBe(false)
    await alex.b.deleteProject(box.id)
    expect((await projectsOf(alex.b)).some((p) => p.id === box.id)).toBe(false)
  })

  it('changes a password, and asks the server to delete an account', async () => {
    const kept = { ...localStorage }
    localStorage.clear()
    const b = new VikunjaBackend(SERVER)
    await b.signUp(`jo_${tag}`, `jo_${tag}@example.com`, 'secret-password')
    await next<Profile | null>((cb) => b.onAuth(cb), (u) => !!u?.username)
    await expect(b.changePassword('wrong-password', 'other-password')).rejects.toMatchObject({ code: 'auth' })
    await expect(b.changePassword('secret-password', 'short')).rejects.toMatchObject({ code: 'invalid' })
    // the server signs every session out with a new password: this one signs in again by itself
    await b.changePassword('secret-password', 'other-password')
    await b.refresh()
    expect((await next<Profile | null>((cb) => b.onAuth(cb)))?.username).toBe(`jo_${tag}`)
    await expect(b.requestDeletion('wrong-password')).rejects.toMatchObject({ code: 'auth' })
    // (it emails a link to confirm; this server has no email, so it stays at that)
    await b.requestDeletion('other-password')
    await b.signOut()
    localStorage.clear()
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v)
  })

  it('stays signed in when renewing the session fails for a moment, or another copy renewed it', async () => {
    const kept = { ...localStorage }
    localStorage.clear()
    let fail = 0
    const flaky: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/oauth/token') && fail > 0) {
        fail--
        return new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })
      }
      return fetch(input, init)
    }
    const a = new VikunjaBackend(SERVER, flaky)
    await a.signIn(`alex_${tag}`, 'secret-password')
    await next<Profile | null>((cb) => a.onAuth(cb), (u) => !!u?.username)
    const expire = (b: VikunjaBackend) => ((b as unknown as { session: { expires: number } }).session.expires = 0)
    // a proxy's error page while renewing: not signed out, and fine once the server's back
    expire(a)
    fail = 1
    await expect(a.refresh()).rejects.toMatchObject({ code: 'network' })
    expect(localStorage.length).toBeGreaterThan(0)
    await a.refresh()
    expect((await next<Profile | null>((cb) => a.onAuth(cb)))?.username).toBe(`alex_${tag}`)
    // a second copy (same phone) with the same session: one renews, the other takes the new one
    const b = new VikunjaBackend(SERVER)
    await next<Profile | null>((cb) => b.onAuth(cb), (u) => !!u?.username)
    expire(a)
    await a.refresh()
    expire(b)
    await b.refresh()
    expect((await next<Profile | null>((cb) => b.onAuth(cb)))?.username).toBe(`alex_${tag}`)
    await a.refresh()
    expect((await next<Profile | null>((cb) => a.onAuth(cb)))?.username).toBe(`alex_${tag}`)
    // signing out leaves nothing of the account; someone else signing in sees only theirs
    await a.signOut()
    await a.signIn(`sam_${tag}`, 'secret-password')
    const projects = await next<Project[]>((cb) => a.watchProjects(cb), (ps) => ps.length > 0)
    expect(projects.every((p) => p.ownerId === sam.me.id || p.right !== 'admin')).toBe(true)
    expect(projects.some((p) => p.title === `Garden ${tag}`)).toBe(false)
    await a.signOut()
    localStorage.clear()
    for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v)
  })

  it('fetches long columns, long comment threads, and archived projects’ tasks', async () => {
    const big = await alex.b.createProject({ title: `Big ${tag}`, description: '', color: '', identifier: '', parentId: null, archived: false, favorite: false, position: 0 })
    for (let i = 0; i < 56; i += 4) await Promise.all(Array.from({ length: 4 }, (_, j) => alex.b.createTask(big.id, { title: `Box ${i + j + 1}` })))
    await alex.b.loadBoard(big.id)
    const p = (await projectsOf(alex.b)).find((x) => x.id === big.id)!
    const mine = (await tasksOf(alex.b)).filter((t) => t.projectId === big.id)
    expect(mine).toHaveLength(56)
    expect(mine.every((t) => t.bucketId === p.buckets[0].id)).toBe(true)
    const t = mine[0]
    for (let i = 0; i < 52; i += 4) await Promise.all(Array.from({ length: 4 }, (_, j) => alex.b.addComment(t.id, `<p>c${i + j + 1}</p>`)))
    const comments = await next((cb: (c: { text: string }[]) => void) => alex.b.watchComments(t.id, cb), (c) => c.length >= 52)
    expect(comments).toHaveLength(52)
    await alex.b.updateProject(big.id, { archived: true })
    await alex.b.refresh()
    expect((await tasksOf(alex.b)).filter((x) => x.projectId === big.id)).toHaveLength(56)
    await alex.b.deleteProject(big.id)
  })

  it('stops Sam once Alex stops sharing', async () => {
    await alex.b.unshareUser(home.id, sam.me.id)
    await sam.b.refresh()
    expect((await projectsOf(sam.b)).some((p) => p.id === home.id)).toBe(false)
  })
})
