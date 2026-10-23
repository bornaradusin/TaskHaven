// TaskHaven's data in memory, for the demo and the tests: several people in one place, behaving
// as a Vikunja server does (who may see and change what, done columns, repeating tasks, notices).

import { BackendError, Channel, type Backend, type ProjectFields, type TaskFields, type Unsubscribe } from './backend'
import { nextDates } from '@/logic/repeat'
import {
  DEFAULT_SETTINGS,
  RIGHTS,
  rightAtLeast,
  type Attachment,
  type Bucket,
  type Comment,
  type Label,
  type LabelRef,
  type LinkShare,
  type Notice,
  type Profile,
  type Project,
  type RelationKind,
  type Right,
  type SavedFilter,
  type ServerInfo,
  type Settings,
  type Shares,
  type Task,
  type Team,
} from '@/model'

interface Account {
  profile: Profile
  password: string
  settings: Settings
  notices: Notice[]
  deletionRequested: boolean
  /** Each person's own favourite projects and tasks (by id). */
  favorites: string[]
}

interface StoredProject extends Omit<Project, 'right'> {
  users: Record<string, Right>
  teams: Record<string, Right>
  links: LinkShare[]
  nextIndex: number
}

interface StoredAttachment extends Attachment {
  url: string
}

const INVERSE: Record<RelationKind, RelationKind> = {
  subtask: 'parenttask',
  parenttask: 'subtask',
  related: 'related',
  blocking: 'blocked',
  blocked: 'blocking',
  duplicateof: 'duplicates',
  duplicates: 'duplicateof',
  precedes: 'follows',
  follows: 'precedes',
}

/** Everyone's data: one World shared by several people's backends (as one server is). */
export class World {
  accounts = new Map<string, Account>()
  projects = new Map<string, StoredProject>()
  tasks = new Map<string, Task>()
  comments = new Map<string, Comment[]>()
  files = new Map<string, StoredAttachment[]>()
  labels = new Map<string, Label>()
  teams = new Map<string, Team>()
  filters = new Map<string, SavedFilter & { ownerId: string }>()
  registration = true
  private next = 100
  private listeners = new Set<() => void>()
  private pending = false
  /** The time, for tests that move it. */
  now: () => Date = () => new Date()

  id(): string {
    return String(++this.next)
  }

  listen(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Something changed: every watcher hears of it once, after the current work. */
  changed(): void {
    if (this.pending) return
    this.pending = true
    queueMicrotask(() => {
      this.pending = false
      for (const l of [...this.listeners]) l()
    })
  }
}

// (by JSON: what's kept is JSON, as on a server; the screens' reactive copies clone this way too)
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

function denied(what = 'do that'): never {
  throw new BackendError('permission-denied', `You aren’t allowed to ${what}.`)
}

export class MemoryBackend implements Backend {
  readonly kind = 'memory'
  readonly server = ''
  private me: string | null = null
  private auth = new Channel<Profile | null>()

  constructor(public world: World = new World()) {
    queueMicrotask(() => this.auth.set(this.me ? this.profileOf(this.me) : null))
  }

  private now(): string {
    return this.world.now().toISOString()
  }

  private async tick(): Promise<void> {
    await Promise.resolve()
  }

  private uid(): string {
    if (!this.me || !this.world.accounts.has(this.me)) throw new BackendError('auth', 'Sign in first.')
    return this.me
  }

  private account(): Account {
    return this.world.accounts.get(this.uid())!
  }

  private profileOf(id: string): Profile | null {
    const a = this.world.accounts.get(id)
    return a ? clone(a.profile) : null
  }

  /** A watcher: called now and whenever the world changes, with what select returns. */
  private watch<T>(select: () => T, callback: (value: T) => void): Unsubscribe {
    let last = ''
    const run = () => {
      let value: T
      try {
        value = select()
      } catch {
        return
      }
      const text = JSON.stringify(value)
      if (text === last) return
      last = text
      callback(clone(value))
    }
    queueMicrotask(run)
    return this.world.listen(run)
  }

  async info(): Promise<ServerInfo> {
    return { version: 'demo', registration: this.world.registration, localLogin: true, linkSharing: true, attachments: true, maxFileSize: '20MB', totp: false, deletion: true }
  }

  // ---- signing in ----

  onAuth(callback: (user: Profile | null) => void): Unsubscribe {
    return this.auth.listen(callback)
  }

  private byLogin(login: string): Account | undefined {
    const want = login.trim().toLowerCase()
    return [...this.world.accounts.values()].find((a) => a.profile.username.toLowerCase() === want || a.profile.email.toLowerCase() === want)
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.tick()
    const a = this.byLogin(username)
    if (!a || a.password !== password) throw new BackendError('auth', 'That username and password don’t match.')
    this.me = a.profile.id
    this.auth.set(clone(a.profile))
  }

