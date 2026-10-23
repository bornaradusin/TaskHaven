// Where TaskHaven's data comes from: a Vikunja server (data/vikunja.ts), or memory for the demo
// and the tests (data/memory.ts), which behaves as a Vikunja server does. The server decides
// who may see and change what: a project is seen by its owner and those it's shared with.

import type {
  Attachment,
  Bucket,
  Comment,
  Label,
  LinkShare,
  Notice,
  Profile,
  Project,
  RelationKind,
  Right,
  SavedFilter,
  ServerInfo,
  Settings,
  Shares,
  Task,
  Team,
} from '@/model'

export type Unsubscribe = () => void

/** Why something was refused, in words for the person. */
export class BackendError extends Error {
  constructor(
    public code: 'permission-denied' | 'not-found' | 'invalid' | 'auth' | 'network' | 'exists' | 'totp',
    message: string,
  ) {
    super(message)
  }
}

/** What a new project or a change to one can say. */
export type ProjectFields = Pick<Project, 'title' | 'description' | 'color' | 'identifier' | 'parentId' | 'archived' | 'favorite' | 'position'>

/** What a new task or a change to one can say (labels and people included). */
export type TaskFields = Omit<Task, 'id' | 'index' | 'relations' | 'attachments' | 'createdBy' | 'created' | 'updated' | 'doneAt' | 'bucketId' | 'kanbanPosition'>

export interface Backend {
  /** 'vikunja' or 'memory' (the demo). */
  readonly kind: 'vikunja' | 'memory'
  /** The server's address ('' for the demo). */
  readonly server: string

  info(): Promise<ServerInfo>

  // ---- signing in ----
  onAuth(callback: (user: Profile | null) => void): Unsubscribe
  signIn(username: string, password: string, totp?: string): Promise<void>
  signUp(username: string, email: string, password: string): Promise<void>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  /** A new password (signed in): the old one first. One stays signed in on this phone. */
  changePassword(oldPassword: string, newPassword: string): Promise<void>
  /** Asks the server to delete the account (it emails a link to confirm). */
  requestDeletion(password: string): Promise<void>
  /** Keeps the account after all (once a deletion is confirmed, until the day). */
  cancelDeletion(password: string): Promise<void>

  // ---- people ----
  updateProfile(patch: { name: string }): Promise<void>
  /** Everyone met so far (owners, assignees, commenters, team members …), by id. */
  watchPeople(callback: (people: Record<string, Profile>) => void): Unsubscribe
  /** Someone on the server by their exact username (to share with), or null. */
  findUser(username: string): Promise<Profile | null>
  watchSettings(callback: (settings: Settings) => void): Unsubscribe
  saveSettings(patch: Partial<Settings>): Promise<void>

  // ---- keeping up to date ----
  /** Fetches what changed now (it also does so by itself every so often). */
  refresh(): Promise<void>
  /** Whether the server could be reached the last time. */
  watchOnline(callback: (online: boolean) => void): Unsubscribe

  // ---- projects ----
  watchProjects(callback: (projects: Project[]) => void): Unsubscribe
  createProject(fields: ProjectFields): Promise<Project>
  updateProject(id: string, patch: Partial<ProjectFields>): Promise<void>
  /** With its tasks. */
  deleteProject(id: string): Promise<void>
  duplicateProject(id: string): Promise<Project>

  // ---- the board ----
  /** Fetches a project's kanban columns and which tasks are in which. */
  loadBoard(projectId: string): Promise<void>
  /** Fetches a project's list order. */
  loadOrder(projectId: string): Promise<void>
  createBucket(projectId: string, title: string): Promise<void>
  updateBucket(projectId: string, bucketId: string, patch: Partial<Pick<Bucket, 'title' | 'limit' | 'position'>>): Promise<void>
  deleteBucket(projectId: string, bucketId: string): Promise<void>
  /** Which column marks tasks done (null: none). */
  setDoneBucket(projectId: string, bucketId: string | null): Promise<void>
  /** Drops a task into a column at a position (into the done one: it's done). */
  moveToBucket(task: Task, bucketId: string, position: number): Promise<void>
  /** Puts a task at a position in the list. */
  setPosition(task: Task, position: number): Promise<void>

