// Re-editing posted photos (non-destructive). The untouched original stays in the private
// bucket portfolio-originals; the public copy in `portfolio` is re-rendered from it with an edit
// recipe (lib/editor/recipe.js), stored in photos.edit_recipe (null = unedited).
// Plain JS (shared with mobile). Owners only: RLS + column grants enforce it.
//
//   editRecipeSupported()                       -> Promise<boolean>  (false until migration 20261020000000 is applied)
//   getEditablePhoto(photoId)                   -> { id, albumId, ownerId, originalPath, displayPath, width, height, pairRole, recipe }
//   loadOriginalUrl(photo | photoId, { expiresIn }) -> signed URL of the original (throws err.code 'no_original')
//   loadEditSource(photo | photoId)             -> { url, recipe, fromOriginal, photo }   what to open the editor with
//   saveEdit(photoId, { recipe, blob, width?, height? }) -> { id, displayPath, src, width, height, recipe }
//   revertEdit(photoId, { blob?, width?, height? })      -> same, back to the unedited original
import { supabase } from '../lib/supabase.js'
import { isIdentity, normalize, toStorable } from '../lib/editor/recipe.js'

const DISPLAY_BUCKET = 'portfolio'
const ORIGINALS_BUCKET = 'portfolio-originals'
const DISPLAY_LIMIT = 15 * 1024 * 1024 // the portfolio bucket's file size limit

const must = ({ data, error }) => {
  if (error) throw error
  return data
}
const isMissingColumn = (err) =>
  !!err && (err.code === '42703' || err.code === 'PGRST204' || (/edit_recipe/.test(err.message || '') && /does not exist|could not find/i.test(err.message || '')))

// ---------------------------------------------------------------------------
// Is photos.edit_recipe there yet? Checked once per session (a network error isn't cached).
// ---------------------------------------------------------------------------
let supported = null // true | false | null (unknown)
let checking = null
export function editRecipeSupported() {
  if (supported !== null) return Promise.resolve(supported)
  checking ??= supabase.from('photos').select('edit_recipe', { head: true }).limit(1).then(({ error }) => {
    checking = null
    if (!error) supported = true
    else if (isMissingColumn(error)) supported = false
    return supported ?? false
  }, () => { checking = null; return false })
  return checking
}
// For tests / after the migration is applied mid-session.
export const resetEditSupportCache = () => { supported = null; checking = null }

const publicUrl = (path) => supabase.storage.from(DISPLAY_BUCKET).getPublicUrl(path).data.publicUrl

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const BASE_COLUMNS = 'id, album_id, owner_id, original_path, display_path, width, height, pair_role'

export async function getEditablePhoto(photoId) {
  const withRecipe = await editRecipeSupported()
  let { data, error } = await supabase.from('photos').select(withRecipe ? `${BASE_COLUMNS}, edit_recipe` : BASE_COLUMNS).eq('id', photoId).maybeSingle()
  if (error && withRecipe && isMissingColumn(error)) {
    supported = false
    ;({ data, error } = await supabase.from('photos').select(BASE_COLUMNS).eq('id', photoId).maybeSingle())
  }
  if (error) throw error
  if (!data) throw new Error('This photo couldn’t be found. It may have been deleted.')
  return {
    id: data.id,
    albumId: data.album_id,
    ownerId: data.owner_id,
    originalPath: data.original_path,
    displayPath: data.display_path,
    width: data.width,
    height: data.height,
    pairRole: data.pair_role,
    recipe: data.edit_recipe ? normalize(data.edit_recipe) : null,
  }
}

const asPhoto = async (photo) => (typeof photo === 'string' ? getEditablePhoto(photo) : photo)
const originalPathOf = (p) => p?.originalPath ?? p?.original_path ?? null

// A short-lived signed URL for the photo's untouched original (owner only).
export async function loadOriginalUrl(photoOrId, { expiresIn = 3600 } = {}) {
  const photo = await asPhoto(photoOrId)
  const path = originalPathOf(photo)
  if (!path) throw Object.assign(new Error('The original of this photo isn’t available.'), { code: 'no_original' })
  const data = must(await supabase.storage.from(ORIGINALS_BUCKET).createSignedUrl(path, expiresIn))
  return data.signedUrl
}

