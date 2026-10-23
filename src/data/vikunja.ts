// TaskHaven talking to a Vikunja server (its API, version 1, as in Vikunja 0.24 and later).
// Signing in gets a short-lived token and a refresh token of TaskHaven's own (the server's OAuth
// code flow, for apps); older servers give one long token instead. What's fetched is kept on the
// phone, so the app opens with the last of it, and fetched again every so often.

import { BackendError, Channel, type Backend, type ProjectFields, type TaskFields, type Unsubscribe } from './backend'
import { readLocal, writeLocal } from './storage'
import { filterFromServer, filterToServer } from '@/logic/filter'
import {
  DEFAULT_SETTINGS,
  RIGHTS,
  type Attachment,
  type Bucket,
  type Comment,
  type Label,
  type LabelRef,
  type LinkShare,
  type Notice,
  type NotificationKind,
  type Priority,
  type Profile,
  type Project,
  type Relation,
  type RelationKind,
  type Reminder,
  type Repeat,
  type Right,
  type SavedFilter,
  type ServerInfo,
  type Settings,
  type Shares,
  type Task,
  type Team,
  type ViewKind,
} from '@/model'

// ---- the server's address ----

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.local$/i,
  /\.lan$/i,
  /\.home\.arpa$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // Tailscale and other carrier-grade NAT addresses
  /^\[?(::1|f[cd][0-9a-f]{2}:|fe80:)/i,
]

/** Whether a host is on the home network (where plain http is allowed). */
export function isPrivateHost(host: string): boolean {
  return PRIVATE_HOST.some((re) => re.test(host))
}

/**
 * What someone typed as their server ("192.168.1.20:3456", "tasks.example.com") as its address:
 * https unless it's on the home network, without the /api/v1 part.
 */
export function normalizeServer(input: string): string {
  let text = input.trim().replace(/\/+$/, '')
  if (!text) throw new BackendError('invalid', 'Type your Vikunja server’s address.')
  if (!/^[a-z]+:\/\//i.test(text)) {
    const host = text.split(/[/:]/)[0]
    text = `${isPrivateHost(host) ? 'http' : 'https'}://${text}`
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new BackendError('invalid', 'That isn’t a web address (like https://tasks.example.com).')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BackendError('invalid', 'The address starts with https:// (or http:// at home).')
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    throw new BackendError('invalid', 'Over the internet the server must use https:// (plain http:// is only for addresses at home).')
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
  return `${url.protocol}//${url.host}${path}`
}

// ---- what the server sends ----

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

const ZERO = '0001-01-01'

function date(v: string | null | undefined): string | null {
  if (!v || v.startsWith(ZERO)) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function color(hex: string | null | undefined): string {
  const h = (hex ?? '').replace('#', '')
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : ''
}

function hexOut(c: string): string {
  return c.replace('#', '')
}

const RIGHT_OF: Right[] = ['read', 'write', 'admin']
const rightIn = (n: number | undefined): Right => RIGHT_OF[n ?? 0] ?? 'read'
const rightOut = (r: Right): number => RIGHTS.indexOf(r)

const RELATIONS: RelationKind[] = ['subtask', 'parenttask', 'related', 'blocking', 'blocked', 'duplicateof', 'duplicates', 'precedes', 'follows']
const RELATIVE_IN: Record<string, Reminder['relativeTo']> = { due_date: 'due', start_date: 'start', end_date: 'end' }
const RELATIVE_OUT: Record<string, string> = { due: 'due_date', start: 'start_date', end: 'end_date' }

function profileIn(u: Json): Profile | null {
  if (!u || !u.id) return null
  return { id: String(u.id), name: u.name ?? '', username: u.username ?? '', email: '' }
}

function repeatIn(t: Json): Repeat {
  if (t.repeat_mode === 1) return { every: 0, mode: 'month' }
  return { every: t.repeat_after ?? 0, mode: t.repeat_mode === 2 ? 'done' : 'due' }
}

function remindersIn(list: Json[] | null): Reminder[] {
  return (list ?? []).map((r) =>
    r.relative_to && RELATIVE_IN[r.relative_to]
      ? { at: null, relativeTo: RELATIVE_IN[r.relative_to], offset: Math.round((r.relative_period ?? 0) / 60) }
      : { at: date(r.reminder), relativeTo: null, offset: 0 },
  )
}

function relationsIn(map: Json): Relation[] {
  const out: Relation[] = []
  for (const kind of RELATIONS) {
    for (const t of map?.[kind] ?? []) out.push({ kind, taskId: String(t.id), projectId: String(t.project_id), title: t.title ?? '', done: !!t.done })
  }
  return out
}

function attachmentIn(a: Json): Attachment {
  return {
    id: String(a.id),
    name: a.file?.name ?? 'file',
    type: (a.file?.mime ?? 'application/octet-stream').split(';')[0],
    size: a.file?.size ?? 0,
    createdBy: String(a.created_by?.id ?? ''),
    created: date(a.created) ?? '',
  }
}

function labelIn(l: Json): Label {
  return { id: String(l.id), title: l.title ?? '', color: color(l.hex_color) || '#9e9e9e', description: l.description ?? '', createdBy: String(l.created_by?.id ?? '') }
}

export function taskIn(t: Json, keep?: Task): Task {
  return {
    id: String(t.id),
    projectId: String(t.project_id),
    index: t.index ?? 0,
    title: t.title ?? '',
    description: t.description ?? '',
    done: !!t.done,
    doneAt: date(t.done_at),
    dueDate: date(t.due_date),
    startDate: date(t.start_date),
    endDate: date(t.end_date),
    priority: Math.max(0, Math.min(5, t.priority ?? 0)) as Priority,
    percentDone: Math.round((t.percent_done ?? 0) * 100),
    color: color(t.hex_color),
    labels: (t.labels ?? []).map((l: Json): LabelRef => ({ id: String(l.id), title: l.title ?? '', color: color(l.hex_color) || '#9e9e9e' })),
    assignees: (t.assignees ?? []).map((u: Json) => String(u.id)),
    reminders: remindersIn(t.reminders),
    repeat: repeatIn(t),
    relations: relationsIn(t.related_tasks),
    attachments: (t.attachments ?? []).map(attachmentIn),
    favorite: !!t.is_favorite,
    // a view's own order and column come only through that view: kept from when it was last fetched
    bucketId: keep?.bucketId ?? null,
    position: keep?.position ?? t.id,
    kanbanPosition: keep?.kanbanPosition ?? t.id,
    createdBy: String(t.created_by?.id ?? ''),
    created: date(t.created) ?? '',
    updated: date(t.updated) ?? '',
  }
}

/** A task as the server takes it (every field: a change replaces the whole task). */
function taskOut(base: Json, fields: Partial<TaskFields>): Json {
  const out = { ...base }
  const set = (key: string, value: unknown) => {
    out[key] = value
  }
  if (fields.title !== undefined) set('title', fields.title)
  if (fields.description !== undefined) set('description', fields.description)
  if (fields.done !== undefined) set('done', fields.done)
  if (fields.dueDate !== undefined) set('due_date', fields.dueDate)
  if (fields.startDate !== undefined) set('start_date', fields.startDate)
  if (fields.endDate !== undefined) set('end_date', fields.endDate)
  if (fields.priority !== undefined) set('priority', fields.priority)
  if (fields.percentDone !== undefined) set('percent_done', fields.percentDone / 100)
  if (fields.color !== undefined) set('hex_color', hexOut(fields.color))
  if (fields.favorite !== undefined) set('is_favorite', fields.favorite)
  if (fields.projectId !== undefined) set('project_id', Number(fields.projectId))
  if (fields.repeat !== undefined) {
    set('repeat_mode', fields.repeat.mode === 'month' ? 1 : fields.repeat.mode === 'done' ? 2 : 0)
    set('repeat_after', fields.repeat.mode === 'month' ? 0 : fields.repeat.every)
  }
  if (fields.reminders !== undefined) {
    set(
      'reminders',
      fields.reminders.map((r) =>
        r.relativeTo ? { relative_to: RELATIVE_OUT[r.relativeTo], relative_period: r.offset * 60 } : { reminder: r.at },
      ),
    )
  }
  // dates the server sends as "0001-01-01…" go back as nothing
  for (const key of ['due_date', 'start_date', 'end_date', 'done_at']) if (typeof out[key] === 'string' && out[key].startsWith(ZERO)) out[key] = null
  return out
}

function noticeIn(n: Json): Notice {
  const kinds: Record<string, NotificationKind> = {
    'task.assigned': 'assigned',
    'task.comment': 'comment',
    'task.mentioned': 'comment',
    'project.created': 'shared',
    'team.member.added': 'shared',
    'task.deleted': 'deleted',
  }
  const body = n.notification ?? {}
  const task = body.task
  const project = body.project ?? (task ? { id: task.project_id } : null)
  const kind = kinds[n.name] ?? 'other'
  return {
    id: String(n.id),
    kind,
    fromId: String(body.doer?.id ?? body.member?.id ?? ''),
    projectId: project?.id ? String(project.id) : '',
    taskId: task?.id ? String(task.id) : null,
    title: task?.title ?? project?.title ?? body.team?.name ?? '',
    text: kind === 'comment' ? stripHtml(body.comment?.comment ?? '') : n.name === 'team.member.added' ? `team:${body.team?.name ?? ''}` : '',
    created: date(n.created) ?? '',
    read: !!date(n.read_at),
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** The server's refusals in words. */
function explain(status: number, body: Json): BackendError {
  const code = body?.code
  const message: string = body?.message ?? ''
  const fields: string[] = body?.invalid_fields ?? []
  if (code === 1011) return new BackendError('auth', 'That username and password don’t match.')
  if (code === 1017 || code === 1039) return new BackendError('totp', 'Type the code from your authenticator app.')
  if (code === 1001) return new BackendError('exists', 'That username is taken. Try another.')
  if (code === 1002) return new BackendError('exists', 'There’s already an account with that email.')
  if (code === 1005) return new BackendError('not-found', 'There’s nobody with that username on this server.')
  if (code === 1012) return new BackendError('auth', 'Confirm your email first: the server sent you a link.')
  if (code === 1020 || code === 1040) return new BackendError('auth', 'This account is disabled or locked. Ask whoever runs the server.')
  if (code === 6006) return new BackendError('invalid', 'A team needs someone in it: delete the team instead.')
  if (code === 3007) return new BackendError('exists', 'Another project on this server already uses that identifier. Pick another, or leave it empty.')
  if (code === 1021) return new BackendError('auth', 'This account signs in through another service, which TaskHaven can’t do yet.')
  if (status === 412 && fields.length) {
    if (fields.some((f) => f.includes('password'))) return new BackendError('invalid', 'Use a password of at least 8 characters.')
    if (fields.some((f) => f.startsWith('email'))) return new BackendError('invalid', 'That doesn’t look like an email address.')
    if (fields.some((f) => f.startsWith('username'))) return new BackendError('invalid', 'A username can’t have spaces or look like a web address.')
    return new BackendError('invalid', `The server didn’t take that: ${fields.join(', ')}.`)
  }
  if (status === 401) return new BackendError('auth', 'You’ve been signed out. Sign in again.')
  if (status === 403) return new BackendError('permission-denied', message && !/forbidden/i.test(message) ? message : 'You aren’t allowed to do that.')
  if (status === 404) return new BackendError('not-found', message || 'That isn’t there any more.')
  if (status === 429) return new BackendError('network', 'Too many tries. Wait a minute and try again.')
  return new BackendError('invalid', message || `The server said no (${status}).`)
}

// ---- signing in ----

interface Session {
  access: string
  /** OAuth refresh token ('' with an older server's long token). */
  refresh: string
  /** When the access token stops working (ms). */
  expires: number
  userId: string
}

const CLIENT_ID = 'taskhaven'
const REDIRECT = 'vikunja-taskhaven://callback'

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge: base64url(digest) }
}

function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return (payload.exp ?? 0) * 1000
  } catch {
    return Date.now() + 5 * 60_000
  }
}

