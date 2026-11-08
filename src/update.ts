// Updates from GitHub, in the phone apps. About once a day (and from Settings) the app looks for a
// newer published release; drafts and pre-releases don't count.
// - Android: the APK is downloaded, checked against its SHA-256 and handed to Android's installer
//   (android/…/UpdaterPlugin.java). It's deleted once the update is in.
// - iPhone: an app installed this way can't replace itself, so the new .ipa opens in AltStore or
//   SideStore (whichever is on the phone), or the release page opens for Sideloadly and the like.

import { reactive } from 'vue'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { readLocal, writeLocal } from '@/data/storage'

const LATEST = 'https://api.github.com/repos/bornaradusin/TaskHaven/releases/latest'
const EVERY = 20 * 3600 * 1000
const AUTO = 'taskhaven.updates.auto'
const LAST = 'taskhaven.updates.last'
const LATER = 'taskhaven.updates.later'

export interface Asset {
  name: string
  url: string
  size: number
  sha256?: string
}

export interface AppUpdate {
  version: string
  notes: string
  page: string
  apk?: Asset
  ipa?: Asset
  sums?: string
}

interface UpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>
  allowInstalls(): Promise<void>
  download(options: { url: string; name: string; sha256?: string; sumsUrl?: string }): Promise<{ path: string }>
  install(options: { path: string }): Promise<void>
  addListener(event: 'progress', listener: (p: { fraction: number }) => void): Promise<PluginListenerHandle>
}

const Updater = registerPlugin<UpdaterPlugin>('Updater')

export const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web'
/** Only the phone apps update themselves; the web pages are always the newest. */
export const updatable = platform === 'android' || platform === 'ios'

export type UpdateStep = 'idle' | 'checking' | 'latest' | 'ready' | 'downloading' | 'permission' | 'failed'

export const updates = reactive({
  step: 'idle' as UpdateStep,
  update: null as AppUpdate | null,
  progress: 0,
  problem: '',
  /** The update dialog is open. */
  open: false,
  auto: readLocal<boolean>(AUTO) ?? true,
  /** On an iPhone: which sideloading apps are there to install it with. */
  stores: [] as ('AltStore' | 'SideStore')[],
  /** Android: the downloaded APK, waiting for the install to be allowed. */
  apk: '',
})

export const currentVersion = __APP_VERSION__

