// Small things kept on the phone (the server's address, the sign-in, the last data fetched).
// Reading or writing can fail (private mode, full storage): then it's as if nothing was kept.

export function readLocal<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // too big, or not allowed: it's fetched again next time
  }
}
