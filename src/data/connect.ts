// Which Vikunja server TaskHaven talks to: the address the person typed when they set it up (one
// on their home network, or one on the internet at an https address), or the demo in memory.

import { Capacitor } from '@capacitor/core'
import { BackendError, type Backend } from './backend'
import { readLocal, writeLocal } from './storage'

const SERVER = 'taskhaven.server'
const DEMO = 'taskhaven.demo'

export function savedServer(): string | null {
  return readLocal<string>(SERVER)
}

export function saveServer(address: string | null): void {
  writeLocal(SERVER, address)
}

export function demoChosen(): boolean {
  return readLocal<boolean>(DEMO) === true
}

export function chooseDemo(on: boolean): void {
  writeLocal(DEMO, on ? true : null)
}

/** The backend to use: the saved server, or the demo. Null until one is set up. */
export async function makeBackend(): Promise<Backend | null> {
  if (demoChosen()) {
    const { demoBackend } = await import('./demo')
    return demoBackend()
  }
  const server = savedServer()
  if (!server) return null
  const { VikunjaBackend } = await import('./vikunja')
  try {
    return new VikunjaBackend(server, await fetcher())
  } catch {
    return null
  }
}

/** How requests go: through Android on the phone (see http.ts), the browser's own otherwise. */
async function fetcher(): Promise<typeof fetch> {
  if (!Capacitor.isNativePlatform()) return (...a) => fetch(...a)
  return (await import('./http')).nativeFetch
}

/**
 * Checks an address before it's kept: that it's a Vikunja server, and which. Throws with words
 * for the person when it isn't.
 */
export async function checkServer(input: string): Promise<{ address: string; version: string }> {
  const { normalizeServer } = await import('./vikunja')
  const address = normalizeServer(input)
  const get = await fetcher()
  let res: Response
  try {
    res = await get(`${address}/api/v1/info`, { headers: { Accept: 'application/json' } })
  } catch {
    throw new BackendError('network', `Can’t reach ${address}. Check the address, and that the phone is on the same network as the server (or that the server is on the internet).`)
  }
  let info: { version?: string; auth?: unknown } | null = null
  try {
    info = await res.json()
  } catch {
    info = null
  }
  if (!res.ok || !info?.version || !info.auth) throw new BackendError('not-found', `There’s no Vikunja server at ${address}. Check the address (and the port, like :3456).`)
  return { address, version: info.version }
}
