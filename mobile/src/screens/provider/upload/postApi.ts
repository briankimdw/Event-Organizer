// Re-editing a posted photo on the phone, on top of the shared api/edits.js:
//   openForEdit(photoId)              -> { url, recipe, fromOriginal }   (the private original + saved recipe)
//   saveReedit(photoId, result)       the editor's render (resized to the public copy) -> saveEdit
//   revertPhoto(photoId, photo)       a fresh public copy from the original -> revertEdit
// edits.js takes the display copy as bytes on native (supabase-js uploads an ArrayBuffer /
// Uint8Array reliably in React Native, a Blob from fetch() not always), so files are read here.
import { Platform } from 'react-native'

import { loadEditSource, loadOriginalUrl, revertEdit, saveEdit } from '@shared/api/edits.js'
import { makeDisplayFile } from '@/shims/images'

type Render = { uri: string; width: number; height: number }

async function bytesOf(uri: string): Promise<ArrayBuffer | Uint8Array | Blob> {
  if (Platform.OS === 'web') return (await fetch(uri)).blob()
  const { File } = require('expo-file-system') as typeof import('expo-file-system')
  return new File(uri).bytes()
}

// A remote file (a signed original) as a local file the image manipulator can read.
async function local(url: string): Promise<string> {
  if (Platform.OS === 'web' || !/^https?:/i.test(url)) return url
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system')
  const dest = new File(Paths.cache, `pm-original-${Date.now()}.jpg`)
  const out = await File.downloadFileAsync(url, dest)
  return out.uri
}

export async function openForEdit(photoId: string): Promise<{ url: string; recipe: any; fromOriginal: boolean }> {
  const src = await loadEditSource(photoId)
  return { url: src.url, recipe: src.recipe, fromOriginal: !!src.fromOriginal }
}

/** Save a re-edit: the render becomes the public copy (at most 2048px), the recipe is stored. */
export async function saveReedit(photoId: string, result: Render & { recipe: unknown }) {
  const display = await makeDisplayFile(result)
  return saveEdit(photoId, { recipe: result.recipe, blob: await bytesOf(display.uri), width: display.width, height: display.height } as any)
}

/** Back to the unedited original. */
export async function revertPhoto(photoId: string, size?: { width?: number | null; height?: number | null }) {
  const url = await loadOriginalUrl(photoId)
  const display = await makeDisplayFile({ uri: await local(url), width: size?.width ?? undefined, height: size?.height ?? undefined })
  return revertEdit(photoId, { blob: await bytesOf(display.uri), width: display.width, height: display.height } as any)
}
