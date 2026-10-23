// On the phone, requests to the server go through Android itself rather than the web view: a
// server at home is often plain http (which a web view won't mix with the app's own https page),
// and a server doesn't have to let the app's page in (CORS). It looks like fetch to the rest.

import { CapacitorHttp } from '@capacitor/core'

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const text = atob(b64)
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i)
  return out
}

/**
 * A file as it came: base64, except that Android reads a file the server calls JSON as JSON
 * (then it's written out again, as near the original as can be).
 */
function fileBytes(data: unknown): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') {
    try {
      return bytes(data)
    } catch {
      return new TextEncoder().encode(data) as Uint8Array<ArrayBuffer>
    }
  }
  return new TextEncoder().encode(JSON.stringify(data)) as Uint8Array<ArrayBuffer>
}

/** A file's contents come back as they are (not as text). */
function isFile(url: string): boolean {
  return /\/attachments\/\d+(\?|$)/.test(url)
}

export const nativeFetch: typeof fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  new Headers(init.headers).forEach((value, key) => (headers[key] = value))
  let data: unknown
  let dataType: 'formData' | undefined
  const body = init.body
  if (body instanceof FormData) {
    // Android writes the parts itself (the files as base64, and names it can write)
    const parts: Record<string, string>[] = []
    for (const [key, value] of body.entries()) {
      if (typeof value === 'string') parts.push({ key, value, type: 'string' })
      else {
        const name = value.name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'file'
        parts.push({ key, value: base64(new Uint8Array(await value.arrayBuffer())), type: 'base64File', contentType: value.type || 'application/octet-stream', fileName: name })
      }
    }
    data = parts
    dataType = 'formData'
    headers['Content-Type'] = 'multipart/form-data'
  } else if (typeof body === 'string') {
    try {
      data = JSON.parse(body)
    } catch {
      data = body
    }
  }
  const file = method === 'GET' && isFile(url)
  const res = await CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    dataType,
    responseType: file ? 'blob' : 'text',
    connectTimeout: 15000,
    readTimeout: 60000,
  })
  const out = new Headers()
  for (const [key, value] of Object.entries(res.headers ?? {})) out.set(key, String(value))
  const ok = res.status >= 200 && res.status < 300
  let content: BodyInit | null
  if (res.status === 204) content = null
  else if (file && ok) content = new Blob([fileBytes(res.data)], { type: out.get('content-type') ?? 'application/octet-stream' })
  else if (typeof res.data === 'string') content = res.data
  else content = JSON.stringify(res.data)
  return new Response(content, { status: res.status, headers: out })
}
