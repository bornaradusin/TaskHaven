// What the screens show and do: the signed-in person, their projects and tasks (kept up to date
// from the server), and every change they make. The server decides who may see and do what.

import { markRaw, reactive, watch } from 'vue'
import { BackendError, type Backend, type TaskFields, type Unsubscribe } from '@/data/backend'
import { parseQuickAdd } from '@/logic/quickadd'
import { suggestIdentifier } from '@/logic/tasks'
import {
  COLORS,
  DEFAULT_SETTINGS,
  displayName,
  rightAtLeast,
  type Bucket,
  type Label,
  type LabelRef,
  type LinkShare,
  type Notice,
  type Profile,
  type Project,
  type Relation,
  type RelationKind,
  type Right,
  type SavedFilter,
  type ServerInfo,
  type Settings,
  type Shares,
  type Task,
  type Team,
  type TeamRole,
} from '@/model'

export interface Toast {
  id: number
  text: string
  error: boolean
  undo?: () => void
}

export const store = reactive({
  backend: null as Backend | null,
  /** What the server says about itself (once asked). */
  server: null as ServerInfo | null,
  /** The sign-in state is known. */
  ready: false,
  user: null as Profile | null,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  projects: [] as Project[],
  /** By project id. */
  tasks: {} as Record<string, Task[]>,
  /** Projects whose tasks have arrived. */
  loaded: {} as Record<string, boolean>,
  labels: [] as Label[],
  teams: [] as Team[],
  filters: [] as SavedFilter[],
  notices: [] as Notice[],
  /** Everyone met so far (owners, assignees, team members …), by id. */
  people: {} as Record<string, Profile>,
  /** Whether the server could be reached the last time. */
  online: true,
  /** Fetching what changed (pull to refresh). */
  refreshing: false,
  toasts: [] as Toast[],
  /** The menu on a phone. */
  menuOpen: false,
})

const stops: Unsubscribe[] = []
let authStop: Unsubscribe | null = null

function backend(): Backend {
  if (!store.backend) throw new BackendError('auth', 'Not connected.')
  return store.backend
}

export function me(): string {
  if (!store.user) throw new BackendError('auth', 'Sign in first.')
  return store.user.id
}

// ---- messages ----

let toastId = 0

export function toast(text: string, options: { error?: boolean; undo?: () => void } = {}): void {
  const t: Toast = { id: ++toastId, text, error: !!options.error, undo: options.undo }
  store.toasts.push(t)
  setTimeout(() => dismiss(t.id), options.undo ? 6000 : options.error ? 6000 : 3000)
}

export function dismiss(id: number): void {
  const i = store.toasts.findIndex((t) => t.id === id)
  if (i >= 0) store.toasts.splice(i, 1)
}

/** Runs a change, telling the person if it fails. Returns its result, or undefined. */
export async function attempt<T>(work: () => Promise<T>, done?: string): Promise<T | undefined> {
  try {
    const result = await work()
    if (done) toast(done)
    return result
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Something went wrong.', { error: true })
    return undefined
  }
}

/** As attempt, for changes that give nothing back: whether it worked. */
export async function succeeded(work: () => Promise<unknown>, done?: string): Promise<boolean> {
  try {
    await work()
    if (done) toast(done)
    return true
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Something went wrong.', { error: true })
    return false
  }
}

// ---- connecting and signing in ----

export function connect(b: Backend): void {
  disconnect()
  store.backend = markRaw(b)
  store.ready = false
  void b
    .info()
    .then((info) => (store.server = info))
    .catch(() => undefined)
  authStop = b.onAuth((user) => {
    const changed = user?.id !== store.user?.id
    store.user = user
    if (user) store.people[user.id] = user
    if (changed) {
      stopWatching()
      if (user) startWatching()
    }
    store.ready = true
  })
}

export function disconnect(): void {
  authStop?.()
  authStop = null
  stopWatching()
  store.backend = null
  store.server = null
  store.user = null
  store.ready = false
}

function stopWatching(): void {
  for (const s of stops.splice(0)) s()
  store.settings = { ...DEFAULT_SETTINGS }
  store.projects = []
  store.tasks = {}
  store.loaded = {}
  store.labels = []
  store.teams = []
  store.filters = []
  store.notices = []
}