  async signUp(username: string, email: string, password: string): Promise<void> {
    await this.tick()
    if (!this.world.registration) throw new BackendError('permission-denied', 'This server doesn’t take new accounts.')
    const name = username.trim()
    if (!name || /\s/.test(name)) throw new BackendError('invalid', 'A username can’t have spaces or look like a web address.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new BackendError('invalid', 'That doesn’t look like an email address.')
    if (password.length < 8) throw new BackendError('invalid', 'Use a password of at least 8 characters.')
    const all = [...this.world.accounts.values()]
    if (all.some((a) => a.profile.username.toLowerCase() === name.toLowerCase())) throw new BackendError('exists', 'That username is taken. Try another.')
    if (all.some((a) => a.profile.email.toLowerCase() === email.trim().toLowerCase())) throw new BackendError('exists', 'There’s already an account with that email.')
    const id = this.world.id()
    this.world.accounts.set(id, { profile: { id, name: '', username: name, email: email.trim() }, password, settings: { ...DEFAULT_SETTINGS }, notices: [], deletionRequested: false, favorites: [] })
    // a new account starts with an Inbox, as on Vikunja
    this.me = id
    const inbox = await this.createProject({ title: 'Inbox', description: '', color: '', identifier: '', parentId: null, archived: false, favorite: false, position: 0 })
    this.account().settings.defaultProjectId = inbox.id
    this.world.changed()
    this.auth.set(this.profileOf(id))
  }

  async signOut(): Promise<void> {
    this.me = null
    this.auth.set(null)
  }

  async resetPassword(): Promise<void> {
    await this.tick()
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.tick()
    const a = this.account()
    if (a.password !== oldPassword) throw new BackendError('auth', 'That username and password don’t match.')
    if (newPassword.length < 8) throw new BackendError('invalid', 'Use a password of at least 8 characters.')
    a.password = newPassword
  }

  async cancelDeletion(password: string): Promise<void> {
    await this.tick()
    if (this.account().password !== password) throw new BackendError('auth', 'That username and password don’t match.')
    this.account().deletionRequested = false
  }

  async requestDeletion(password: string): Promise<void> {
    await this.tick()
    if (this.account().password !== password) throw new BackendError('auth', 'That username and password don’t match.')
    this.account().deletionRequested = true
  }

  /** For the tests and the demo: be someone already in the world. */
  actAs(id: string | null): void {
    this.me = id
    this.auth.set(id ? this.profileOf(id) : null)
  }

  // ---- people ----

  async updateProfile(patch: { name: string }): Promise<void> {
    await this.tick()
    this.account().profile.name = patch.name.trim()
    this.world.changed()
    this.auth.set(this.profileOf(this.uid()))
  }

  watchPeople(callback: (people: Record<string, Profile>) => void): Unsubscribe {
    return this.watch(() => {
      const me = this.uid()
      const out: Record<string, Profile> = {}
      for (const a of this.world.accounts.values()) out[a.profile.id] = { ...a.profile, email: a.profile.id === me ? a.profile.email : '' }
      return out
    }, callback)
  }

  async findUser(username: string): Promise<Profile | null> {
    await this.tick()
    this.uid()
    const want = username.trim().replace(/^@/, '').toLowerCase()
    const a = [...this.world.accounts.values()].find((x) => x.profile.username.toLowerCase() === want)
    return a ? { ...clone(a.profile), email: '' } : null
  }

  watchSettings(callback: (settings: Settings) => void): Unsubscribe {
    return this.watch(() => this.account().settings, callback)
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    await this.tick()
    Object.assign(this.account().settings, clone(patch))
    this.world.changed()
  }

  async refresh(): Promise<void> {
    await this.tick()
  }

  watchOnline(callback: (online: boolean) => void): Unsubscribe {
    queueMicrotask(() => callback(true))
    return () => undefined
  }

  // ---- who may do what ----

  private rightIn(p: StoredProject, uid = this.uid()): Right | undefined {
    if (p.ownerId === uid) return 'admin'
    let best: Right | undefined = p.users[uid]
    for (const [tid, right] of Object.entries(p.teams)) {
      if (this.world.teams.get(tid)?.memberIds.includes(uid) && (!best || RIGHTS.indexOf(right) > RIGHTS.indexOf(best))) best = right
    }
    // sub-projects are shared as their parent is
    const parent = p.parentId ? this.world.projects.get(p.parentId) : undefined
    if (parent) {
      const up = this.rightIn(parent, uid)
      if (up && (!best || RIGHTS.indexOf(up) > RIGHTS.indexOf(best))) best = up
    }
    return best
  }

  private stored(id: string): StoredProject {
    const p = this.world.projects.get(id)
    if (!p) throw new BackendError('not-found', 'That project isn’t there any more.')
    return p
  }

  private visible(id: string): StoredProject {
    const p = this.stored(id)
    if (!this.rightIn(p)) throw new BackendError('not-found', 'That project isn’t there any more.')
    return p
  }

  private writable(id: string): StoredProject {
    const p = this.visible(id)
    if (p.archived) denied('change an archived project')
    if (!rightAtLeast(this.rightIn(p), 'write')) denied('change this project’s tasks')
    return p
  }

  private manageable(id: string): StoredProject {
    const p = this.visible(id)
    if (this.rightIn(p) !== 'admin') denied('change this project')
    return p
  }

  private projectOut(p: StoredProject): Project {
    const { users: _u, teams: _t, links: _l, nextIndex: _n, ...rest } = p
    void _u
    void _t
    void _l
    void _n
    return { ...clone(rest), favorite: this.account().favorites.includes(`p${p.id}`), right: this.rightIn(p)! }
  }

  // ---- projects ----

  watchProjects(callback: (projects: Project[]) => void): Unsubscribe {
    return this.watch(
      () =>
        [...this.world.projects.values()]
          .filter((p) => this.rightIn(p))
          .map((p) => this.projectOut(p))
          .sort((a, b) => a.position - b.position),
      callback,
    )
  }

  async createProject(fields: ProjectFields): Promise<Project> {
    await this.tick()
    const uid = this.uid()
    if (!fields.title.trim()) throw new BackendError('invalid', 'Give the project a title.')
    if (fields.parentId) this.manageable(fields.parentId)
    this.checkIdentifier(fields.identifier, null)
    const id = this.world.id()
    const now = this.now()
    const bucket = (title: string): Bucket => ({ id: this.world.id(), title, limit: 0, position: 0 })
    const buckets = [bucket('To-Do'), bucket('Doing'), bucket('Done')].map((b, i) => ({ ...b, position: (i + 1) * 100 }))
    const p: StoredProject = {
      id,
      title: fields.title.trim(),
      description: fields.description,
      color: fields.color,
      identifier: fields.identifier,
      parentId: fields.parentId,
      archived: false,
      favorite: false,
      ownerId: uid,
      position: fields.position || Date.now(),
      views: { list: `${id}-list`, gantt: `${id}-gantt`, table: `${id}-table`, kanban: `${id}-kanban` },
      buckets,
      doneBucketId: buckets[2].id,
      created: now,
      updated: now,
      users: {},
      teams: {},
      links: [],
      nextIndex: 1,
    }
    this.world.projects.set(id, p)
    this.world.changed()
    return this.projectOut(p)
  }

  /** Identifiers are the server's: no two projects on it have the same one. */
  private checkIdentifier(identifier: string, except: string | null): void {
    const want = identifier.trim().toLowerCase()
    if (!want) return
    if ([...this.world.projects.values()].some((p) => p.id !== except && p.identifier.toLowerCase() === want)) {
      throw new BackendError('exists', 'Another project on this server already uses that identifier. Pick another, or leave it empty.')
    }
  }

  private setFavorite(key: string, on: boolean): void {
    const a = this.account()
    a.favorites = on ? [...new Set([...a.favorites, key])] : a.favorites.filter((f) => f !== key)
  }

  async updateProject(id: string, patch: Partial<ProjectFields>): Promise<void> {
    await this.tick()
    // as on the server: changing a project takes "can edit" (a favourite too, though it's one's own)
    const p = this.visible(id)
    if (!rightAtLeast(this.rightIn(p), 'write')) denied('change this project')
    if (patch.parentId && this.world.projects.get(patch.parentId) && this.rightIn(this.stored(patch.parentId)) !== 'admin') denied('move it there')
    if (patch.title !== undefined && !patch.title.trim()) throw new BackendError('invalid', 'Give the project a title.')
    if (patch.parentId && patch.parentId === id) throw new BackendError('invalid', 'A project can’t be inside itself.')
    if (patch.identifier !== undefined) this.checkIdentifier(patch.identifier, id)
    if (patch.favorite !== undefined) this.setFavorite(`p${id}`, patch.favorite)
    patch = { ...patch }
    delete patch.favorite
    Object.assign(p, clone(patch), { updated: this.now() })
    this.world.changed()
  }

  async deleteProject(id: string): Promise<void> {
    await this.tick()
    this.manageable(id)
    const gone = new Set([id, ...[...this.world.projects.values()].filter((p) => p.parentId === id).map((p) => p.id)])
    for (const pid of gone) this.world.projects.delete(pid)
    for (const [tid, t] of this.world.tasks) if (gone.has(t.projectId)) this.world.tasks.delete(tid)
    this.world.changed()
  }

  async duplicateProject(id: string): Promise<Project> {
    await this.tick()
    const p = this.visible(id)
    const copy = await this.createProject({ title: `${p.title} - duplicate`, description: p.description, color: p.color, identifier: p.identifier, parentId: p.parentId, archived: false, favorite: false, position: p.position + 1 })
    for (const t of [...this.world.tasks.values()].filter((x) => x.projectId === id)) {
      const { id: _id, index: _i, ...rest } = clone(t)
      void _id
      void _i
      await this.createTask(copy.id, { ...rest, assignees: [] })
    }
    return copy
  }

  // ---- the board ----

  async loadBoard(projectId: string): Promise<void> {
    await this.tick()
    this.visible(projectId)
  }

  async loadOrder(projectId: string): Promise<void> {
    await this.tick()
    this.visible(projectId)
  }

  async createBucket(projectId: string, title: string): Promise<void> {
    await this.tick()
    const p = this.writable(projectId)
    p.buckets.push({ id: this.world.id(), title: title.trim(), limit: 0, position: Math.max(0, ...p.buckets.map((b) => b.position)) + 100 })
    this.world.changed()
  }

  async updateBucket(projectId: string, bucketId: string, patch: Partial<Pick<Bucket, 'title' | 'limit' | 'position'>>): Promise<void> {
    await this.tick()
    const p = this.writable(projectId)
    const b = p.buckets.find((x) => x.id === bucketId)
    if (!b) throw new BackendError('not-found', 'That column isn’t there any more.')
    Object.assign(b, patch)
    p.buckets.sort((a, c) => a.position - c.position)
    this.world.changed()
  }

  async deleteBucket(projectId: string, bucketId: string): Promise<void> {
    await this.tick()
    const p = this.writable(projectId)
    if (p.buckets.length <= 1) throw new BackendError('invalid', 'A board needs at least one column.')
    p.buckets = p.buckets.filter((b) => b.id !== bucketId)
    if (p.doneBucketId === bucketId) p.doneBucketId = null
    const into = p.buckets[0].id
    for (const t of this.world.tasks.values()) if (t.projectId === projectId && t.bucketId === bucketId) t.bucketId = into
    this.world.changed()
  }

  async setDoneBucket(projectId: string, bucketId: string | null): Promise<void> {
    await this.tick()
    const p = this.writable(projectId)
    p.doneBucketId = bucketId
    this.world.changed()
  }

  async moveToBucket(task: Task, bucketId: string, position: number): Promise<void> {
    await this.tick()
    const p = this.writable(task.projectId)
    const t = this.taskIn(task.id)
    const bucket = p.buckets.find((b) => b.id === bucketId)
    if (!bucket) throw new BackendError('not-found', 'That column isn’t there any more.')
    const inIt = [...this.world.tasks.values()].filter((x) => x.projectId === p.id && x.bucketId === bucketId && x.id !== t.id).length
    if (bucket.limit && inIt >= bucket.limit) throw new BackendError('invalid', `“${bucket.title}” is full (${bucket.limit} at most).`)
    t.bucketId = bucketId
    t.kanbanPosition = position
    if (bucketId === p.doneBucketId && !t.done) this.markDone(t, p, true)
    else if (bucketId !== p.doneBucketId && t.done) this.markDone(t, p, false)
    t.updated = this.now()
    this.world.changed()
  }

  async setPosition(task: Task, position: number): Promise<void> {
    await this.tick()
    this.writable(task.projectId)
    this.taskIn(task.id).position = position
    this.world.changed()
  }

  // ---- tasks ----

  private taskIn(id: string): Task {
    const t = this.world.tasks.get(id)
    if (!t || !this.rightIn(this.stored(t.projectId))) throw new BackendError('not-found', 'That task isn’t there any more.')
    return t
  }

  watchTasks(callback: (tasks: Task[]) => void): Unsubscribe {
    return this.watch(
      () =>
        [...this.world.tasks.values()]
          .filter((t) => {
            const p = this.world.projects.get(t.projectId)
            return p && this.rightIn(p)
          })
          .map((t) => this.withRelations(t)),
      callback,
    )
  }

  /** A task as one sees it: its relations' titles and done as they are now. */
  private withRelations(t: Task): Task {
    return {
      ...t,
      favorite: this.account().favorites.includes(`t${t.id}`),
      relations: t.relations.map((r) => {
        const other = this.world.tasks.get(r.taskId)
        return other ? { ...r, title: other.title, done: other.done, projectId: other.projectId } : r
      }),
      attachments: (this.world.files.get(t.id) ?? []).map(({ url: _u, ...a }) => (void _u, a)),
    }
  }

  /** Done (and a repeating one back with its next dates), or not done; and into its column. */
  private markDone(t: Task, p: StoredProject, done: boolean): void {
    if (done) {
      const next = nextDates(t, this.world.now())
      if (next) {
        Object.assign(t, next, { done: false, doneAt: null })
        if (t.bucketId === p.doneBucketId) t.bucketId = p.buckets.find((b) => b.id !== p.doneBucketId)?.id ?? null
        return
      }
      t.done = true
      t.doneAt = this.now()
      if (p.doneBucketId) t.bucketId = p.doneBucketId
    } else {
      t.done = false
      t.doneAt = null
      if (t.bucketId && t.bucketId === p.doneBucketId) t.bucketId = p.buckets.find((b) => b.id !== p.doneBucketId)?.id ?? null
    }
  }

  private checkTask(t: Partial<TaskFields>): void {
    if (t.title !== undefined && (!t.title.trim() || t.title.length > 250)) throw new BackendError('invalid', 'A task needs a title (up to 250 letters).')
  }

  private notify(to: string, notice: Omit<Notice, 'id' | 'created' | 'read' | 'fromId'>): void {
    const a = this.world.accounts.get(to)
    if (!a || to === this.me) return
    a.notices.unshift({ ...notice, id: this.world.id(), fromId: this.uid(), created: this.now(), read: false })
  }

  private canSee(uid: string, projectId: string): boolean {
    const p = this.world.projects.get(projectId)
    return !!p && !!this.rightIn(p, uid)
  }

  async createTask(projectId: string, fields: Partial<TaskFields>): Promise<Task> {
    await this.tick()
    const p = this.writable(projectId)
    this.checkTask({ title: fields.title ?? '' })
    const now = this.now()
    const id = this.world.id()
    const t: Task = {
      id,
      projectId,
      index: p.nextIndex++,
      title: (fields.title ?? '').trim(),
      description: fields.description ?? '',
      done: false,
      doneAt: null,
      dueDate: fields.dueDate ?? null,
      startDate: fields.startDate ?? null,
      endDate: fields.endDate ?? null,
      priority: fields.priority ?? 0,
      percentDone: fields.percentDone ?? 0,
      color: fields.color ?? '',
      labels: clone(fields.labels ?? []),
      assignees: [],
      reminders: clone(fields.reminders ?? []),
      repeat: clone(fields.repeat ?? { every: 0, mode: 'due' }),
      relations: [],
      attachments: [],
      favorite: false,
      bucketId: p.buckets.find((b) => b.id !== p.doneBucketId)?.id ?? null,
      position: Date.parse(now) + Number(id),
      kanbanPosition: Date.parse(now) + Number(id),
      createdBy: this.uid(),
      created: now,
      updated: now,
    }
    this.world.tasks.set(id, t)
    if (fields.assignees?.length) await this.assign(t, fields.assignees)
    if (fields.done) this.markDone(t, p, true)
    this.world.changed()
    return this.withRelations(clone(t))
  }

  private async assign(t: Task, ids: string[]): Promise<void> {
    for (const a of ids) if (!this.canSee(a, t.projectId)) throw new BackendError('invalid', 'Only people who can see the project can be assigned.')
    const before = new Set(t.assignees)
    t.assignees = [...new Set(ids)]
    for (const a of t.assignees) if (!before.has(a)) this.notify(a, { kind: 'assigned', projectId: t.projectId, taskId: t.id, title: t.title, text: '' })
  }

  async updateTask(task: Task, patch: Partial<TaskFields>): Promise<Task> {
    await this.tick()
    const t = this.taskIn(task.id)
    const p = this.writable(t.projectId)
    this.checkTask(patch)
    const { done, assignees, projectId, favorite, ...rest } = clone(patch)
    if (favorite !== undefined) this.setFavorite(`t${t.id}`, favorite)
    if (projectId && projectId !== t.projectId) {
      const to = this.writable(projectId)
      t.projectId = projectId
      t.index = to.nextIndex++
      t.bucketId = to.buckets.find((b) => b.id !== to.doneBucketId)?.id ?? null
      t.assignees = t.assignees.filter((a) => this.canSee(a, projectId))
    }
    Object.assign(t, rest, { updated: this.now() })
    if (assignees) await this.assign(t, assignees)
    if (done !== undefined && done !== t.done) {
      this.markDone(t, this.world.projects.get(t.projectId) ?? p, done)
    }
    this.world.changed()
    return this.withRelations(clone(t))
  }

  async deleteTask(task: Task): Promise<void> {
    await this.tick()
    const t = this.taskIn(task.id)
    this.writable(t.projectId)
    this.world.tasks.delete(t.id)
    this.world.comments.delete(t.id)
    this.world.files.delete(t.id)
    for (const other of this.world.tasks.values()) other.relations = other.relations.filter((r) => r.taskId !== t.id)
    this.world.changed()
  }

  async addRelation(task: Task, kind: RelationKind, otherId: string): Promise<void> {
    await this.tick()
    const t = this.taskIn(task.id)
    this.writable(t.projectId)
    const other = this.taskIn(otherId)
    if (other.id === t.id) throw new BackendError('invalid', 'A task can’t be related to itself.')
    const add = (a: Task, k: RelationKind, b: Task) => {
      if (!a.relations.some((r) => r.kind === k && r.taskId === b.id)) a.relations.push({ kind: k, taskId: b.id, projectId: b.projectId, title: b.title, done: b.done })
    }
    add(t, kind, other)
    add(other, INVERSE[kind], t)
    this.world.changed()
  }

  async removeRelation(task: Task, kind: RelationKind, otherId: string): Promise<void> {
    await this.tick()
    const t = this.taskIn(task.id)
    this.writable(t.projectId)
    t.relations = t.relations.filter((r) => !(r.kind === kind && r.taskId === otherId))
    const other = this.world.tasks.get(otherId)
    if (other) other.relations = other.relations.filter((r) => !(r.kind === INVERSE[kind] && r.taskId === t.id))
    this.world.changed()
  }

  // ---- comments ----

  watchComments(taskId: string, callback: (comments: Comment[]) => void): Unsubscribe {
    return this.watch(() => {
      this.taskIn(taskId)
      return [...(this.world.comments.get(taskId) ?? [])].sort((a, b) => a.created.localeCompare(b.created))
    }, callback)
  }

  async addComment(taskId: string, text: string): Promise<void> {
    await this.tick()
    const t = this.taskIn(taskId)
    this.writable(t.projectId)
    if (!text.trim()) throw new BackendError('invalid', 'Write something first.')
    const now = this.now()
    const list = this.world.comments.get(taskId) ?? []
    list.push({ id: this.world.id(), taskId, authorId: this.uid(), text, created: now, updated: now })
    this.world.comments.set(taskId, list)
    const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    for (const uid of new Set([...t.assignees, t.createdBy])) this.notify(uid, { kind: 'comment', projectId: t.projectId, taskId, title: t.title, text: plain })
    this.world.changed()
  }

  private ownComment(taskId: string, id: string): Comment {
    this.taskIn(taskId)
    const c = this.world.comments.get(taskId)?.find((x) => x.id === id)
    if (!c) throw new BackendError('not-found', 'That comment isn’t there any more.')
    if (c.authorId !== this.uid()) denied('change someone else’s comment')
    return c
  }

  async updateComment(taskId: string, id: string, text: string): Promise<void> {
    await this.tick()
    const c = this.ownComment(taskId, id)
    c.text = text
    c.updated = this.now()
    this.world.changed()
  }

  async deleteComment(taskId: string, id: string): Promise<void> {
    await this.tick()
    this.ownComment(taskId, id)
    this.world.comments.set(taskId, (this.world.comments.get(taskId) ?? []).filter((c) => c.id !== id))
    this.world.changed()
  }

  // ---- attachments ----

  async uploadAttachment(task: Task, file: Blob, name: string): Promise<void> {
    await this.tick()
    const t = this.taskIn(task.id)
    this.writable(t.projectId)
    if (file.size > 20 * 1024 * 1024) throw new BackendError('invalid', 'That file is too big (20 MB at most).')
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
    const list = this.world.files.get(t.id) ?? []
    list.push({ id: this.world.id(), name, type: file.type || 'application/octet-stream', size: file.size, createdBy: this.uid(), created: this.now(), url })
    this.world.files.set(t.id, list)
    this.world.changed()
  }

  async deleteAttachment(task: Task, id: string): Promise<void> {
    await this.tick()
    const t = this.taskIn(task.id)
    this.writable(t.projectId)
    this.world.files.set(t.id, (this.world.files.get(t.id) ?? []).filter((f) => f.id !== id))
    this.world.changed()
  }

  async attachmentUrl(task: Task, file: Attachment): Promise<string> {
    await this.tick()
    this.taskIn(task.id)
    const f = this.world.files.get(task.id)?.find((x) => x.id === file.id)
    if (!f) throw new BackendError('not-found', 'That file isn’t there any more.')
    return f.url
  }

  // ---- labels ----

  watchLabels(callback: (labels: Label[]) => void): Unsubscribe {
    return this.watch(() => {
      const uid = this.uid()
      const onTasks = new Set<string>()
      for (const t of this.world.tasks.values()) if (this.canSee(uid, t.projectId)) for (const l of t.labels) onTasks.add(l.id)
      return [...this.world.labels.values()].filter((l) => l.createdBy === uid || onTasks.has(l.id)).sort((a, b) => a.title.localeCompare(b.title))
    }, callback)
  }

  async createLabel(title: string, color: string): Promise<Label> {
    await this.tick()
    if (!title.trim()) throw new BackendError('invalid', 'A label needs a name.')
    const l: Label = { id: this.world.id(), title: title.trim(), color, description: '', createdBy: this.uid() }
    this.world.labels.set(l.id, l)
    this.world.changed()
    return clone(l)
  }

  private ownLabel(id: string): Label {
    const l = this.world.labels.get(id)
    if (!l) throw new BackendError('not-found', 'That label isn’t there any more.')
    if (l.createdBy !== this.uid()) denied('change someone else’s label')
    return l
  }

  async updateLabel(id: string, patch: Partial<Pick<Label, 'title' | 'color' | 'description'>>): Promise<void> {
    await this.tick()
    const l = this.ownLabel(id)
    Object.assign(l, patch)
    for (const t of this.world.tasks.values()) t.labels = t.labels.map((x): LabelRef => (x.id === id ? { id, title: l.title, color: l.color } : x))
    this.world.changed()
  }

  async deleteLabel(id: string): Promise<void> {
    await this.tick()
    this.ownLabel(id)
    this.world.labels.delete(id)
    for (const t of this.world.tasks.values()) t.labels = t.labels.filter((x) => x.id !== id)
    this.world.changed()
  }

  // ---- teams ----

  private team(id: string): Team {
    const t = this.world.teams.get(id)
    if (!t || !t.memberIds.includes(this.uid())) throw new BackendError('not-found', 'That team isn’t there any more.')
    return t
  }

  private adminOf(id: string): Team {
    const t = this.team(id)
    if (t.members[this.uid()] !== 'admin') denied('change this team')
    return t
  }

  watchTeams(callback: (teams: Team[]) => void): Unsubscribe {
    return this.watch(() => [...this.world.teams.values()].filter((t) => t.memberIds.includes(this.uid())).sort((a, b) => a.name.localeCompare(b.name)), callback)
  }

  async createTeam(name: string, description: string): Promise<string> {
    await this.tick()
    const uid = this.uid()
    if (!name.trim()) throw new BackendError('invalid', 'Give the team a name.')
    const id = this.world.id()
    this.world.teams.set(id, { id, name: name.trim(), description, ownerId: uid, members: { [uid]: 'admin' }, memberIds: [uid], created: this.now() })
    this.world.changed()
    return id
  }

  async updateTeam(id: string, patch: { name: string; description: string }): Promise<void> {
    await this.tick()
    const t = this.adminOf(id)
    if (!patch.name.trim()) throw new BackendError('invalid', 'Give the team a name.')
    t.name = patch.name.trim()
    t.description = patch.description
    this.world.changed()
  }

  async deleteTeam(id: string): Promise<void> {
    await this.tick()
    this.adminOf(id)
    this.world.teams.delete(id)
    for (const p of this.world.projects.values()) delete p.teams[id]
    this.world.changed()
  }

  async addTeamMember(teamId: string, username: string): Promise<void> {
    await this.tick()
    const t = this.adminOf(teamId)
    const who = await this.findUser(username)
    if (!who) throw new BackendError('not-found', 'There’s nobody with that username on this server.')
    if (t.memberIds.includes(who.id)) throw new BackendError('exists', `${who.username} is in the team already.`)
    t.members[who.id] = 'member'
    t.memberIds.push(who.id)
    this.notify(who.id, { kind: 'shared', projectId: '', taskId: null, title: t.name, text: `team:${t.name}` })
    this.world.changed()
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.tick()
    const t = userId === this.uid() ? this.team(teamId) : this.adminOf(teamId)
    if (t.memberIds.length === 1) throw new BackendError('invalid', 'A team needs someone in it: delete it instead.')
    delete t.members[userId]
    t.memberIds = t.memberIds.filter((m) => m !== userId)
    if (!Object.values(t.members).includes('admin')) t.members[t.memberIds[0]] = 'admin'
    this.world.changed()
  }

  async setTeamAdmin(teamId: string, userId: string, admin: boolean): Promise<void> {
    await this.tick()
    const t = this.adminOf(teamId)
    t.members[userId] = admin ? 'admin' : 'member'
    this.world.changed()
  }

  // ---- sharing ----

  async getShares(projectId: string): Promise<Shares> {
    await this.tick()
    const p = this.visible(projectId)
    return clone({
      users: Object.entries(p.users).map(([userId, right]) => ({ userId, right })),
      teams: Object.entries(p.teams).map(([teamId, right]) => ({ teamId, name: this.world.teams.get(teamId)?.name ?? 'A team', right, memberIds: this.world.teams.get(teamId)?.memberIds ?? [] })),
      links: this.rightIn(p) === 'admin' ? p.links : [],
    })
  }

  async shareWithUser(projectId: string, username: string, right: Right): Promise<void> {
    await this.tick()
    const p = this.manageable(projectId)
    const who = await this.findUser(username)
    if (!who) throw new BackendError('not-found', 'There’s nobody with that username on this server.')
    if (who.id === p.ownerId || who.id in p.users) throw new BackendError('exists', `${who.username} can see this project already.`)
    p.users[who.id] = right
    this.world.changed()
  }

  async setUserRight(projectId: string, userId: string, right: Right): Promise<void> {
    await this.tick()
    this.manageable(projectId).users[userId] = right
    this.world.changed()
  }

  async unshareUser(projectId: string, userId: string): Promise<void> {
    await this.tick()
    // only a project's admins take people off it, oneself included (as on the server)
    const p = this.visible(projectId)
    if (this.rightIn(p) !== 'admin') {
      if (userId === this.uid()) denied('take yourself off it: ask whoever shared it with you')
      denied('change this project')
    }
    delete p.users[userId]
    this.world.changed()
  }

  async shareWithTeam(projectId: string, teamId: string, right: Right): Promise<void> {
    await this.tick()
    const p = this.manageable(projectId)
    this.team(teamId)
    if (teamId in p.teams) throw new BackendError('exists', 'The team can see this project already.')
    p.teams[teamId] = right
    this.world.changed()
  }

  async setTeamRight(projectId: string, teamId: string, right: Right): Promise<void> {
    await this.tick()
    this.manageable(projectId).teams[teamId] = right
    this.world.changed()
  }

  async unshareTeam(projectId: string, teamId: string): Promise<void> {
    await this.tick()
    delete this.manageable(projectId).teams[teamId]
    this.world.changed()
  }

  async createLinkShare(projectId: string, right: Right, name: string, password: string): Promise<LinkShare> {
    await this.tick()
    const p = this.manageable(projectId)
    const hash = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40)
    const share: LinkShare = { id: this.world.id(), hash, name: name.trim(), right, hasPassword: !!password, sharedBy: this.uid(), created: this.now() }
    p.links.push(share)
    this.world.changed()
    return clone(share)
  }