  // ---- tasks ----
  /** Every task one can see (in every project). */
  watchTasks(callback: (tasks: Task[]) => void): Unsubscribe
  createTask(projectId: string, fields: Partial<TaskFields>): Promise<Task>
  /**
   * Changes a task; the saved task back. Marked done, a repeating one comes back with its next
   * dates (the server does that). A new projectId moves it to that project.
   */
  updateTask(task: Task, patch: Partial<TaskFields>): Promise<Task>
  deleteTask(task: Task): Promise<void>
  addRelation(task: Task, kind: RelationKind, otherId: string): Promise<void>
  removeRelation(task: Task, kind: RelationKind, otherId: string): Promise<void>

  // ---- a task's comments ----
  watchComments(taskId: string, callback: (comments: Comment[]) => void): Unsubscribe
  addComment(taskId: string, text: string): Promise<void>
  updateComment(taskId: string, id: string, text: string): Promise<void>
  deleteComment(taskId: string, id: string): Promise<void>

  // ---- a task's files ----
  uploadAttachment(task: Task, file: Blob, name: string): Promise<void>
  deleteAttachment(task: Task, id: string): Promise<void>
  /** A file's contents, as a URL for showing or saving it. */
  attachmentUrl(task: Task, file: Attachment): Promise<string>

  // ---- labels (those one made, and those on tasks one can see) ----
  watchLabels(callback: (labels: Label[]) => void): Unsubscribe
  createLabel(title: string, color: string): Promise<Label>
  updateLabel(id: string, patch: Partial<Pick<Label, 'title' | 'color' | 'description'>>): Promise<void>
  deleteLabel(id: string): Promise<void>

  // ---- teams one is in ----
  watchTeams(callback: (teams: Team[]) => void): Unsubscribe
  createTeam(name: string, description: string): Promise<string>
  updateTeam(id: string, patch: { name: string; description: string }): Promise<void>
  deleteTeam(id: string): Promise<void>
  addTeamMember(teamId: string, username: string): Promise<void>
  removeTeamMember(teamId: string, userId: string): Promise<void>
  setTeamAdmin(teamId: string, userId: string, admin: boolean): Promise<void>

  // ---- sharing a project ----
  getShares(projectId: string): Promise<Shares>
  shareWithUser(projectId: string, username: string, right: Right): Promise<void>
  setUserRight(projectId: string, userId: string, right: Right): Promise<void>
  unshareUser(projectId: string, userId: string): Promise<void>
  shareWithTeam(projectId: string, teamId: string, right: Right): Promise<void>
  setTeamRight(projectId: string, teamId: string, right: Right): Promise<void>
  unshareTeam(projectId: string, teamId: string): Promise<void>
  createLinkShare(projectId: string, right: Right, name: string, password: string): Promise<LinkShare>
  deleteLinkShare(projectId: string, id: string): Promise<void>
  /** Where a share link opens (the server's web app). */
  linkShareUrl(share: LinkShare): string

  // ---- saved filters ----
  watchFilters(callback: (filters: SavedFilter[]) => void): Unsubscribe
  saveFilter(filter: Omit<SavedFilter, 'id'> & { id?: string }): Promise<string>
  deleteFilter(id: string): Promise<void>

  // ---- your inbox ----
  watchNotices(callback: (notices: Notice[]) => void): Unsubscribe
  markRead(id: string, read: boolean): Promise<void>
  markAllRead(): Promise<void>
}

/** A small list of listeners, called with the latest value (and at once, when there is one). */
export class Channel<T> {
  private listeners = new Set<(value: T) => void>()
  private last: { value: T } | null = null

  constructor(initial?: T) {
    if (initial !== undefined) this.last = { value: initial }
  }

  get value(): T | undefined {
    return this.last?.value
  }

  listen(callback: (value: T) => void): Unsubscribe {
    this.listeners.add(callback)
    if (this.last) {
      const { value } = this.last
      queueMicrotask(() => this.listeners.has(callback) && callback(value))
    }
    return () => this.listeners.delete(callback)
  }

  set(value: T): void {
    this.last = { value }
    for (const l of [...this.listeners]) l(value)
  }
}