/** Whether version a is newer than b ("2.1.10" is newer than "2.1.9"). */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string) => v.split(/[.+-]/).map((p) => parseInt(p, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** Release notes as plain text: no Markdown headings or code fences, bullets as dots. */
export function readableNotes(markdown: string): string {
  return markdown
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('```'))
    .map((l) => {
      const t = l.trimEnd()
      const indent = t.length - t.trimStart().length
      const body = t.trimStart()
      if (body.startsWith('#')) return body.replace(/^#+\s*/, '')
      if (body.startsWith('- ') || body.startsWith('* ')) return `${' '.repeat(indent)}• ${body.slice(2)}`
      return t
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Release {
  tag_name: string
  body?: string | null
  html_url: string
  draft?: boolean
  prerelease?: boolean
  assets?: { name: string; browser_download_url: string; size?: number; digest?: string | null }[]
}

/** The newest release, if it's newer than this app. Throws if GitHub can't be reached. */
export async function latest(): Promise<AppUpdate | null> {
  const res = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const release = (await res.json()) as Release
  if (release.draft || release.prerelease) return null
  const version = release.tag_name.trim().replace(/^v/, '')
  if (!isNewer(version, currentVersion)) return null
  const asset = (test: (name: string) => boolean): Asset | undefined => {
    const a = (release.assets ?? []).find((x) => test(x.name))
    if (!a) return undefined
    const sha = a.digest?.startsWith('sha256:') ? a.digest.slice(7).toLowerCase() : undefined
    return { name: a.name, url: a.browser_download_url, size: a.size ?? 0, sha256: sha }
  }
  return {
    version,
    notes: readableNotes(release.body ?? ''),
    page: release.html_url,
    apk: asset((n) => n.endsWith('.apk') && !n.includes('debug')),
    ipa: asset((n) => n.endsWith('.ipa')),
    sums: asset((n) => n === 'SHA256SUMS.txt')?.url,
  }
}

/** The update for this phone, if the release has one for it. */
function forThisPhone(u: AppUpdate | null): AppUpdate | null {
  if (!u) return null
  if (platform === 'android' && !u.apk) return null
  if (platform === 'ios' && !u.ipa) return null
  return u
}

async function findStores(): Promise<void> {
  if (platform !== 'ios') return
  const { AppLauncher } = await import('@capacitor/app-launcher')
  const found: ('AltStore' | 'SideStore')[] = []
  for (const [name, scheme] of [
    ['AltStore', 'altstore://'],
    ['SideStore', 'sidestore://'],
  ] as const) {
    const { value } = await AppLauncher.canOpenUrl({ url: scheme }).catch(() => ({ value: false }))
    if (value) found.push(name)
  }
  updates.stores = found
}

/** Looks on GitHub. [manual]: asked for in Settings, so the dialog shows what was found, even nothing. */
export async function checkForUpdate(manual = false): Promise<void> {
  if (!updatable || updates.step === 'checking' || updates.step === 'downloading') {
    if (manual) updates.open = true
    return
  }
  if (manual) updates.open = true
  updates.step = 'checking'
  updates.problem = ''
  try {
    const found = forThisPhone(await latest())
    writeLocal(LAST, Date.now())
    updates.update = found
    if (!found) {
      updates.step = 'latest'
      return
    }
    await findStores()
    updates.step = 'ready'
    if (!manual && found.version !== readLocal<string>(LATER)) updates.open = true
  } catch {
    updates.update = null
    updates.step = manual ? 'failed' : 'idle'
    updates.problem = 'Couldn’t reach GitHub. Check the connection and try again.'
  }
}

/** When the app opens: about once a day, unless it's turned off. */
export function checkNowAndThen(): void {
  if (!updatable || !updates.auto) return
  const last = readLocal<number>(LAST) ?? 0
  if (Date.now() - last > EVERY) void checkForUpdate(false)
}

export function setAutoCheck(on: boolean): void {
  updates.auto = on
  writeLocal(AUTO, on)
}

/** "Not now": this version isn't offered again by itself; Settings still has it. */
export function later(): void {
  if (updates.update) writeLocal(LATER, updates.update.version)
  updates.open = false
}

export function closeDialog(): void {
  if (updates.step === 'downloading') return
  updates.open = false
  if (updates.step === 'latest' || (updates.step === 'failed' && !updates.update)) updates.step = 'idle'
}

/** Android: downloads the APK, checks it and opens the installer (asking to allow it the first time). */
export async function installOnAndroid(): Promise<void> {
  const u = updates.update
  if (platform !== 'android' || !u?.apk || updates.step === 'downloading') return
  updates.step = 'downloading'
  updates.progress = 0
  updates.problem = ''
  const listener = await Updater.addListener('progress', (p) => (updates.progress = p.fraction))
  try {
    const { path } = await Updater.download({ url: u.apk.url, name: u.apk.name, sha256: u.apk.sha256, sumsUrl: u.sums })
    updates.apk = path
    await openInstaller()
  } catch (e) {
    updates.step = 'failed'
    updates.problem = String((e as { code?: string })?.code) === 'checksum' ? 'The download was damaged. Try again.' : 'The download didn’t finish. Try again.'
  } finally {
    void listener.remove()
  }
}

async function openInstaller(): Promise<void> {
  const { allowed } = await Updater.canInstall()
  if (!allowed) {
    updates.step = 'permission'
    return
  }
  try {
    await Updater.install({ path: updates.apk })
    // still offered, in case the installer is closed without updating
    updates.step = 'ready'
    updates.open = false
  } catch {
    updates.step = 'failed'
    updates.problem = 'Android’s installer didn’t open. Try again.'
  }
}

export function allowInstalls(): void {
  void Updater.allowInstalls()
}

/** Back in the app after the "install unknown apps" switch: carry on if it's now allowed. */
export async function resumeInstall(): Promise<void> {
  if (updates.step !== 'permission' || !updates.apk) return
  const { allowed } = await Updater.canInstall()
  if (allowed) await openInstaller()
}

/** iPhone: hands the new .ipa to AltStore or SideStore, which install it over this one. */
export async function installWith(store: 'AltStore' | 'SideStore'): Promise<void> {
  const u = updates.update
  if (!u?.ipa) return
  const scheme = store === 'AltStore' ? 'altstore' : 'sidestore'
  const { AppLauncher } = await import('@capacitor/app-launcher')
  await AppLauncher.openUrl({ url: `${scheme}://install?url=${encodeURIComponent(u.ipa.url)}` }).catch(() => undefined)
  updates.open = false
}

/** The release page, to download the update by hand. */
export function openReleasePage(): void {
  if (updates.update) window.open(updates.update.page, '_blank')
}