  async deleteLinkShare(projectId: string, id: string): Promise<void> {
    await this.tick()
    const p = this.manageable(projectId)
    p.links = p.links.filter((l) => l.id !== id)
    this.world.changed()
  }

  linkShareUrl(share: LinkShare): string {
    return `https://demo.taskhaven.example/share/${share.hash}/auth`
  }

  // ---- saved filters ----

  watchFilters(callback: (filters: SavedFilter[]) => void): Unsubscribe {
    return this.watch(
      () =>
        [...this.world.filters.values()]
          .filter((f) => f.ownerId === this.uid())
          .map(({ ownerId: _o, ...f }) => (void _o, f)),
      callback,
    )
  }

  async saveFilter(filter: Omit<SavedFilter, 'id'> & { id?: string }): Promise<string> {
    await this.tick()
    const uid = this.uid()
    if (!filter.title.trim()) throw new BackendError('invalid', 'Give the filter a name.')
    if (filter.id && this.world.filters.get(filter.id)?.ownerId !== uid) denied('change this filter')
    const id = filter.id ?? this.world.id()
    this.world.filters.set(id, { id, title: filter.title.trim(), description: filter.description, query: filter.query, ownerId: uid })
    this.world.changed()
    return id
  }

  async deleteFilter(id: string): Promise<void> {
    await this.tick()
    if (this.world.filters.get(id)?.ownerId !== this.uid()) denied('delete this filter')
    this.world.filters.delete(id)
    this.world.changed()
  }

  // ---- notices ----

  watchNotices(callback: (notices: Notice[]) => void): Unsubscribe {
    return this.watch(() => this.account().notices, callback)
  }

  async markRead(id: string, read: boolean): Promise<void> {
    await this.tick()
    const n = this.account().notices.find((x) => x.id === id)
    if (n) n.read = read
    this.world.changed()
  }

  async markAllRead(): Promise<void> {
    await this.tick()
    for (const n of this.account().notices) n.read = true
    this.world.changed()
  }
}