// What to open the editor with: the original plus its saved recipe. Photos posted without an
// original (old demo data) open their public copy instead, as a fresh edit (recipe null).
// Accepts a photo id, a getEditablePhoto() result, or any object with an `id` (e.g. a viewer photo).
export async function loadEditSource(photoOrId) {
  const photo = typeof photoOrId === 'string' || !('originalPath' in photoOrId) ? await getEditablePhoto(photoOrId.id ?? photoOrId) : photoOrId
  if (originalPathOf(photo)) {
    return { url: await loadOriginalUrl(photo), recipe: photo.recipe ?? null, fromOriginal: true, photo }
  }
  const display = photo.displayPath ?? photo.display_path
  return { url: display ? publicUrl(display) : photo.src, recipe: null, fromOriginal: false, photo }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) + 8) | 0).toString(16))

const sizeOf = (b) => b?.size ?? b?.byteLength ?? 0

async function measure(blob) {
  if (typeof createImageBitmap !== 'function' || !(typeof Blob !== 'undefined' && blob instanceof Blob)) {
    throw new Error('saveEdit needs width and height for this image.')
  }
  const bmp = await createImageBitmap(blob)
  try { return { width: bmp.width, height: bmp.height } } finally { bmp.close?.() }
}

// Replace a photo's public copy with an edited render and remember the recipe.
// blob: the new display copy (JPEG Blob on web; ArrayBuffer / Uint8Array also work, e.g. on mobile).
// recipe: the edit recipe it was rendered from (null / identity = unedited).
// Uploads the new file first, then updates the row, then removes the old file; on failure the
// new file is removed again and the photo is left as it was.
export async function saveEdit(photoId, { recipe, blob, width, height } = {}) {
  if (!blob || !sizeOf(blob)) throw new Error('Nothing to save.')
  if (sizeOf(blob) > DISPLAY_LIMIT) throw new Error('The edited photo is too large to save. Try a smaller crop or less grain.')
  const { data: auth } = await supabase.auth.getSession()
  const uid = auth.session?.user?.id
  if (!uid) throw new Error('You’re signed out. Sign in again to save your edit.')
  const photo = await getEditablePhoto(photoId)
  if (photo.ownerId !== uid) throw new Error('You can only edit your own photos.')
  if (!width || !height) ({ width, height } = await measure(blob))

  // A recipe only makes sense relative to the original; without one the edit is baked in.
  const stored = photo.originalPath && !isIdentity(recipe) ? toStorable(recipe) : null
  const path = `${uid}/${photo.albumId}/${newKey()}.jpg`
  const { error: upErr } = await supabase.storage.from(DISPLAY_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (upErr) {
    if (/maximum allowed size|413/i.test(upErr.message || '')) throw new Error('The edited photo is too large to save.')
    throw new Error(upErr.message || 'Couldn’t upload the edited photo. Check your connection and try again.')
  }

  const update = async (withRecipe) => {
    const patch = { display_path: path, width, height }
    if (withRecipe) patch.edit_recipe = stored
    return supabase.from('photos').update(patch).eq('id', photoId).select('id')
  }
  try {
    let withRecipe = await editRecipeSupported()
    let res = await update(withRecipe)
    if (res.error && withRecipe && isMissingColumn(res.error)) {
      supported = false
      withRecipe = false
      res = await update(false)
    }
    const rows = must(res)
    if (!rows?.length) throw new Error('This photo couldn’t be changed. It may have been deleted.')
    // The old public copy is no longer used. (Only files in the owner's folder; old demo
    // photos may live elsewhere.) Failing to remove it leaves an orphan, not a broken post.
    if (photo.displayPath && photo.displayPath !== path && photo.displayPath.startsWith(`${uid}/`)) {
      await supabase.storage.from(DISPLAY_BUCKET).remove([photo.displayPath]).catch(() => {})
    }
    return { id: photoId, displayPath: path, src: publicUrl(path), width, height, recipe: withRecipe ? stored : null }
  } catch (err) {
    await supabase.storage.from(DISPLAY_BUCKET).remove([path]).catch(() => {})
    throw err
  }
}

// Back to the unedited original: re-render a plain display copy from it and clear the recipe.
// On web the copy is rendered here; other platforms pass { blob, width, height }.
export async function revertEdit(photoId, { blob, width, height } = {}) {
  if (!blob) {
    const url = await loadOriginalUrl(photoId)
    const { exportEdit } = await import('../lib/editor/renderWeb.js')
    ;({ blob, width, height } = await exportEdit(url, null))
  }
  return saveEdit(photoId, { recipe: null, blob, width, height })
}
