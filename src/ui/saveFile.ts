// Files from the app on the phone: the web view can't download, so a file is put in the app's
// cache and handed to the phone's share sheet (Save to Files, Photos, mail, chats…). Only the
// last one is kept there, and the phone clears its apps' caches when it needs the room.

const FOLDER = 'shared'

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** A name the phone's file system takes: no slashes or odd characters, and never empty. */
export function safeFileName(name: string): string {
  const clean = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .()-]+/g, '_')
    .replace(/^[ .]+|[ .]+$/g, '')
  return clean.slice(-120) || 'file'
}

/** Puts the file on the phone and opens the share sheet for it. Throws if it's cancelled or fails. */
export async function saveOnPhone(name: string, blob: Blob): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  await Filesystem.rmdir({ path: FOLDER, directory: Directory.Cache, recursive: true }).catch(() => undefined)
  const written = await Filesystem.writeFile({
    path: `${FOLDER}/${safeFileName(name)}`,
    data: base64(new Uint8Array(await blob.arrayBuffer())),
    directory: Directory.Cache,
    recursive: true,
  })
  await Share.share({ title: name, files: [written.uri] })
}
