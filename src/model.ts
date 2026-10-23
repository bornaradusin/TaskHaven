// TaskHaven's data, as the screens use it. It comes from a Vikunja server (data/vikunja.ts), or
// from memory for the demo and the tests (data/memory.ts). Dates are ISO strings or null; ids are
// the server's numbers, as strings.

/** What someone may do in a project: see it, change its tasks, or also manage it and share it. */
export type Right = 'read' | 'write' | 'admin'

export const RIGHTS: Right[] = ['read', 'write', 'admin']

export function rightAtLeast(have: Right | undefined, want: Right): boolean {
  return have !== undefined && RIGHTS.indexOf(have) >= RIGHTS.indexOf(want)
}

export interface Profile {
  id: string
  /** The name to show ("" when they haven't set one: then the username is shown). */
  name: string
  username: string
  /** Only one's own. */
  email: string
  /** One's own account, when the server is to delete it (confirmed by email); else nothing. */
  deletionAt?: string | null
}

export function displayName(p: Pick<Profile, 'name' | 'username'>): string {
  return p.name.trim() || p.username
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  /** 0 Sunday, 1 Monday. */
  weekStart: 0 | 1
  /** Where quick add puts a task without +project. */
  defaultProjectId: string | null
  /** Projects lately opened, newest first (for the overview). */
  recentProjects: string[]
  /** Phone notifications for reminders and due tasks. */
  notifyReminders: boolean
  notifyDue: boolean
  /** The overview also lists tasks without a due date. */
  showUndated: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 1,
  defaultProjectId: null,
  recentProjects: [],
  notifyReminders: true,
  notifyDue: true,
  showUndated: true,
}

/** A saved search across projects ("done = false && priority >= 3"), shown like a project. */
export interface SavedFilter {
  id: string
  title: string
  description: string
  /** In the filter language of logic/filter.ts (the same as Vikunja's). */
  query: string
}

/** A column of a project's kanban board. */
export interface Bucket {
  id: string
  title: string
  /** Most tasks it takes (0: no limit). */
  limit: number
  position: number
}

export type ViewKind = 'list' | 'table' | 'kanban' | 'gantt'

export interface Project {
  id: string
  title: string
  description: string
  /** "#rrggbb" or "". */
  color: string
  /** Shown before task numbers ("HOME-12"); "" for "#12". */
  identifier: string
  parentId: string | null
  archived: boolean
  favorite: boolean
  ownerId: string
  /** What you may do in it. */
  right: Right
  position: number
  /** The server's views of it (their ids), for its board and its order. */
  views: Partial<Record<ViewKind, string>>
  /** The kanban board's columns (once the board has been opened). */
  buckets: Bucket[]
  /** Moving a task into this bucket marks it done (and done ones go there). */
  doneBucketId: string | null
  created: string
  updated: string
}

/** A label: anyone on the server who can see a task sees its labels. */
export interface LabelRef {
  id: string
  title: string
  color: string
}

export interface Label extends LabelRef {
  description: string
  createdBy: string
}

/**
 * When a reminder goes off: at a time, or some minutes before or after the task's due,
 * start or end date (negative: before).
 */
export interface Reminder {
  at: string | null
  relativeTo: 'due' | 'start' | 'end' | null
  /** Minutes from that date. */
  offset: number
}

/** How a repeating task comes back once it's done (the server moves its dates on). */
export interface Repeat {
  /** Seconds ('due' and 'done'); 0 for no repeat. Ignored for 'month'. */
  every: number
  /**
   * 'due': its dates move on by that much (until they're ahead again);
   * 'done': they're set from when it was done;
   * 'month': the same day next month.
   */
  mode: 'due' | 'done' | 'month'
}

export function repeats(r: Repeat | null | undefined): boolean {
  return !!r && (r.mode === 'month' || r.every > 0)
}

export const PRIORITIES = ['Unset', 'Low', 'Medium', 'High', 'Urgent', 'DO NOW'] as const
export type Priority = 0 | 1 | 2 | 3 | 4 | 5

export type RelationKind = 'subtask' | 'parenttask' | 'related' | 'blocking' | 'blocked' | 'duplicateof' | 'duplicates' | 'precedes' | 'follows'

export interface Relation {
  kind: RelationKind
  taskId: string
  projectId: string
  /** What it's called (it may be in a project one can't see). */
  title: string
  done: boolean
}

/** A file on a task (its contents are fetched when it's opened). */
export interface Attachment {
  id: string
  name: string
  /** Its media type ("image/jpeg"). */
  type: string
  /** Bytes. */
  size: number
  createdBy: string
  created: string
}

export interface Task {
  id: string
  projectId: string
  /** Its number in the project ("#12"). */
  index: number
  title: string
  description: string
  done: boolean
  doneAt: string | null
  dueDate: string | null
  startDate: string | null
  endDate: string | null
  priority: Priority
  /** 0–100. */
  percentDone: number
  /** "#rrggbb" or "". */
  color: string
  labels: LabelRef[]
  assignees: string[]
  reminders: Reminder[]
  repeat: Repeat
  relations: Relation[]
  attachments: Attachment[]
  favorite: boolean
  /** Its kanban column (once the board has been opened). */
  bucketId: string | null
  /** Order in the list and on the board (smaller first). */
  position: number
  kanbanPosition: number
  createdBy: string
  created: string
  updated: string
}

export interface Comment {
  id: string
  taskId: string
  authorId: string
  text: string
  created: string
  updated: string
}

export type TeamRole = 'member' | 'admin'

export interface Team {
  id: string
  name: string
  description: string
  ownerId: string
  members: Record<string, TeamRole>
  memberIds: string[]
  created: string
}

/** Who a project is shared with. */
export interface UserShare {
  userId: string
  right: Right
}

export interface TeamShare {
  teamId: string
  name: string
  right: Right
  /** Who's in it (they all see the project). */
  memberIds: string[]
}

/** A link anyone who has it can open the project with (in the server's web app). */
export interface LinkShare {
  id: string
  hash: string
  name: string
  right: Right
  hasPassword: boolean
  sharedBy: string
  created: string
}

export interface Shares {
  users: UserShare[]
  teams: TeamShare[]
  links: LinkShare[]
}

export type NotificationKind = 'assigned' | 'comment' | 'done' | 'shared' | 'deleted' | 'other'

/** In your inbox: what someone did that concerns you (the server makes these). */
export interface Notice {
  id: string
  kind: NotificationKind
  fromId: string
  projectId: string
  taskId: string | null
  /** What it's about, as it was then ("Take out the bins"). */
  title: string
  text: string
  created: string
  read: boolean
}

/** What the server says about itself. */
export interface ServerInfo {
  version: string
  registration: boolean
  /** Signing in with a password works (not only with an outside provider). */
  localLogin: boolean
  linkSharing: boolean
  attachments: boolean
  /** Biggest file it takes ("20MB"). */
  maxFileSize: string
  totp: boolean
  /** It can send email (password resets, confirming account deletion). */
  deletion: boolean
}

export function newTask(projectId: string, createdBy: string, now: string): Task {
  return {
    id: '',
    projectId,
    index: 0,
    title: '',
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
    bucketId: null,
    position: 0,
    kanbanPosition: 0,
    createdBy,
    created: now,
    updated: now,
  }
}

export const COLORS = [
  '#e8632e', '#e0a21b', '#4caf50', '#16a085', '#1e88e5', '#3f51b5', '#8e44ad', '#d81b60', '#795548', '#607d8b',
]

/** A person's colour (avatars), from their id. */
export function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}
