// Studio's image files on iOS / Android (StudioSheet.tsx).
//   prepareForStudio(source)   -> base64 JPEG, upright, long edge <= STUDIO_MAX_EDGE (what crosses
//                                 into the WebView: about 0.3–1.5 MB of base64 for a 2048 px photo)
//   saveStudioResult(base64)   -> file:// JPEG in the cache folder (named studio-*, so the
//                                 editor's discard() can clean it up)
import { File, Paths } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'

import { STUDIO_MAX_EDGE } from './config'

/** A remote photo (a posted photo's public copy) as a local file the manipulator can read. */
async function local(uri: string): Promise<{ uri: string; temp: File | null }> {
  if (!/^https?:/i.test(uri)) return { uri, temp: null }
  const dest = new File(Paths.cache, `studio-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
  try {
    const out = await File.downloadFileAsync(uri, dest, { idempotent: true })
    return { uri: out.uri, temp: out }
  } catch {
    throw new Error('Couldn’t load the photo. Check your connection and try again.')
  }
}

export async function prepareForStudio(source: { uri: string }): Promise<{ base64: string; width: number; height: number }> {
  const { uri, temp } = await local(source.uri)
  try {
    // The manipulator applies EXIF orientation, so Studio gets the photo the right way up.
    let ref = await ImageManipulator.manipulate(uri).renderAsync()
    if (Math.max(ref.width, ref.height) > STUDIO_MAX_EDGE) {
      ref = await ImageManipulator.manipulate(ref).resize(ref.width >= ref.height ? { width: STUDIO_MAX_EDGE } : { height: STUDIO_MAX_EDGE }).renderAsync()
    }
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true })
    if (!out.base64) throw new Error('Couldn’t prepare the photo for Studio.')
    // The saved copy itself isn't needed: only its base64 goes to Studio.
    try { new File(out.uri).delete() } catch {}
    return { base64: out.base64, width: out.width, height: out.height }
  } finally {
    try { if (temp?.exists) temp.delete() } catch {}
  }
}

export function saveStudioResult(base64: string): string {
  const file = new File(Paths.cache, `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`)
  file.create()
  file.write(base64, { encoding: 'base64' })
  return file.uri
}