function startWatching(): void {
  const b = backend()
  let tasksArrived = false
  const markLoaded = () => {
    if (!tasksArrived) return
    for (const p of store.projects) store.loaded[p.id] = true
  }
  stops.push(b.watchSettings((s) => (store.settings = { ...DEFAULT_SETTINGS, ...s })))
  stops.push(b.watchPeople((people) => (store.people = { ...store.people, ...people })))
  stops.push(b.watchOnline((online) => (store.online = online)))
  stops.push(
    b.watchProjects((projects) => {
      store.projects = projects.sort((a, c) => a.position - c.position || a.title.localeCompare(c.title))
      markLoaded()
    }),
  )
  stops.push(
    b.watchTasks((tasks) => {
      const byProject: Record<string, Task[]> = {}
      for (const t of tasks) (byProject[t.projectId] ??= []).push(t)
      store.tasks = byProject
      tasksArrived = true
      markLoaded()
    }),
  )
  stops.push(b.watchLabels((labels) => (store.labels = labels.sort((a, c) => a.title.localeCompare(c.title)))))
  stops.push(b.watchTeams((teams) => (store.teams = teams.sort((a, c) => a.name.localeCompare(c.name)))))
  stops.push(b.watchFilters((filters) => (store.filters = filters.sort((a, c) => a.title.localeCompare(c.title)))))
  stops.push(b.watchNotices((notices) => (store.notices = notices)))
}

export const signIn = (username: string, password: string, totp?: string) => backend().signIn(username, password, totp)
export const signUp = (username: string, email: string, password: string) => backend().signUp(username, email, password)
export const resetPassword = (email: string) => backend().resetPassword(email)
export const changePassword = (oldPassword: string, newPassword: string) => backend().changePassword(oldPassword, newPassword)

export async function signOut(): Promise<void> {
  await backend().signOut()
}

/** Asks the server to delete the account: it emails a link to confirm. */
export async function requestDeletion(password: string): Promise<void> {
  await backend().requestDeletion(password)
}

export async function cancelDeletion(password: string): Promise<void> {
  await backend().cancelDeletion(password)
}

/** Fetches what changed now. */
export async function refresh(): Promise<void> {
  if (store.refreshing) return
  store.refreshing = true
  try {
    await backend().refresh()
  } finally {
    store.refreshing = false
  }
}

export async function updateProfile(patch: { name: string }): Promise<void> {
  await backend().updateProfile(patch)
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const before = { ...store.settings }
  Object.assign(store.settings, patch)
  try {
    await backend().saveSettings(patch)
  } catch (e) {
    store.settings = before
    throw e
  }
}

// ---- looking things up ----

export function project(id: string | null | undefined): Project | undefined {
  return id ? store.projects.find((p) => p.id === id) : undefined
}

export function allTasks(includeArchived = false): Task[] {
  return store.projects.filter((p) => includeArchived || !p.archived).flatMap((p) => store.tasks[p.id] ?? [])
}

/** A task by its id (in the given project, or anywhere). */
export function findTask(projectId: string | null, taskId: string): Task | undefined {
  return (projectId ? store.tasks[projectId]?.find((t) => t.id === taskId) : undefined) ?? Object.values(store.tasks).flat().find((t) => t.id === taskId)
}

export function person(id: string): Profile {
  return store.people[id] ?? { id, name: '', username: 'someone', email: '' }
}

export function personName(id: string): string {
  return displayName(person(id))
}

export function childProjects(parentId: string | null): Project[] {
  return store.projects.filter((p) => p.parentId === parentId || (parentId === null && p.parentId && !project(p.parentId)))
}

/** Whether one may change a project's tasks (archived projects can only be looked at). */
export function canEdit(p: Project | undefined): boolean {
  return !!p && !p.archived && rightAtLeast(p.right, 'write')
}

export function isFavorite(projectId: string): boolean {
  return !!project(projectId)?.favorite
}

/** Everyone who can see a project, as far as one knows: its owner, those it's shared with, its teams' members. */
export function projectPeople(p: Project, shares?: Shares | null): string[] {
  const ids = new Set<string>([p.ownerId])
  if (store.user) ids.add(store.user.id)
  for (const u of shares?.users ?? []) ids.add(u.userId)
  for (const t of shares?.teams ?? []) for (const m of t.memberIds) ids.add(m)
  // and whoever is already assigned to its tasks
  for (const t of store.tasks[p.id] ?? []) for (const a of t.assignees) ids.add(a)
  return [...ids].filter(Boolean)
}

// ---- projects ----