function jwtUser(token: string): string {
  try {
    return String(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id ?? '')
  } catch {
    return ''
  }
}

// ---- the backend ----

interface Cache {
  user: Json | null
  projects: Project[]
  tasks: Task[]
  labels: Label[]
  teams: Team[]
  filters: SavedFilter[]
  notices: Notice[]
  people: Record<string, Profile>
}

const EVERY_MS = 45_000

export class VikunjaBackend implements Backend {
  readonly kind = 'vikunja'
  readonly server: string
  private api: string
  private session: Session | null
  private refreshing: Promise<void> | null = null
  private serverInfo: Json | null = null

  private auth = new Channel<Profile | null>()
  private people = new Channel<Record<string, Profile>>({})
  private settings = new Channel<Settings>()
  private projects = new Channel<Project[]>()
  private tasks = new Channel<Task[]>()
  private labels = new Channel<Label[]>()
  private teams = new Channel<Team[]>()
  private filters = new Channel<SavedFilter[]>()
  private notices = new Channel<Notice[]>()
  private online = new Channel<boolean>(true)
  private comments = new Map<string, Channel<Comment[]>>()

  private cache: Cache = { user: null, projects: [], tasks: [], labels: [], teams: [], filters: [], notices: [], people: {} }
  private rights = new Map<string, { right: Right; at: number }>()
  private filterQueries = new Map<string, { query: string; description: string; updated: string }>()
  private timer: ReturnType<typeof setInterval> | null = null
  /** Boards and lists opened: fetched again with everything else (someone may have moved cards). */
  private boards = new Set<string>()
  private orders = new Set<string>()
  private syncing: Promise<void> | null = null

  constructor(server: string, private fetcher: typeof fetch = (...a) => fetch(...a)) {
    this.server = normalizeServer(server)
    this.api = `${this.server}/api/v1`
    this.session = readLocal<Session>(this.key('session'))
    if (this.session) {
      const saved = readLocal<Cache>(this.key(`cache.${this.session.userId}`))
      if (saved) this.restore(saved)
      queueMicrotask(() => void this.start())
    } else {
      queueMicrotask(() => this.auth.set(null))
    }
  }

  private key(what: string): string {
    return `taskhaven.${what}.${this.server}`
  }

  // ---- requests ----

  private async raw(method: string, path: string, init: { body?: unknown; form?: FormData; auth?: boolean; token?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    let body: BodyInit | undefined
    if (init.form) body = init.form
    else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(init.body)
    }
    if (init.token) headers.Authorization = `Bearer ${init.token}`
    else if (init.auth !== false) headers.Authorization = `Bearer ${await this.accessToken()}`
    let res: Response
    try {
      res = await this.fetcher(`${this.api}${path}`, { method, headers, body })
    } catch {
      this.online.set(false)
      throw new BackendError('network', `Can’t reach ${this.server}. Check the address, and that the phone can get to it.`)
    }
    this.online.set(true)
    return res
  }