export async function createProject(fields: { title: string; parentId?: string | null; color?: string; identifier?: string; description?: string }): Promise<string> {
  const title = fields.title.trim()
  const wanted = (fields.identifier ?? suggestIdentifier(title)).trim()
  const make = (identifier: string) =>
    backend().createProject({
      title,
      description: fields.description ?? '',
      color: fields.color ?? COLORS[store.projects.length % COLORS.length],
      identifier,
      parentId: fields.parentId ?? null,
      archived: false,
      favorite: false,
      position: 0,
    })
  // identifiers are the server's: someone else's project may have this one, so the next free one
  for (const identifier of wanted ? [wanted, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${wanted.slice(0, 9)}${n}`), ''] : ['']) {
    try {
      const p = await make(identifier)
      if (identifier !== wanted) toast(identifier ? `“${wanted}” was taken on this server, so it’s “${identifier}”.` : `“${wanted}” was taken on this server, so it has no identifier.`)
      return p.id
    } catch (e) {
      if (!(e instanceof BackendError && e.code === 'exists' && identifier)) throw e
    }
  }
  throw new BackendError('exists', 'Couldn’t make the project. Try again.')
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'description' | 'color' | 'identifier' | 'parentId' | 'archived' | 'favorite' | 'position'>>): Promise<void> {
  await backend().updateProject(id, patch)
}

export async function deleteProject(id: string): Promise<void> {
  await backend().deleteProject(id)
  if (store.settings.recentProjects.includes(id)) {
    await saveSettings({ recentProjects: store.settings.recentProjects.filter((f) => f !== id) }).catch(() => undefined)
  }
}

/** Stops seeing a project shared with one (directly: one shared through a team stays while one's in it). */
export async function leaveProject(id: string): Promise<void> {
  await backend().unshareUser(id, me())
}

/** A copy with all its tasks (the server makes it). */
export async function duplicateProject(id: string): Promise<string> {
  return (await backend().duplicateProject(id)).id
}

export async function toggleFavorite(id: string): Promise<void> {
  const p = project(id)
  if (!p) return
  await updateProject(id, { favorite: !p.favorite })
}

export function isFavoriteTask(task: Task): boolean {
  return task.favorite
}

export async function toggleFavoriteTask(task: Task): Promise<void> {
  await updateTask(task, { favorite: !task.favorite })
}

export function visitProject(id: string): void {
  if (store.settings.recentProjects[0] === id) return
  const recentProjects = [id, ...store.settings.recentProjects.filter((r) => r !== id)].slice(0, 8)
  void saveSettings({ recentProjects }).catch(() => undefined)
}

// ---- the board and the list order ----

export const loadBoard = (p: Project) => backend().loadBoard(p.id)
export const loadOrder = (p: Project) => backend().loadOrder(p.id)

export async function addBucket(p: Project, title: string): Promise<void> {
  if (!title.trim()) throw new BackendError('invalid', 'Give the column a name.')
  await backend().createBucket(p.id, title.trim())
}

export async function updateBucket(p: Project, bucketId: string, patch: Partial<Pick<Bucket, 'title' | 'limit' | 'position'>>): Promise<void> {
  await backend().updateBucket(p.id, bucketId, patch)
}

export async function deleteBucket(p: Project, bucketId: string): Promise<void> {
  if (p.buckets.length <= 1) throw new BackendError('invalid', 'A board needs at least one column.')
  await backend().deleteBucket(p.id, bucketId)
}

export async function setDoneBucket(p: Project, bucketId: string | null): Promise<void> {
  await backend().setDoneBucket(p.id, bucketId)
}

export async function moveTaskToBucket(task: Task, bucketId: string, position: number): Promise<void> {
  // shown where it was dropped at once; the server's answer follows
  const before = { bucketId: task.bucketId, kanbanPosition: task.kanbanPosition }
  Object.assign(task, { bucketId, kanbanPosition: position })
  try {
    await backend().moveToBucket(task, bucketId, position)
  } catch (e) {
    Object.assign(task, before)
    throw e
  }
}

export async function setPosition(task: Task, position: number): Promise<void> {
  const before = task.position
  task.position = position
  try {
    await backend().setPosition(task, position)
  } catch (e) {
    task.position = before
    throw e
  }
}

// ---- tasks ----

/** Labels by name: one's own or those one can see, else made new. */
async function labelRefs(names: string[]): Promise<LabelRef[]> {
  const refs: LabelRef[] = []
  for (const name of names) {
    let label: LabelRef | undefined = knownLabels().find((l) => l.title.toLowerCase() === name.toLowerCase())
    if (!label) label = await createLabel(name, COLORS[(store.labels.length + 3) % COLORS.length])
    refs.push({ id: label.id, title: label.title, color: label.color })
  }
  return refs
}

/** People in a project by what was typed after @: their username, name or first name. */
function peopleNamed(p: Project, names: string[], shares: Shares | null): string[] {
  const out: string[] = []
  const candidates = projectPeople(p, shares)
  for (const raw of names) {
    const name = raw.toLowerCase()
    const found = candidates.find((id) => {
      const who = store.people[id]
      if (!who) return false
      return [who.username.toLowerCase(), who.name.toLowerCase(), who.name.toLowerCase().split(' ')[0]].includes(name)
    })
    if (found && !out.includes(found)) out.push(found)
  }
  return out
}

export function projectNamed(name: string): Project | undefined {
  const lower = name.toLowerCase()
  return (
    store.projects.find((p) => p.title.toLowerCase() === lower) ??
    store.projects.find((p) => p.identifier.toLowerCase() === lower) ??
    store.projects.find((p) => p.title.toLowerCase().startsWith(lower))
  )
}

/** Quick add: a line of text becomes a task (in +project, or the given one, or the default one). */
export async function quickAdd(text: string, projectId?: string | null, extra: Partial<TaskFields> = {}): Promise<Task | undefined> {
  const q = parseQuickAdd(text, new Date(), store.settings.weekStart)
  const named = q.project ? projectNamed(q.project) : undefined
  if (q.project && !named) throw new BackendError('not-found', `There's no project called “${q.project}”.`)
  const p = named ?? project(projectId) ?? project(store.settings.defaultProjectId) ?? store.projects.find((x) => canEdit(x))
  if (!p) throw new BackendError('not-found', 'Make a project first.')
  if (!canEdit(p)) throw new BackendError('permission-denied', `You can only look at “${p.title}”.`)
  // @people: whoever can see the project (who it's shared with is asked for then)
  const shares = q.assignees.length ? await getShares(p).catch(() => null) : null
  return createTask(p.id, {
    title: q.title,
    labels: await labelRefs(q.labels),
    assignees: peopleNamed(p, q.assignees, shares),
    priority: q.priority,
    dueDate: q.dueDate,
    repeat: q.repeat ?? { every: 0, mode: 'due' },
    ...extra,
  })
}

export async function createTask(projectId: string, fields: Partial<TaskFields>): Promise<Task> {
  return backend().createTask(projectId, fields)
}

/** Changes a task (the server tells those newly assigned). */
export async function updateTask(task: Task, patch: Partial<TaskFields>): Promise<Task> {
  return backend().updateTask(task, patch)
}

export async function setDone(task: Task, done: boolean): Promise<void> {
  const was = { done: task.done, doneAt: task.doneAt }
  // ticked at once; the server's answer follows (a repeating task comes back with its next dates)
  task.done = done
  let saved: Task
  try {
    saved = await updateTask({ ...task, ...was }, { done })
  } catch (e) {
    Object.assign(task, was)
    throw e
  }
  if (done && !saved.done) toast(`“${task.title}” is done; it’s back for next time.`)
  else if (done) toast(`“${task.title}” is done.`, { undo: () => void attempt(() => updateTask(saved, { done: false })) })
}

export async function deleteTask(task: Task): Promise<void> {
  await backend().deleteTask(task)
}

/** Moves a task to another project (it gets a number there). */
export async function moveTask(task: Task, projectId: string): Promise<Task | undefined> {
  const to = project(projectId)
  if (!to || to.id === task.projectId) return
  return updateTask(task, { projectId })
}

export const RELATION_NAMES: Record<RelationKind, string> = {
  subtask: 'Subtasks',
  parenttask: 'Parent tasks',
  related: 'Related tasks',
  blocking: 'Blocking',
  blocked: 'Blocked by',
  duplicateof: 'Duplicate of',
  duplicates: 'Duplicates',
  precedes: 'Precedes',
  follows: 'Follows',
}

export async function relate(task: Task, kind: RelationKind, other: Task): Promise<void> {
  if (other.id === task.id) throw new BackendError('invalid', 'A task can’t be related to itself.')
  if (task.relations.some((r) => r.kind === kind && r.taskId === other.id)) return
  await backend().addRelation(task, kind, other.id)
}

export async function unrelate(task: Task, relation: Relation): Promise<void> {
  await backend().removeRelation(task, relation.kind, relation.taskId)
}

// ---- comments and files ----

export const watchComments = (taskId: string, callback: Parameters<Backend['watchComments']>[1]) => backend().watchComments(taskId, callback)
export const addComment = (task: Task, text: string) => backend().addComment(task.id, text)
export const updateComment = (task: Task, id: string, text: string) => backend().updateComment(task.id, id, text)
export const deleteComment = (task: Task, id: string) => backend().deleteComment(task.id, id)

export const uploadAttachment = (task: Task, file: Blob, name: string) => backend().uploadAttachment(task, file, name)
export const deleteAttachment = (task: Task, id: string) => backend().deleteAttachment(task, id)
export const attachmentUrl = (task: Task, file: Task['attachments'][number]) => backend().attachmentUrl(task, file)

// ---- labels ----

export async function saveLabel(label: Pick<Label, 'id' | 'title' | 'color'> & { description?: string }): Promise<void> {
  if (!label.title.trim()) throw new BackendError('invalid', 'A label needs a name.')
  await backend().updateLabel(label.id, { title: label.title.trim(), color: label.color, ...(label.description !== undefined ? { description: label.description } : {}) })
}

export async function createLabel(title: string, color: string): Promise<Label> {
  const label = await backend().createLabel(title.trim(), color)
  // (the watcher may have brought it already)
  if (!store.labels.some((l) => l.id === label.id)) store.labels.push(label)
  return label
}

export async function deleteLabel(id: string): Promise<void> {
  await backend().deleteLabel(id)
}

/** Labels to choose from on a task: one's own, and those on tasks one can see. */
export function knownLabels(): LabelRef[] {
  const out = new Map<string, LabelRef>()
  for (const l of store.labels) out.set(l.id, { id: l.id, title: l.title, color: l.color })
  for (const t of allTasks(true)) for (const l of t.labels) if (!out.has(l.id)) out.set(l.id, l)
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** Whether one may change a label (only its maker may). */
export function ownsLabel(label: Pick<Label, 'createdBy'>): boolean {
  return label.createdBy === store.user?.id
}

// ---- sharing ----

export const getShares = (p: Project) => backend().getShares(p.id)
export const shareWithUser = (p: Project, username: string, right: Right) => backend().shareWithUser(p.id, username, right)
export const setUserRight = (p: Project, userId: string, right: Right) => backend().setUserRight(p.id, userId, right)
export const unshareUser = (p: Project, userId: string) => backend().unshareUser(p.id, userId)
export const shareWithTeam = (p: Project, teamId: string, right: Right) => backend().shareWithTeam(p.id, teamId, right)
export const setTeamRight = (p: Project, teamId: string, right: Right) => backend().setTeamRight(p.id, teamId, right)
export const unshareTeam = (p: Project, teamId: string) => backend().unshareTeam(p.id, teamId)
export const createLinkShare = (p: Project, right: Right, name: string, password: string) => backend().createLinkShare(p.id, right, name, password)
export const deleteLinkShare = (p: Project, id: string) => backend().deleteLinkShare(p.id, id)
export const linkShareUrl = (share: LinkShare) => backend().linkShareUrl(share)
export const findUser = (username: string) => backend().findUser(username)

// ---- teams ----

export async function createTeam(name: string, description = ''): Promise<string> {
  return backend().createTeam(name.trim(), description)
}

export async function updateTeam(team: Team, patch: { name: string; description: string }): Promise<void> {
  await backend().updateTeam(team.id, patch)
}

export async function addTeamMember(team: Team, username: string): Promise<void> {
  await backend().addTeamMember(team.id, username)
}

export async function setTeamRole(team: Team, uid: string, role: TeamRole): Promise<void> {
  await backend().setTeamAdmin(team.id, uid, role === 'admin')
}

export async function removeTeamMember(team: Team, uid: string): Promise<void> {
  await backend().removeTeamMember(team.id, uid)
}

export async function leaveTeam(team: Team): Promise<void> {
  await backend().removeTeamMember(team.id, me())
}

export async function deleteTeam(team: Team): Promise<void> {
  await backend().deleteTeam(team.id)
}

// ---- notices ----

export async function markRead(n: Notice, read = true): Promise<void> {
  n.read = read
  await backend().markRead(n.id, read)
}

export async function markAllRead(): Promise<void> {
  for (const n of store.notices) n.read = true
  await backend().markAllRead()
}

// ---- saved filters ----

export async function saveFilter(filter: Omit<SavedFilter, 'id'> & { id?: string }): Promise<string> {
  return backend().saveFilter(filter)
}

export async function deleteFilter(id: string): Promise<void> {
  await backend().deleteFilter(id)
}

// ---- the theme ----

watch(
  () => store.settings.theme,
  (theme) => {
    if (typeof document === 'undefined') return
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  },
  { immediate: true },
)