  /**
   * A request, its answer as JSON (null when it isn't any). Signed-in requests whose token was
   * refused get one more go with a new token; a server busy writing (SQLite) gets a few more.
   * Only a refusal of the session itself signs out.
   */
  private async send(method: string, path: string, init: { body?: unknown; form?: FormData; auth?: boolean; token?: string } = {}): Promise<{ res: Response; json: Json }> {
    const authed = init.auth !== false && !init.token
    let res = await this.raw(method, path, init)
    if (res.status === 401 && authed && this.session) {
      // the token ran out early, or another copy of the app renewed the session: once more
      if (!this.fresher()) this.session.expires = 0
      res = await this.raw(method, path, init)
    }
    let text = await res.text()
    // a server keeping its data in SQLite (Vikunja's default) is sometimes busy writing something
    // else for a moment ("database is locked" in its log, a bare 500 here): the change was undone,
    // so the same again a little later
    const busy = () => res.status === 500 && /^\s*(\{\s*"message"\s*:\s*"Internal Server Error"\s*\}|database is locked.*)?\s*$/i.test(text)
    for (let i = 0; i < 6 && busy(); i++) {
      // (spread out, so several waiting don't all try at once again)
      await new Promise((r) => setTimeout(r, 200 * (i + 1) + Math.random() * 300))
      res = await this.raw(method, path, init)
      text = await res.text()
    }
    let json: Json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      if (res.status === 401 && authed && this.session && !this.fresher()) this.signedOut()
      throw explain(res.status, json)
    }
    return { res, json }
  }

  /** A request whose answer is JSON; a refusal throws BackendError. */
  private async call<T = Json>(method: string, path: string, init: { body?: unknown; form?: FormData; auth?: boolean; token?: string } = {}): Promise<T> {
    return (await this.send(method, path, init)).json as T
  }

  /** Every page of a list. */
  private async all<T = Json>(path: string): Promise<T[]> {
    const out: T[] = []
    const sep = path.includes('?') ? '&' : '?'
    for (let page = 1; page < 200; page++) {
      const { res, json } = await this.send('GET', `${path}${sep}page=${page}&per_page=${this.perPage()}`)
      const list = Array.isArray(json) ? (json as T[]) : []
      out.push(...list)
      const pages = Number(res.headers.get('x-pagination-total-pages') ?? '1')
      if (page >= pages || list.length === 0) break
    }
    return out
  }

  private perPage(): number {
    return Math.min(250, Number(this.serverInfo?.max_items_per_page ?? 50) || 50)
  }

  /**
   * Takes the session kept on the phone when it's newer than this one (another copy of the app,
   * a second tab, renewed it: each refresh token works once). Whether it did.
   */
  private fresher(): boolean {
    const kept = readLocal<Session>(this.key('session'))
    const s = this.session
    if (!kept || !s || kept.userId !== s.userId || (kept.access === s.access && kept.refresh === s.refresh)) return false
    this.session = kept
    return true
  }

  private async accessToken(): Promise<string> {
    if (this.session && this.session.expires - 30_000 <= Date.now()) this.fresher()
    const s = this.session
    if (!s) throw new BackendError('auth', 'Sign in first.')
    if (s.expires - 30_000 > Date.now()) return s.access
    if (!s.refresh) {
      if (s.expires > Date.now()) return s.access
      this.signedOut()
      throw new BackendError('auth', 'You’ve been signed out. Sign in again.')
    }
    // one refresh at a time (each refresh token works once)
    this.refreshing ??= (async () => {
      // (can't reach the server: it throws, and one stays signed in for when it's back)
      const res = await this.raw('POST', '/oauth/token', { auth: false, body: { grant_type: 'refresh_token', refresh_token: s.refresh, client_id: CLIENT_ID } })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.access_token) {
        if (this.session === s) this.keep({ access: json.access_token, refresh: json.refresh_token, expires: Date.now() + (json.expires_in ?? 600) * 1000, userId: s.userId })
        return
      }
      // the server refused the session itself (it ended, or was renewed elsewhere)
      if (res.status === 400 || res.status === 401) {
        if (this.session !== s || this.fresher()) return
        this.signedOut()
        throw new BackendError('auth', 'You’ve been signed out. Sign in again.')
      }
      // anything else (a proxy's error page, the server restarting, too many tries): later
      throw new BackendError('network', `${this.server} isn’t answering properly just now. Try again in a moment.`)
    })().finally(() => (this.refreshing = null))
    await this.refreshing
    if (!this.session) throw new BackendError('auth', 'You’ve been signed out. Sign in again.')
    return this.session.access
  }

  private keep(session: Session | null): void {
    this.session = session
    writeLocal(this.key('session'), session)
  }

  /** Signed out: nothing of the account stays, on the phone or in here. */
  private signedOut(): void {
    if (!this.session) return
    const userId = this.session.userId
    this.keep(null)
    this.stop()
    this.reset()
    writeLocal(this.key(`cache.${userId}`), null)
    this.auth.set(null)
  }

  private reset(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.cache = { user: null, projects: [], tasks: [], labels: [], teams: [], filters: [], notices: [], people: {} }
    this.rights.clear()
    this.filterQueries.clear()
    this.boards.clear()
    this.orders.clear()
    this.comments.clear()
    this.emit()
  }

  // ---- the server ----

  async info(): Promise<ServerInfo> {
    const i = (this.serverInfo ??= await this.call('GET', '/info', { auth: false }))
    return {
      version: i.version ?? '',
      registration: !!i.auth?.local?.registration_enabled,
      localLogin: i.auth?.local?.enabled !== false,
      linkSharing: !!i.link_sharing_enabled,
      attachments: i.task_attachments_enabled !== false,
      maxFileSize: i.max_file_size ?? '',
      totp: !!i.totp_enabled,
      deletion: i.user_deletion_enabled !== false,
    }
  }

  // ---- signing in ----

  onAuth(callback: (user: Profile | null) => void): Unsubscribe {
    return this.auth.listen(callback)
  }

  async signIn(username: string, password: string, totp?: string): Promise<void> {
    await this.info().catch(() => undefined)
    const login = await this.call<{ token: string }>('POST', '/login', {
      auth: false,
      body: { username: username.trim(), password, long_token: true, ...(totp ? { totp_passcode: totp.trim() } : {}) },
    })
    const userId = jwtUser(login.token)
    // someone else than before: nothing of theirs is shown, and what was kept of this one is
    if (String(this.cache.user?.id ?? '') !== userId) {
      this.reset()
      const saved = readLocal<Cache>(this.key(`cache.${userId}`))
      if (saved) this.cache = { ...this.cache, ...saved }
    }
    // TaskHaven's own session, which renews itself (newer servers); else the long login token
    try {
      const { verifier, challenge } = await pkce()
      const code = await this.call<{ code: string }>('POST', '/oauth/authorize', {
        token: login.token,
        body: { response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'taskhaven' },
      })
      const t = await this.call<{ access_token: string; refresh_token: string; expires_in: number }>('POST', '/oauth/token', {
        auth: false,
        body: { grant_type: 'authorization_code', code: code.code, client_id: CLIENT_ID, redirect_uri: REDIRECT, code_verifier: verifier },
      })
      this.keep({ access: t.access_token, refresh: t.refresh_token, expires: Date.now() + (t.expires_in ?? 600) * 1000, userId })
      // the login's own session isn't needed
      void this.raw('POST', '/user/logout', { token: login.token }).catch(() => undefined)
    } catch (e) {
      if (e instanceof BackendError && e.code !== 'not-found' && e.code !== 'invalid') throw e
      this.keep({ access: login.token, refresh: '', expires: jwtExpiry(login.token), userId })
    }
    await this.start()
  }

  async signUp(username: string, email: string, password: string): Promise<void> {
    await this.call('POST', '/register', { auth: false, body: { username: username.trim(), email: email.trim(), password } })
    await this.signIn(username, password)
  }

  async signOut(): Promise<void> {
    if (this.session) await this.raw('POST', '/user/logout').catch(() => undefined)
    this.signedOut()
  }

  async resetPassword(email: string): Promise<void> {
    await this.call('POST', '/user/password/token', { auth: false, body: { email: email.trim() } })
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new BackendError('invalid', 'Use a password of at least 8 characters.')
    await this.call('POST', '/user/password', { body: { old_password: oldPassword, new_password: newPassword } })
    // the server ends every session with a new password: this phone signs in again with it
    const username = this.cache.user?.username
    try {
      if (!username) throw new Error()
      await this.signIn(username, newPassword)
    } catch {
      // (with two-step sign-in the code is needed again)
      this.signedOut()
      throw new BackendError('auth', 'Your password is changed: sign in again with it.')
    }
  }

  async requestDeletion(password: string): Promise<void> {
    await this.call('POST', '/user/deletion/request', { body: { password } })
  }

  async cancelDeletion(password: string): Promise<void> {
    await this.call('POST', '/user/deletion/cancel', { body: { password } })
    await this.sync()
  }

  // ---- keeping up to date ----

  private async start(): Promise<void> {
    try {
      await this.sync()
    } catch (e) {
      // signed out on the way: nothing more to do; offline: what was kept is shown
      if (e instanceof BackendError && e.code === 'auth') return
    }
    if (!this.session) return
    if (this.cache.user) this.announce()
    else this.auth.set({ id: this.session.userId, name: '', username: '', email: '' })
    this.stop()
    this.timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.refresh().catch(() => undefined)
    }, EVERY_MS)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible)
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible') void this.refresh().catch(() => undefined)
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible)
  }

  private announce(): void {
    const u = this.cache.user
    if (!u) return
    this.auth.set({ id: String(u.id), name: u.name ?? '', username: u.username ?? '', email: u.email ?? '', deletionAt: date(u.deletion_scheduled_at) })
  }

  refresh(): Promise<void> {
    return this.sync()
  }

  private sync(): Promise<void> {
    this.syncing ??= this.pull().finally(() => (this.syncing = null))
    return this.syncing
  }

  private async pull(): Promise<void> {
    if (!this.session) return
    await this.info().catch(() => undefined)
    const [user, projects, tasks, labels, teams, notices] = await Promise.all([
      this.call('GET', '/user'),
      this.all('/projects?is_archived=true'),
      this.all('/tasks'),
      this.all('/labels'),
      this.all('/teams'),
      this.call<Json[]>('GET', '/notifications?per_page=50').catch(() => []),
    ])
    const people: Record<string, Profile> = { ...this.cache.people }
    const meet = (u: Json) => {
      const p = profileIn(u)
      if (p && (p.name || p.username)) people[p.id] = { ...people[p.id], ...p, email: '' }
    }
    this.cache.user = user
    meet(user)
    people[String(user.id)] = { id: String(user.id), name: user.name ?? '', username: user.username, email: user.email ?? '' }

    // projects (negative ids are saved filters)
    const real = projects.filter((p: Json) => p.id > 0)
    const filterProjects = projects.filter((p: Json) => p.id < -1)
    for (const p of real) meet(p.owner)
    await this.learnRights(real, String(user.id))
    const before = new Map(this.cache.projects.map((p) => [p.id, p]))
    this.cache.projects = real.map((p: Json) => this.projectIn(p, before.get(String(p.id))))

    // saved filters
    const filters: SavedFilter[] = []
    for (const fp of filterProjects) {
      const id = String(-fp.id - 1)
      let known = this.filterQueries.get(id)
      if (!known || known.updated !== fp.updated) {
        const f = await this.call('GET', `/filters/${id}`).catch(() => null)
        known = { query: f?.filters?.filter ?? '', description: f?.description ?? '', updated: fp.updated }
        this.filterQueries.set(id, known)
      }
      filters.push({ id, title: fp.title, description: known.description, query: known.query })
    }

    // /tasks leaves out archived projects' tasks: those come from each one's table (all its tasks)
    const archived = real.filter((p: Json) => p.is_archived)
    const more = await Promise.all(
      archived.map((p: Json) => {
        const table = (p.views ?? []).find((v: Json) => v.view_kind === 'table')
        return table ? this.all(`/projects/${p.id}/views/${table.id}/tasks`).catch(() => [] as Json[]) : Promise.resolve([] as Json[])
      }),
    )
    const seen = new Set(tasks.map((t: Json) => t.id))
    for (const t of more.flat()) if (t?.id && !seen.has(t.id)) {
      seen.add(t.id)
      tasks.push(t)
    }
    const old = new Map(this.cache.tasks.map((t) => [t.id, t]))
    for (const t of tasks) {
      meet(t.created_by)
      for (const a of t.assignees ?? []) meet(a)
    }
    this.cache.tasks = tasks.map((t: Json) => taskIn(t, old.get(String(t.id))))
    this.cache.labels = labels.map(labelIn)
    // (in words: labels and projects by name, as one writes them)
    const names = { labels: [...this.cache.labels, ...this.cache.tasks.flatMap((t) => t.labels)], projects: this.cache.projects }
    this.cache.filters = filters.map((f) => ({ ...f, query: filterFromServer(f.query, names) }))
    this.cache.teams = teams.map((t: Json) => {
      for (const m of t.members ?? []) meet(m)
      return this.teamIn(t)
    })
    this.cache.notices = (notices ?? []).map((n: Json) => {
      meet(n.notification?.doer)
      return noticeIn(n)
    })
    this.cache.people = people
    this.emit()
    this.save()
    const known = new Set(this.cache.projects.map((p) => p.id))
    await Promise.all([
      ...[...this.boards].filter((id) => known.has(id)).map((id) => this.loadBoard(id).catch(() => undefined)),
      ...[...this.orders].filter((id) => known.has(id)).map((id) => this.loadOrder(id).catch(() => undefined)),
    ])
  }

  /** Projects shared with one: what one may do in each (the server says it only for one at a time). */
  private async learnRights(projects: Json[], me: string): Promise<void> {
    const stale = Date.now() - 5 * 60_000
    const ask = projects.filter((p) => String(p.owner?.id) !== me && (this.rights.get(String(p.id))?.at ?? 0) < stale)
    await Promise.all(
      ask.map(async (p) => {
        const res = await this.raw('GET', `/projects/${p.id}`).catch(() => null)
        if (!res?.ok) return
        const n = Number(res.headers.get('x-max-permission') ?? res.headers.get('x-max-right') ?? '0')
        this.rights.set(String(p.id), { right: rightIn(n), at: Date.now() })
      }),
    )
  }

  private projectIn(p: Json, keep?: Project): Project {
    const views: Partial<Record<ViewKind, string>> = {}
    let doneBucketId: string | null = keep?.doneBucketId ?? null
    for (const v of p.views ?? []) {
      const kind = v.view_kind as ViewKind
      if (!views[kind]) views[kind] = String(v.id)
      if (kind === 'kanban' && String(v.id) === views.kanban) doneBucketId = v.done_bucket_id ? String(v.done_bucket_id) : null
    }
    const mine = String(p.owner?.id) === String(this.cache.user?.id)
    return {
      id: String(p.id),
      title: p.title ?? '',
      description: p.description ?? '',
      color: color(p.hex_color),
      identifier: p.identifier ?? '',
      parentId: p.parent_project_id ? String(p.parent_project_id) : null,
      archived: !!p.is_archived,
      favorite: !!p.is_favorite,
      ownerId: String(p.owner?.id ?? ''),
      right: mine ? 'admin' : (this.rights.get(String(p.id))?.right ?? keep?.right ?? 'read'),
      position: p.position ?? 0,
      views,
      buckets: keep?.buckets ?? [],
      doneBucketId,
      created: date(p.created) ?? '',
      updated: date(p.updated) ?? '',
    }
  }

  private teamIn(t: Json): Team {
    const members: Record<string, 'member' | 'admin'> = {}
    for (const m of t.members ?? []) members[String(m.id)] = m.admin ? 'admin' : 'member'
    return {
      id: String(t.id),
      name: t.name ?? '',
      description: t.description ?? '',
      ownerId: String(t.created_by?.id ?? ''),
      members,
      memberIds: Object.keys(members),
      created: date(t.created) ?? '',
    }
  }

  private emit(): void {
    this.people.set({ ...this.cache.people })
    this.settings.set(this.settingsIn(this.cache.user))
    this.projects.set([...this.cache.projects])
    this.tasks.set([...this.cache.tasks])
    this.labels.set([...this.cache.labels])
    this.teams.set([...this.cache.teams])
    this.filters.set([...this.cache.filters])
    this.notices.set([...this.cache.notices])
  }

  private saveTimer: ReturnType<typeof setTimeout> | null = null

  /** Keeps what was fetched on the phone, for opening without the server. */
  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      if (this.session && String(this.cache.user?.id ?? '') === this.session.userId) writeLocal(this.key(`cache.${this.session.userId}`), this.cache)
    }, 500)
  }

  private restore(saved: Cache): void {
    this.cache = { ...this.cache, ...saved }
    this.emit()
    this.announce()
  }

  watchOnline(callback: (online: boolean) => void): Unsubscribe {
    return this.online.listen(callback)
  }

  // ---- people and settings ----

  watchPeople(callback: (people: Record<string, Profile>) => void): Unsubscribe {
    return this.people.listen(callback)
  }

  async findUser(username: string): Promise<Profile | null> {
    const want = username.trim().replace(/^@/, '').toLowerCase()
    if (!want) return null
    const found = await this.call<Json[]>('GET', `/users?s=${encodeURIComponent(want)}`)
    const u = (found ?? []).find((x: Json) => (x.username ?? '').toLowerCase() === want)
    const p = profileIn(u)
    if (p) {
      this.cache.people[p.id] = p
      this.people.set({ ...this.cache.people })
    }
    return p
  }

  private settingsIn(user: Json): Settings {
    const s = user?.settings ?? {}
    const mine = (s.frontend_settings?.taskhaven ?? {}) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...mine,
      weekStart: s.week_start === 0 ? 0 : 1,
      defaultProjectId: s.default_project_id ? String(s.default_project_id) : null,
    }
  }

  watchSettings(callback: (settings: Settings) => void): Unsubscribe {
    return this.settings.listen(callback)
  }

  /** The user's settings as the server takes them: all of them, with these changed. */
  private settingsQueue: Promise<unknown> = Promise.resolve()

  /** One change at a time (each sends all the settings: two at once would undo one another). */
  private writeSettings(change: (settings: Json) => void): Promise<void> {
    const next = this.settingsQueue.catch(() => undefined).then(() => this.writeSettingsNow(change))
    this.settingsQueue = next
    return next
  }

  private async writeSettingsNow(change: (settings: Json) => void): Promise<void> {
    const user = await this.call('GET', '/user')
    const s = { ...user.settings }
    change(s)
    await this.call('POST', '/user/settings/general', { body: s })
    user.settings = s
    this.cache.user = { ...user, settings: s }
    this.settings.set(this.settingsIn(this.cache.user))
    this.announce()
    this.save()
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    await this.writeSettings((s) => {
      if (patch.weekStart !== undefined) s.week_start = patch.weekStart
      if (patch.defaultProjectId !== undefined) s.default_project_id = patch.defaultProjectId ? Number(patch.defaultProjectId) : 0
      const { weekStart: _w, defaultProjectId: _d, ...rest } = patch
      void _w
      void _d
      if (Object.keys(rest).length) {
        const fs = { ...(s.frontend_settings ?? {}) }
        fs.taskhaven = { ...(fs.taskhaven ?? {}), ...rest }
        s.frontend_settings = fs
      }
    })
  }

  async updateProfile(patch: { name: string }): Promise<void> {
    await this.writeSettings((s) => (s.name = patch.name.trim()))
    const me = String(this.cache.user?.id)
    this.cache.people[me] = { ...this.cache.people[me], name: patch.name.trim() }
    this.people.set({ ...this.cache.people })
  }

  // ---- projects ----

  watchProjects(callback: (projects: Project[]) => void): Unsubscribe {
    return this.projects.listen(callback)
  }

  private projectOut(base: Json, f: Partial<ProjectFields>): Json {
    const out = { ...base }
    if (f.title !== undefined) out.title = f.title
    if (f.description !== undefined) out.description = f.description
    if (f.color !== undefined) out.hex_color = hexOut(f.color)
    if (f.identifier !== undefined) out.identifier = f.identifier
    if (f.parentId !== undefined) out.parent_project_id = f.parentId ? Number(f.parentId) : 0
    if (f.archived !== undefined) out.is_archived = f.archived
    if (f.favorite !== undefined) out.is_favorite = f.favorite
    if (f.position !== undefined) out.position = f.position
    return out
  }

  async createProject(fields: ProjectFields): Promise<Project> {
    const p = await this.call('PUT', '/projects', { body: this.projectOut({}, fields) })
    const project = this.projectIn(p)
    this.cache.projects = [...this.cache.projects, project]
    this.projects.set([...this.cache.projects])
    this.save()
    return project
  }

  async updateProject(id: string, patch: Partial<ProjectFields>): Promise<void> {
    const current = await this.call('GET', `/projects/${id}`)
    const saved = await this.call('POST', `/projects/${id}`, { body: this.projectOut(current, patch) })
    this.replaceProject(this.projectIn({ ...current, ...saved, views: saved.views ?? current.views }, this.project(id)))
  }

  private project(id: string): Project | undefined {
    return this.cache.projects.find((p) => p.id === id)
  }

  private replaceProject(p: Project): void {
    this.cache.projects = this.cache.projects.map((x) => (x.id === p.id ? p : x))
    this.projects.set([...this.cache.projects])
    this.save()
  }

  async deleteProject(id: string): Promise<void> {
    await this.call('DELETE', `/projects/${id}`)
    const gone = new Set([id, ...this.cache.projects.filter((p) => p.parentId === id).map((p) => p.id)])
    this.cache.projects = this.cache.projects.filter((p) => !gone.has(p.id))
    this.cache.tasks = this.cache.tasks.filter((t) => !gone.has(t.projectId))
    this.emit()
    this.save()
  }

  async duplicateProject(id: string): Promise<Project> {
    const res = await this.call('PUT', `/projects/${id}/duplicate`, { body: {} })
    await this.sync()
    const copy = res?.duplicated_project ?? res?.project ?? res
    const found = copy?.id ? this.project(String(copy.id)) : undefined
    if (!found) throw new BackendError('invalid', 'The copy was made, but couldn’t be found. Pull down to refresh.')
    return found
  }

  // ---- the board and the list order ----

  private view(projectId: string, kind: ViewKind): string {
    const id = this.project(projectId)?.views[kind]
    if (!id) throw new BackendError('not-found', `This project has no ${kind} view on the server.`)
    return id
  }

  async loadBoard(projectId: string): Promise<void> {
    const viewId = this.view(projectId, 'kanban')
    this.boards.add(projectId)
    const per = this.perPage()
    const [view, first] = await Promise.all([
      this.call('GET', `/projects/${projectId}/views/${viewId}`),
      this.call<Json[]>('GET', `/projects/${projectId}/views/${viewId}/tasks?page=1&per_page=${per}`),
    ])
    const p = this.project(projectId)
    if (!p) return
    const placed = new Map<string, { bucketId: string; position: number }>()
    const columns: Bucket[] = []
    for (const b of first ?? []) columns.push({ id: String(b.id), title: b.title ?? '', limit: b.limit ?? 0, position: b.position ?? 0 })
    // each column comes a page of tasks at a time (the server says nothing of how many pages)
    let page = first ?? []
    for (let n = 1; n <= 40; n++) {
      for (const b of page) for (const t of b.tasks ?? []) placed.set(String(t.id), { bucketId: String(b.id), position: t.position ?? 0 })
      if (!page.some((b: Json) => (b.tasks ?? []).length >= per)) break
      page = (await this.call<Json[]>('GET', `/projects/${projectId}/views/${viewId}/tasks?page=${n + 1}&per_page=${per}`)) ?? []
    }
    columns.sort((a, c) => a.position - c.position)
    this.replaceProject({ ...p, buckets: columns, doneBucketId: view?.done_bucket_id ? String(view.done_bucket_id) : null })
    this.cache.tasks = this.cache.tasks.map((t) => {
      const at = placed.get(t.id)
      return at ? { ...t, bucketId: at.bucketId, kanbanPosition: at.position } : t
    })
    this.tasks.set([...this.cache.tasks])
  }

  async loadOrder(projectId: string): Promise<void> {
    const viewId = this.project(projectId)?.views.list
    if (!viewId) return
    this.orders.add(projectId)
    const list = await this.all(`/projects/${projectId}/views/${viewId}/tasks`)
    const order = new Map(list.map((t: Json) => [String(t.id), t.position ?? 0]))
    this.cache.tasks = this.cache.tasks.map((t) => (order.has(t.id) ? { ...t, position: order.get(t.id)! } : t))
    this.tasks.set([...this.cache.tasks])
  }

  async createBucket(projectId: string, title: string): Promise<void> {
    const viewId = this.view(projectId, 'kanban')
    await this.call('PUT', `/projects/${projectId}/views/${viewId}/buckets`, { body: { title, project_view_id: Number(viewId) } })
    await this.loadBoard(projectId)
  }

  async updateBucket(projectId: string, bucketId: string, patch: Partial<Pick<Bucket, 'title' | 'limit' | 'position'>>): Promise<void> {
    const viewId = this.view(projectId, 'kanban')
    const current = this.project(projectId)?.buckets.find((b) => b.id === bucketId)
    const body = { id: Number(bucketId), project_view_id: Number(viewId), title: patch.title ?? current?.title ?? '', limit: patch.limit ?? current?.limit ?? 0, position: patch.position ?? current?.position ?? 0 }
    await this.call('POST', `/projects/${projectId}/views/${viewId}/buckets/${bucketId}`, { body })
    await this.loadBoard(projectId)
  }

  async deleteBucket(projectId: string, bucketId: string): Promise<void> {
    const viewId = this.view(projectId, 'kanban')
    await this.call('DELETE', `/projects/${projectId}/views/${viewId}/buckets/${bucketId}`)
    await this.loadBoard(projectId)
  }

  async setDoneBucket(projectId: string, bucketId: string | null): Promise<void> {
    const viewId = this.view(projectId, 'kanban')
    const view = await this.call('GET', `/projects/${projectId}/views/${viewId}`)
    await this.call('POST', `/projects/${projectId}/views/${viewId}`, { body: { ...view, done_bucket_id: bucketId ? Number(bucketId) : 0 } })
    await this.loadBoard(projectId)
  }

  async moveToBucket(task: Task, bucketId: string, position: number): Promise<void> {
    const viewId = this.view(task.projectId, 'kanban')
    await this.call('POST', `/projects/${task.projectId}/views/${viewId}/buckets/${bucketId}/tasks`, {
      body: { task_id: Number(task.id), bucket_id: Number(bucketId), project_view_id: Number(viewId) },
    })
    await this.call('POST', `/tasks/${task.id}/position`, { body: { task_id: Number(task.id), project_view_id: Number(viewId), position } })
    // moved into (or out of) the done column, it's done (or not): what the server made of it
    const saved = taskIn(await this.call('GET', `/tasks/${task.id}`), { ...task, bucketId, kanbanPosition: position })
    this.putTask(saved)
    await this.loadBoard(task.projectId).catch(() => undefined)
  }

  async setPosition(task: Task, position: number): Promise<void> {
    const viewId = this.view(task.projectId, 'list')
    await this.call('POST', `/tasks/${task.id}/position`, { body: { task_id: Number(task.id), project_view_id: Number(viewId), position } })
    this.putTask({ ...task, position })
  }

  // ---- tasks ----

  watchTasks(callback: (tasks: Task[]) => void): Unsubscribe {
    return this.tasks.listen(callback)
  }

  private putTask(t: Task): void {
    const i = this.cache.tasks.findIndex((x) => x.id === t.id)
    if (i >= 0) this.cache.tasks[i] = t
    else this.cache.tasks.push(t)
    this.cache.tasks = [...this.cache.tasks]
    this.tasks.set(this.cache.tasks)
    this.save()
  }

  private async setLabels(taskId: string, labels: LabelRef[]): Promise<void> {
    await this.call('POST', `/tasks/${taskId}/labels/bulk`, { body: { labels: labels.map((l) => ({ id: Number(l.id) })) } })
  }

  private async setAssignees(taskId: string, ids: string[]): Promise<void> {
    await this.call('POST', `/tasks/${taskId}/assignees/bulk`, { body: { assignees: ids.map((id) => ({ id: Number(id) })) } })
  }

  async createTask(projectId: string, fields: Partial<TaskFields>): Promise<Task> {
    const created = await this.call('PUT', `/projects/${projectId}/tasks`, { body: taskOut({ title: fields.title ?? '' }, fields) })
    const id = String(created.id)
    if (fields.labels?.length) await this.setLabels(id, fields.labels)
    if (fields.assignees?.length) await this.setAssignees(id, fields.assignees)
    const saved = fields.labels?.length || fields.assignees?.length ? await this.call('GET', `/tasks/${id}`) : created
    const task = taskIn(saved)
    this.putTask(task)
    return task
  }

  async updateTask(task: Task, patch: Partial<TaskFields>): Promise<Task> {
    // the server replaces a task with what it's sent: start from what it has now
    const current = await this.call('GET', `/tasks/${task.id}`)
    const fields = Object.keys(patch).filter((k) => !['labels', 'assignees'].includes(k))
    if (fields.length) await this.call('POST', `/tasks/${task.id}`, { body: taskOut(current, patch) })
    if (patch.labels) await this.setLabels(task.id, patch.labels)
    if (patch.assignees) await this.setAssignees(task.id, patch.assignees)
    const saved = taskIn(await this.call('GET', `/tasks/${task.id}`), this.cache.tasks.find((t) => t.id === task.id))
    this.putTask(saved)
    return saved
  }

  async deleteTask(task: Task): Promise<void> {
    await this.call('DELETE', `/tasks/${task.id}`)
    this.cache.tasks = this.cache.tasks.filter((t) => t.id !== task.id)
    this.tasks.set([...this.cache.tasks])
    this.save()
  }

  async addRelation(task: Task, kind: RelationKind, otherId: string): Promise<void> {
    await this.call('PUT', `/tasks/${task.id}/relations`, { body: { task_id: Number(task.id), other_task_id: Number(otherId), relation_kind: kind } })
    await this.reload([task.id, otherId])
  }

  async removeRelation(task: Task, kind: RelationKind, otherId: string): Promise<void> {
    await this.call('DELETE', `/tasks/${task.id}/relations/${kind}/${otherId}`)
    await this.reload([task.id, otherId])
  }

  private async reload(ids: string[]): Promise<void> {
    for (const id of ids) {
      const t = await this.call('GET', `/tasks/${id}`).catch(() => null)
      if (t) this.putTask(taskIn(t, this.cache.tasks.find((x) => x.id === id)))
    }
  }

  // ---- comments ----

  private commentsOf(taskId: string): Channel<Comment[]> {
    let c = this.comments.get(taskId)
    if (!c) {
      c = new Channel<Comment[]>()
      this.comments.set(taskId, c)
    }
    return c
  }

  private async loadComments(taskId: string): Promise<void> {
    const list = await this.all(`/tasks/${taskId}/comments`)
    const comments = (list ?? []).map((c: Json): Comment => {
      const p = profileIn(c.author)
      if (p) this.cache.people[p.id] = { ...this.cache.people[p.id], ...p, email: this.cache.people[p.id]?.email ?? '' }
      return { id: String(c.id), taskId, authorId: String(c.author?.id ?? ''), text: c.comment ?? '', created: date(c.created) ?? '', updated: date(c.updated) ?? '' }
    })
    this.people.set({ ...this.cache.people })
    this.commentsOf(taskId).set(comments.sort((a, b) => a.created.localeCompare(b.created)))
  }

  watchComments(taskId: string, callback: (comments: Comment[]) => void): Unsubscribe {
    const stop = this.commentsOf(taskId).listen(callback)
    void this.loadComments(taskId).catch(() => callback(this.commentsOf(taskId).value ?? []))
    const timer = setInterval(() => void this.loadComments(taskId).catch(() => undefined), 20_000)
    return () => {
      stop()
      clearInterval(timer)
    }
  }

  async addComment(taskId: string, text: string): Promise<void> {
    await this.call('PUT', `/tasks/${taskId}/comments`, { body: { comment: text } })
    await this.loadComments(taskId)
  }

  async updateComment(taskId: string, id: string, text: string): Promise<void> {
    await this.call('POST', `/tasks/${taskId}/comments/${id}`, { body: { comment: text } })
    await this.loadComments(taskId)
  }

  async deleteComment(taskId: string, id: string): Promise<void> {
    await this.call('DELETE', `/tasks/${taskId}/comments/${id}`)
    await this.loadComments(taskId)
  }

  // ---- attachments ----

  async uploadAttachment(task: Task, file: Blob, name: string): Promise<void> {
    const form = new FormData()
    form.append('files', file, name)
    const res = await this.call('PUT', `/tasks/${task.id}/attachments`, { form })
    const failed = (res?.errors ?? []).filter(Boolean)
    if (failed.length) throw new BackendError('invalid', failed[0]?.message ?? 'The server didn’t take that file.')
    await this.reload([task.id])
  }

  async deleteAttachment(task: Task, id: string): Promise<void> {
    await this.call('DELETE', `/tasks/${task.id}/attachments/${id}`)
    await this.reload([task.id])
  }

  async attachmentUrl(task: Task, file: Attachment): Promise<string> {
    const res = await this.raw('GET', `/tasks/${task.id}/attachments/${file.id}`)
    if (!res.ok) throw explain(res.status, await res.json().catch(() => null))
    return URL.createObjectURL(await res.blob())
  }

  // ---- labels ----

  watchLabels(callback: (labels: Label[]) => void): Unsubscribe {
    return this.labels.listen(callback)
  }

  async createLabel(title: string, colorHex: string): Promise<Label> {
    const l = labelIn(await this.call('PUT', '/labels', { body: { title: title.trim(), hex_color: hexOut(colorHex) } }))
    this.cache.labels = [...this.cache.labels, l]
    this.labels.set([...this.cache.labels])
    return l
  }

  async updateLabel(id: string, patch: Partial<Pick<Label, 'title' | 'color' | 'description'>>): Promise<void> {
    const current = await this.call('GET', `/labels/${id}`)
    const body = { ...current, title: patch.title ?? current.title, description: patch.description ?? current.description, hex_color: patch.color !== undefined ? hexOut(patch.color) : current.hex_color }
    const saved = labelIn(await this.call('POST', `/labels/${id}`, { body }))
    this.cache.labels = this.cache.labels.map((l) => (l.id === id ? saved : l))
    this.cache.tasks = this.cache.tasks.map((t) => (t.labels.some((l) => l.id === id) ? { ...t, labels: t.labels.map((l) => (l.id === id ? { id, title: saved.title, color: saved.color } : l)) } : t))
    this.labels.set([...this.cache.labels])
    this.tasks.set([...this.cache.tasks])
  }

  async deleteLabel(id: string): Promise<void> {
    await this.call('DELETE', `/labels/${id}`)
    this.cache.labels = this.cache.labels.filter((l) => l.id !== id)
    this.cache.tasks = this.cache.tasks.map((t) => (t.labels.some((l) => l.id === id) ? { ...t, labels: t.labels.filter((l) => l.id !== id) } : t))
    this.labels.set([...this.cache.labels])
    this.tasks.set([...this.cache.tasks])
  }

  // ---- teams ----

  watchTeams(callback: (teams: Team[]) => void): Unsubscribe {
    return this.teams.listen(callback)
  }

  private async reloadTeams(): Promise<void> {
    const teams = await this.all('/teams')
    for (const t of teams) {
      for (const m of t.members ?? []) {
        const p = profileIn(m)
        if (p) this.cache.people[p.id] = { ...this.cache.people[p.id], ...p, email: this.cache.people[p.id]?.email ?? '' }
      }
    }
    this.cache.teams = teams.map((t: Json) => this.teamIn(t))
    this.people.set({ ...this.cache.people })
    this.teams.set([...this.cache.teams])
  }

  async createTeam(name: string, description: string): Promise<string> {
    const t = await this.call('PUT', '/teams', { body: { name: name.trim(), description } })
    await this.reloadTeams()
    return String(t.id)
  }

  async updateTeam(id: string, patch: { name: string; description: string }): Promise<void> {
    await this.call('POST', `/teams/${id}`, { body: { id: Number(id), name: patch.name.trim(), description: patch.description } })
    await this.reloadTeams()
  }

  async deleteTeam(id: string): Promise<void> {
    await this.call('DELETE', `/teams/${id}`)
    await this.reloadTeams()
  }

  async addTeamMember(teamId: string, username: string): Promise<void> {
    await this.call('PUT', `/teams/${teamId}/members`, { body: { username: username.trim().replace(/^@/, ''), admin: false } })
    await this.reloadTeams()
  }

  /** The server knows people in teams and shares by their username. */
  private username(userId: string): string {
    const username = this.cache.people[userId]?.username
    if (!username) throw new BackendError('not-found', 'That person isn’t there any more. Pull down to refresh.')
    return username
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await this.call('DELETE', `/teams/${teamId}/members/${encodeURIComponent(this.username(userId))}`)
    await this.reloadTeams()
  }

  async setTeamAdmin(teamId: string, userId: string, admin: boolean): Promise<void> {
    const team = this.cache.teams.find((t) => t.id === teamId)
    // the server toggles it
    if ((team?.members[userId] === 'admin') !== admin) await this.call('POST', `/teams/${teamId}/members/${encodeURIComponent(this.username(userId))}/admin`, { body: {} })
    await this.reloadTeams()
  }

  // ---- sharing ----

  async getShares(projectId: string): Promise<Shares> {
    const [users, teams, links] = await Promise.all([
      this.all(`/projects/${projectId}/users`),
      this.all(`/projects/${projectId}/teams`),
      this.serverInfo?.link_sharing_enabled === false ? Promise.resolve([]) : this.all(`/projects/${projectId}/shares`).catch(() => []),
    ])
    for (const u of [...users, ...teams.flatMap((t: Json) => t.members ?? [])]) {
      const p = profileIn(u)
      if (p) this.cache.people[p.id] = { ...this.cache.people[p.id], ...p, email: this.cache.people[p.id]?.email ?? '' }
    }
    this.people.set({ ...this.cache.people })
    return {
      users: users.map((u: Json) => ({ userId: String(u.id), right: rightIn(u.permission ?? u.right) })),
      teams: teams.map((t: Json) => ({ teamId: String(t.id), name: t.name ?? '', right: rightIn(t.permission ?? t.right), memberIds: (t.members ?? []).map((m: Json) => String(m.id)) })),
      links: links.map(
        (l: Json): LinkShare => ({
          id: String(l.id),
          hash: l.hash,
          name: l.name ?? '',
          right: rightIn(l.permission ?? l.right),
          hasPassword: l.sharing_type === 2,
          sharedBy: String(l.shared_by?.id ?? ''),
          created: date(l.created) ?? '',
        }),
      ),
    }
  }

  async shareWithUser(projectId: string, username: string, right: Right): Promise<void> {
    await this.call('PUT', `/projects/${projectId}/users`, { body: { username: username.trim().replace(/^@/, ''), permission: rightOut(right) } })
  }

  async setUserRight(projectId: string, userId: string, right: Right): Promise<void> {
    const username = this.username(userId)
    await this.call('POST', `/projects/${projectId}/users/${encodeURIComponent(username)}`, { body: { permission: rightOut(right), username } })
  }

  async unshareUser(projectId: string, userId: string): Promise<void> {
    try {
      await this.call('DELETE', `/projects/${projectId}/users/${encodeURIComponent(this.username(userId))}`)
    } catch (e) {
      // only a project's admins take people off it, oneself included
      if (e instanceof BackendError && e.code === 'permission-denied' && userId === String(this.cache.user?.id)) {
        throw new BackendError('permission-denied', 'Only the project’s admins can take you off it: ask whoever shared it with you.')
      }
      throw e
    }
    if (userId === String(this.cache.user?.id)) await this.sync()
  }

  async shareWithTeam(projectId: string, teamId: string, right: Right): Promise<void> {
    await this.call('PUT', `/projects/${projectId}/teams`, { body: { team_id: Number(teamId), permission: rightOut(right) } })
  }

  async setTeamRight(projectId: string, teamId: string, right: Right): Promise<void> {
    await this.call('POST', `/projects/${projectId}/teams/${teamId}`, { body: { team_id: Number(teamId), permission: rightOut(right) } })
  }

  async unshareTeam(projectId: string, teamId: string): Promise<void> {
    await this.call('DELETE', `/projects/${projectId}/teams/${teamId}`)
  }

  async createLinkShare(projectId: string, right: Right, name: string, password: string): Promise<LinkShare> {
    const l = await this.call('PUT', `/projects/${projectId}/shares`, {
      body: { permission: rightOut(right), name: name.trim(), sharing_type: password ? 2 : 1, password },
    })
    return { id: String(l.id), hash: l.hash, name: l.name ?? '', right, hasPassword: !!password, sharedBy: String(this.cache.user?.id ?? ''), created: date(l.created) ?? '' }
  }

  async deleteLinkShare(projectId: string, id: string): Promise<void> {
    await this.call('DELETE', `/projects/${projectId}/shares/${id}`)
  }

  linkShareUrl(share: LinkShare): string {
    const front = (this.serverInfo?.frontend_url as string | undefined)?.replace(/\/+$/, '') || this.server
    return `${front}/share/${share.hash}/auth`
  }

  // ---- saved filters ----

  watchFilters(callback: (filters: SavedFilter[]) => void): Unsubscribe {
    return this.filters.listen(callback)
  }

  async saveFilter(filter: Omit<SavedFilter, 'id'> & { id?: string }): Promise<string> {
    const names = { labels: [...this.cache.labels, ...this.cache.tasks.flatMap((t) => t.labels)], projects: this.cache.projects }
    const body = { title: filter.title.trim(), description: filter.description, filters: { filter: filterToServer(filter.query, names), filter_include_nulls: false } }
    const saved = filter.id ? await this.call('POST', `/filters/${filter.id}`, { body: { ...body, id: Number(filter.id) } }) : await this.call('PUT', '/filters', { body })
    this.filterQueries.delete(String(saved.id))
    await this.sync()
    return String(saved.id)
  }

  async deleteFilter(id: string): Promise<void> {
    await this.call('DELETE', `/filters/${id}`)
    this.cache.filters = this.cache.filters.filter((f) => f.id !== id)
    this.filters.set([...this.cache.filters])
  }

  // ---- notices ----

  watchNotices(callback: (notices: Notice[]) => void): Unsubscribe {
    return this.notices.listen(callback)
  }

  async markRead(id: string, read: boolean): Promise<void> {
    await this.call('POST', `/notifications/${id}`, { body: { read } })
    this.cache.notices = this.cache.notices.map((n) => (n.id === id ? { ...n, read } : n))
    this.notices.set([...this.cache.notices])
  }

  async markAllRead(): Promise<void> {
    await this.call('POST', '/notifications', { body: {} })
    this.cache.notices = this.cache.notices.map((n) => ({ ...n, read: true }))
    this.notices.set([...this.cache.notices])
  }
}
