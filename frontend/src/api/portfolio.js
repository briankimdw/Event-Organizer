// Data layer for photographer listings and portfolio albums. Screens call these
// functions instead of talking to Supabase directly.
//
// Removed in the photography pivot (2026-10-18), archived in
// archive/event-platform/frontend/src/api/portfolio.credits-and-occasions.js:
//   creditsSupported, listCredits, setAlbumCredits, searchVendors, listTaggedAlbums,
//   setAlbumOccasion. Albums no longer carry `credits`; postAlbum / updateAlbum ignore
//   `occasion` and `credits`. getMyProviders only returns photo & video listings.
//
// Changed 2026-10-19 (posting rework: editing, before/after, per-photo retry, resume).
// Everything old still works the same way; new pieces are additive:
//   - postAlbum(): posts are created *hidden* and published once every photo is up (clients
//     never see half a post). Items may now carry `recipe` (saved as photos.edit_recipe when
//     the column exists) and `pairRole`; a ready-made `display` is used as the public copy
//     (e.g. an edited render). Items sharing one `file` object upload that original once.
//     New options: coverIndex, signal (AbortSignal; the error then has .cancelled). Network
//     and server hiccups are retried twice per photo.
//   - New step-by-step API (per-photo retry / cancel / resume): createPostDraft, uploadPostPhoto,
//     publishPost, discardPostDraft, originalOwners, isCancelled, editRecipeSupported.
//   - New photo management: getPostPhotos, reorderPostPhotos, setPostCover, replacePostPhoto,
//     removePostPhoto, convertPost.
//   - New pure helpers: suggestPostTitle({ service, shotOn, location }), photoHints({ width,
//     height, size, duplicateOf }).
//   Re-editing / reverting a posted photo lives in api/edits.js (saveEdit, revertEdit, loadOriginalUrl).
import { supabase } from '../lib/supabase.js'
import { fileExtension, makeDisplayCopy, readCameraSettings } from '../lib/images.js'
import { PHOTO_VERTICAL, VERTICALS, isPhotoVertical, normalizeVertical } from '../verticals/index.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl

// ---------------------------------------------------------------------------
// Photographer listing
// ---------------------------------------------------------------------------

// The signed-in user's photo & video listings, oldest first (normally one; an old
// account may have two, e.g. a photography and a videography one). Listings in other
// verticals from the multi-vendor days are left out. Each is a providers row plus
// `vertical` ('photography').
export async function getMyProviders(userId) {
  if (!userId) return []
  const rows = must(
    await supabase
      .from('providers')
      .select('*, vertical:service_categories!providers_vertical_id_fkey(slug)')
      .eq('profile_id', userId)
      .order('created_at'),
  )
  return rows
    .filter((r) => !r.vertical?.slug || isPhotoVertical(r.vertical.slug))
    .map((r) => ({ ...r, vertical: normalizeVertical(r.vertical?.slug) || PHOTO_VERTICAL }))
}

// One of the user's listings, or null if they haven't set one up.
// `pick`: a provider id or vertical slug to prefer; otherwise the oldest listing.
export async function getMyProvider(userId, pick = null) {
  const all = await getMyProviders(userId)
  return all.find((p) => p.id === pick || p.vertical === pick) || all[0] || null
}

// Photo & video services (Wedding, Headshots, ... Wedding film, Drone) that exist in the
// database, in catalog order: [{ id, slug, name, kind, parent_id, sort_order }]. Matched by
// slug, so the video services count even while the database still files them under
// 'videography'. (`vertical` is kept for old callers and ignored.)
export async function getServicesOf(_vertical = PHOTO_VERTICAL) {
  const catalog = VERTICALS[0].services
  const rows = must(await supabase.from('service_categories').select('id, slug, name, kind, parent_id, sort_order').eq('is_active', true).in('slug', catalog.map((s) => s.slug)))
  const bySlug = new Map(rows.map((r) => [r.slug, r]))
  return catalog.map((s, i) => bySlug.get(s.slug) && { ...bySlug.get(s.slug), name: s.name, sort_order: i + 1 }).filter(Boolean)
}
// Older name, kept for existing callers.
export const getPhotographyServices = () => getServicesOf('photography')

// Is this vertical in the database yet? (New verticals arrive with a migration.)
export async function verticalIsLive(vertical) {
  const { data } = await supabase.from('service_categories').select('id').eq('slug', vertical).eq('is_active', true).maybeSingle()
  return !!data
}

// Category ids a photographer offers (provider_services), e.g. to pre-pick a post's category.
export async function getProviderServiceIds(providerId) {
  const rows = must(await supabase.from('provider_services').select('category_id').eq('provider_id', providerId))
  return rows.map((r) => r.category_id)
}

// Create a photo & video listing (active straight away), and record which services it offers.
// (`vertical` is kept for old callers; it's always photography.)
export async function becomeProvider({ displayName, slug, city, serviceIds = [], bio = null }) {
  const provider = must(await supabase.rpc('become_provider', {
    p_display_name: displayName,
    p_slug: slug,
    p_vertical_slug: PHOTO_VERTICAL,
    p_city: city || null,
    p_bio: bio || null,
  }))
  if (serviceIds.length) {
    must(await supabase.from('provider_services').insert(serviceIds.map((category_id) => ({ provider_id: provider.id, category_id }))))
  }
  return must(await supabase.from('providers').update({ status: 'active' }).eq('id', provider.id).select().single())
}

// "Maya Chen Photo" -> "maya-chen-photo"
export const slugify = (text) =>
  text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

const ALBUM_COLUMNS =
  'id, provider_id, category_id, title, caption, location_text, shot_on, kind, status, sort_order, created_at, category:service_categories(name, slug), ' +
  'photos!photos_album_id_fkey(id, position, display_path, width, height, pair_role, exif, auto_tags), album_tags(tag:tags(slug, name))'

// A photographer's albums in their chosen order: sort_order ascending (new posts
// have 0, so they come first), then newest first.
export async function listMyAlbums(providerId) {
  return must(
    await supabase
      .from('albums')
      .select(ALBUM_COLUMNS)
      .eq('provider_id', providerId)
      .order('sort_order')
      .order('created_at', { ascending: false })
      .order('position', { referencedTable: 'photos' }),
  )
}

// A provider's albums (everyone sees published ones; owners see all of theirs).
export const listAlbums = (providerId) => listMyAlbums(providerId)

export async function getAlbum(albumId) {
  return must(await supabase.from('albums').select(ALBUM_COLUMNS).eq('id', albumId).order('position', { referencedTable: 'photos' }).maybeSingle())
}

const prettyDate = (iso) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

// Shape a database album for the full-screen AlbumViewer.
// Also carries the raw fields the owner's edit sheet needs (shotOn, categoryId, kind).
// occasion: { slug, name } | null, only on old posts tagged with one (it can't be set any more).
export function toViewerAlbum(a) {
  const photos = [...(a.photos || [])].sort((x, y) => x.position - y.position)
  // SigLIP tags shared by the album's photos, most common first.
  const tagCounts = new Map()
  for (const p of photos) for (const t of p.auto_tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
  const tagRows = (a.album_tags || []).map((t) => t.tag).filter(Boolean)
  const occasionTag = tagRows.find((t) => t.slug?.startsWith(OCCASION_PREFIX))
  const occasionSlug = occasionTag ? occasionTag.slug.slice(OCCASION_PREFIX.length) : null
  const shared = {
    id: a.id, providerId: a.provider_id, title: a.title, caption: a.caption, location: a.location_text,
    date: prettyDate(a.shot_on || a.created_at), genre: a.category?.name, status: a.status,
    shotOn: a.shot_on || '', categoryId: a.category_id ?? null, kind: a.kind, photoCount: photos.length,
    occasion: occasionTag ? { slug: occasionSlug, name: occasionTag.name || occasionSlug } : null,
    tags: tagRows.filter((t) => t !== occasionTag).map((t) => t.name || t.slug),
    autoTags: [...tagCounts.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t).slice(0, 6), realPhoto: false,
    cover: photos[0] ? publicUrl('portfolio', (photos.find((p) => p.pair_role === 'after') || photos[0]).display_path) : null,
  }
  if (a.kind === 'before_after' && photos.length >= 2) {
    const before = photos.find((p) => p.pair_role === 'before') || photos[0]
    const after = photos.find((p) => p.pair_role === 'after') || photos[1]
    return {
      ...shared, type: 'beforeafter',
      photos: [{ id: after.id, seed: after.id, src: publicUrl('portfolio', after.display_path), beforeSrc: publicUrl('portfolio', before.display_path), exif: after.exif, autoTags: after.auto_tags || [] }],
    }
  }
  return { ...shared, type: 'photo', photos: photos.map((p) => ({ id: p.id, seed: p.id, src: publicUrl('portfolio', p.display_path), exif: p.exif, autoTags: p.auto_tags || [] })) }
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------
//
// A post goes up in three steps, so a screen can show per-photo progress, retry one
// photo, cancel, or resume after the tab was closed:
//   1. createPostDraft(meta)   the album row, *hidden* until it's complete
//   2. uploadPostPhoto(...)    per photo: public copy + private original + the photos row
//   3. publishPost(albumId)    cover + status 'published'
// discardPostDraft(albumId) throws a draft away. postAlbum() runs all three (and rolls
// back on failure), for callers that just want "post this".

const STORAGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1`
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const storageError = (status, body) => {
  let message = ''
  try {
    message = JSON.parse(body).message || ''
  } catch { /* not JSON */ }
  if (status === 413 || /maximum allowed size/i.test(message)) return new Error('This photo is too large to upload.')
  if (status === 401 || status === 403 || /row-level security|unauthorized|jwt/i.test(message)) {
    return new Error('Your session expired. Sign in again, then retry.')
  }
  // Server hiccups and timeouts are worth retrying; other refusals aren't.
  return Object.assign(new Error(message || `Upload failed (${status}).`), { retryable: status >= 500 || status === 408 || status === 429 })
}

const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError', cancelled: true })
export const isCancelled = (err) => !!err && (err.cancelled || err.name === 'AbortError')

// Upload one file to Storage, reporting bytes sent. Uses XHR (fetch can't report
// upload progress); falls back to supabase-js if the request can't be made at all.
// signal: an AbortSignal (cancels the request).
async function uploadFile(bucket, path, body, contentType, onBytes, signal) {
  if (signal?.aborted) throw abortError()
  const { data } = await supabase.auth.getSession() // refreshes the token if it's about to expire
  const token = data.session?.access_token
  if (!token) throw new Error('You’re signed out. Sign in again to post.')
  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const onAbort = () => xhr.abort()
      xhr.open('POST', `${STORAGE_URL}/object/${bucket}/${path}`)
      xhr.setRequestHeader('authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', API_KEY)
      xhr.setRequestHeader('content-type', contentType)
      xhr.setRequestHeader('cache-control', 'max-age=3600')
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.upload.onprogress = (e) => e.lengthComputable && onBytes?.(Math.min(e.loaded, body.size))
      const done = (fn) => (...a) => { signal?.removeEventListener('abort', onAbort); fn(...a) }
      xhr.onload = done(() => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(storageError(xhr.status, xhr.responseText))))
      xhr.onerror = done(() => reject(Object.assign(new Error('network'), { network: true })))
      xhr.onabort = done(() => reject(abortError()))
      signal?.addEventListener('abort', onAbort)
      xhr.send(body)
    })
  } catch (err) {
    if (!err.network) throw err
    if (signal?.aborted) throw abortError()
    // XHR couldn't connect: try once more the standard way (no byte progress).
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType })
    if (error) throw Object.assign(new Error('Network problem while uploading. Check your connection and try again.'), { retryable: true })
  }
  onBytes?.(body.size)
}

// Run `work` over items, at most `limit` at a time. Stops starting new items after
// the first failure, waits for the ones in flight, then rethrows that failure.
async function inPool(items, limit, work) {
  let next = 0
  let failure = null
  const worker = async () => {
    while (!failure && next < items.length) {
      const i = next++
      try {
        await work(items[i], i)
      } catch (err) {
        failure ??= err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failure) throw failure
}

// Retry `fn` when it fails with a network / server hiccup (not on refusals or cancel).
async function withRetries(fn, { retries = 2, signal, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      const retryable = (err.retryable || err.network || /failed to fetch|network/i.test(err.message || '')) && !isCancelled(err)
      if (!retryable || attempt >= retries || signal?.aborted) throw err
      onRetry?.(attempt + 1, err)
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt))
      if (signal?.aborted) throw abortError()
    }
  }
}

// Remove storage files; returns how many could not be removed. (Storage only
// deletes files the user can also *read* through the API.)
async function removeFiles(byBucket) {
  let left = 0
  for (const [bucket, all] of Object.entries(byBucket)) {
    const paths = [...new Set(all.filter(Boolean))]
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { data, error } = await supabase.storage.from(bucket).remove(chunk)
      left += error ? chunk.length : chunk.length - (data?.length ?? 0)
    }
  }
  return left
}

// ---- edit recipes -----------------------------------------------------------
// photos.edit_recipe (jsonb) holds a photo's non-destructive edits (see lib/editor/recipe.js).
// The column may not exist on the hosted database yet: then recipes are simply not saved
// (the edited render still becomes the public copy) and nothing fails.
let recipeColumn = null // null = not checked yet

const mentionsRecipe = (error) => !!error && /edit_recipe/.test(`${error.message || ''} ${error.details || ''} ${error.hint || ''}`)

// Does the database have photos.edit_recipe? (Checked once per page load.)
export async function editRecipeSupported() {
  if (recipeColumn === null) {
    const { error } = await supabase.from('photos').select('id, edit_recipe').limit(1)
    recipeColumn = !error
  }
  return recipeColumn
}

// Insert a photos row; drops edit_recipe (and remembers to) if the column isn't there or writable.
async function insertPhotoRow(row) {
  const hasRecipe = row.edit_recipe != null && recipeColumn !== false
  const { edit_recipe: _drop, ...plain } = row
  if (hasRecipe) {
    const res = await supabase.from('photos').insert(row).select('id').single()
    if (!res.error) {
      recipeColumn = true
      return res.data
    }
    if (!mentionsRecipe(res.error)) throw res.error
    recipeColumn = false
  }
  return must(await supabase.from('photos').insert(plain).select('id').single())
}

// ---- the three steps --------------------------------------------------------

// 1. The album row, hidden until publishPost() (clients never see a half-uploaded post).
// kind: 'album' | 'before_after'. Returns the album id.
export async function createPostDraft({ providerId, kind = 'album', title, caption, location, shotOn, categoryId }) {
  const album = must(
    await supabase.from('albums').insert({
      provider_id: providerId,
      category_id: categoryId || null,
      title,
      caption: caption || null,
      location_text: location || null,
      shot_on: shotOn || null,
      kind,
      status: 'hidden',
    }).select('id').single(),
  )
  return album.id
}

// 2. One photo: upload the public copy and the untouched original (private bucket), then
// save the photos row. Retries network/server hiccups (`retries`, default 2).
//   item: a File, or { file, display?, settings?, recipe?, pairRole? }
//     file      the original (uploaded as is to portfolio-originals)
//     display   { blob, width, height }: the public copy, ready made (e.g. an edited render
//               from displayFromRender / makeDisplayCopy). Made from `file` when missing.
//     settings  camera settings (readCameraSettings); read from `file` when missing
//     recipe    the edit recipe that produced `display` (saved as photos.edit_recipe if supported)
//     pairRole  'before' | 'after' (before/after posts)
//   position: the photo's place in the post. hiddenFields: camera settings to leave out.
//   originalPath: reuse an original that's already uploaded (two photos made from one file,
//     e.g. a before/after from one edit) instead of uploading it again.
//   onProgress({ stage: 'preparing'|'uploading'|'saving'|'done', fraction 0..1, attempt? }); signal: AbortSignal.
// Returns { photoId, displayPath, originalPath, width, height }. Removes its own files if it fails.
export async function uploadPostPhoto({
  userId, albumId, position = 0, item, hiddenFields = [], originalPath = null, onProgress, signal, retries = 2,
}) {
  const it = item instanceof Blob ? { file: item } : item
  const { file } = it
  const report = (stage, fraction, extra) => onProgress?.({ stage, fraction, ...extra })
  report('preparing', 0)
  const all = it.settings ?? (await readCameraSettings(file))
  const exif = Object.fromEntries(Object.entries(all).filter(([k]) => !hiddenFields.includes(k)))
  const copy = it.display ?? (await makeDisplayCopy(file))
  if (signal?.aborted) throw abortError()

  return withRetries(async () => {
    const key = crypto.randomUUID()
    const displayPath = `${userId}/${albumId}/${key}.jpg`
    const ownOriginal = originalPath ? null : `${userId}/${albumId}/${key}-original.${fileExtension(file)}`
    const uploaded = { portfolio: [], 'portfolio-originals': [] }
    const bytes = copy.blob.size + (ownOriginal ? file.size : 0)
    try {
      report('uploading', 0.05)
      await uploadFile('portfolio', displayPath, copy.blob, 'image/jpeg', (sent) => report('uploading', 0.05 + (0.9 * sent) / bytes), signal)
      uploaded.portfolio.push(displayPath)
      if (ownOriginal) {
        await uploadFile('portfolio-originals', ownOriginal, file, file.type || 'application/octet-stream',
          (sent) => report('uploading', 0.05 + (0.9 * (copy.blob.size + sent)) / bytes), signal)
        uploaded['portfolio-originals'].push(ownOriginal)
      }
      if (signal?.aborted) throw abortError()
      report('saving', 0.95)
      const photo = await insertPhotoRow({
        album_id: albumId,
        owner_id: userId,
        position,
        display_path: displayPath,
        original_path: originalPath || ownOriginal,
        width: copy.width,
        height: copy.height,
        pair_role: it.pairRole || null,
        exif,
        exif_hidden: hiddenFields,
        edit_recipe: it.recipe ?? null,
      })
      report('done', 1)
      return { photoId: photo.id, displayPath, originalPath: originalPath || ownOriginal, width: copy.width, height: copy.height }
    } catch (err) {
      await removeFiles(uploaded).catch(() => {})
      throw err
    }
  }, { retries, signal, onRetry: (attempt) => report('uploading', 0.05, { attempt }) })
}

// 3. Make the post live. coverPhotoId: the cover (the first photo, or the "after").
export async function publishPost(albumId, { coverPhotoId = null } = {}) {
  const patch = { status: 'published', ...(coverPhotoId ? { cover_photo_id: coverPhotoId } : {}) }
  const { error } = await supabase.from('albums').update(patch).eq('id', albumId)
  if (!error) return
  // Already held for review by the server: keep its status, just set the cover.
  if (/being reviewed/i.test(error.message || '') && coverPhotoId) {
    must(await supabase.from('albums').update({ cover_photo_id: coverPhotoId }).eq('id', albumId))
    return
  }
  throw error
}

// Throw away a draft (or any post): its row, photos and files. Never throws for "already gone".
export async function discardPostDraft(albumId) {
  try {
    await deleteAlbum(albumId)
  } catch (err) {
    if (!/already be gone/i.test(err.message || '')) throw err
  }
}

// For each item, the index of the earlier item with the same original file (or itself).
// Two photos made from one file (a before/after from one edit) share one uploaded original.
export function originalOwners(items) {
  const first = new Map()
  return items.map((it, i) => {
    const f = it instanceof Blob ? it : it.file
    if (!first.has(f)) first.set(f, i)
    return first.get(f)
  })
}

// Post an album in one go: draft, every photo (2 at a time), publish. Rolls back on failure.
//
// files: File objects, or items as in uploadPostPhoto ({ file, display?, settings?, recipe?, pairRole? }).
//   In a before/after post, photo 0 is the before and photo 1 the after unless pairRole says otherwise.
//   Items that share the same `file` object upload that original once.
// coverIndex: which photo is the cover (default: the first; the "after" of a before/after).
// onProgress(donePhotos, total) after each photo; onPhotoProgress(index, { stage, fraction })
// as each photo moves through preparing → uploading → saving → done (fraction 0..1, byte-based).
// signal: AbortSignal to cancel (the draft is then removed and the error has .cancelled).
// Returns the album id.
export async function postAlbum({
  userId, providerId, kind = 'album', title, caption, location, shotOn, categoryId, files, hiddenFields = [],
  coverIndex = null, onProgress, onPhotoProgress, signal,
}) {
  const items = files.map((f) => (f instanceof Blob ? { file: f } : f)).map((it, i) => ({
    ...it, pairRole: it.pairRole ?? (kind === 'before_after' ? (i === 0 ? 'before' : 'after') : null),
  }))
  const albumId = await createPostDraft({ providerId, kind, title, caption, location, shotOn, categoryId })
  const owners = originalOwners(items)
  const results = items.map(() => {
    let resolve, reject
    const promise = new Promise((a, b) => { resolve = a; reject = b })
    promise.catch(() => {})
    return { promise, resolve, reject }
  })
  let done = 0
  try {
    await inPool(items, 2, async (item, i) => {
      try {
        const owner = owners[i]
        const originalPath = owner !== i ? (await results[owner].promise).originalPath : null
        const res = await uploadPostPhoto({
          userId, albumId, position: i, item, hiddenFields, originalPath, signal,
          onProgress: (p) => onPhotoProgress?.(i, p),
        })
        results[i].resolve(res)
        onProgress?.(++done, items.length)
      } catch (err) {
        results[i].reject(err)
        throw err
      }
    })
    const photoIds = await Promise.all(results.map((r) => r.promise.then((x) => x.photoId)))
    const cover = coverIndex ?? (kind === 'before_after' ? Math.max(0, items.findIndex((it) => it.pairRole === 'after')) : 0)
    await publishPost(albumId, { coverPhotoId: photoIds[cover] ?? photoIds[0] })
  } catch (err) {
    // Undo: the album row (photos cascade) and the files already uploaded.
    await discardPostDraft(albumId).catch(() => {})
    throw err
  }
  return albumId
}

// ---------------------------------------------------------------------------
// Posting helpers (pure; shared with the Expo app)
// ---------------------------------------------------------------------------

// A title for a post saved without one, from what we know:
// "Wedding in Los Angeles, Sep 2026", "Portrait, Aug 2026", "Wedding", "New post".
export function suggestPostTitle({ service = null, shotOn = '', location = '' } = {}) {
  const what = service || 'New post'
  const city = (location || '').split(',')[0].trim()
  const when = shotOn ? new Date(`${shotOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
  return `${what}${city ? ` in ${city}` : ''}${when ? `, ${when}` : ''}`.slice(0, 120)
}

// Gentle, non-blocking notes about a photo for the composer:
// [{ kind: 'lowres' | 'large' | 'duplicate', text }]. duplicateOf: the 1-based number of the
// photo it duplicates (or null).
export function photoHints({ width = 0, height = 0, size = 0, duplicateOf = null } = {}, { lowResEdge = 1200, largeBytes = 25 * 1024 * 1024 } = {}) {
  const hints = []
  const edge = Math.max(width, height)
  if (edge && edge < lowResEdge) hints.push({ kind: 'lowres', text: `Low resolution (${width} × ${height}): may look soft on big screens` })
  if (size > largeBytes) hints.push({ kind: 'large', text: `Large file (${Math.round(size / (1024 * 1024))} MB): takes a little longer to upload` })
  if (duplicateOf) hints.push({ kind: 'duplicate', text: `Looks like the same photo as #${duplicateOf}` })
  return hints
}

// ---------------------------------------------------------------------------
// Managing posts (owners only; RLS enforces it)
// ---------------------------------------------------------------------------

// Change a post's details. Pass only the fields to change. Returns the fresh album row.
export async function updateAlbum(albumId, { title, caption, location, shotOn, categoryId }) {
  const patch = {}
  if (title !== undefined) patch.title = title.trim()
  if (caption !== undefined) patch.caption = caption.trim() || null
  if (location !== undefined) patch.location_text = location.trim() || null
  if (shotOn !== undefined) patch.shot_on = shotOn || null
  if (categoryId !== undefined) patch.category_id = categoryId || null
  const rows = must(await supabase.from('albums').update(patch).eq('id', albumId).select('id'))
  if (!rows.length) throw new Error('This post couldn’t be changed. It may have been deleted.')
  return getAlbum(albumId)
}

// Delete a post: its row (photos cascade) and its files in both buckets.
// Returns { filesLeft }: files Storage refused to remove (the post itself is gone either way).
export async function deleteAlbum(albumId) {
  const photos = must(await supabase.from('photos').select('display_path, original_path').eq('album_id', albumId))
  const rows = must(await supabase.from('albums').delete().eq('id', albumId).select('id'))
  if (!rows.length) throw new Error('This post couldn’t be deleted. It may already be gone.')
  const filesLeft = await removeFiles({
    portfolio: photos.map((p) => p.display_path).filter(Boolean),
    'portfolio-originals': photos.map((p) => p.original_path).filter(Boolean),
  }).catch(() => photos.length * 2)
  if (filesLeft) console.warn(`deleteAlbum: ${filesLeft} storage file(s) could not be removed for album ${albumId}`)
  return { filesLeft }
}

// Save the order of a photographer's posts (ids first to last).
export async function reorderAlbums(albumIds) {
  const results = await Promise.all(albumIds.map((id, i) => supabase.from('albums').update({ sort_order: i + 1 }).eq('id', id)))
  for (const r of results) must(r)
}

// ---- a post's photos ---------------------------------------------------------

const PHOTO_COLUMNS = 'id, album_id, position, display_path, original_path, width, height, pair_role, exif, exif_hidden'

// A post's photos for editing, in order: [{ id, album_id, position, display_path, original_path,
// width, height, pair_role, exif, exif_hidden, edit_recipe (null when none or not supported), src }].
export async function getPostPhotos(albumId) {
  const withRecipe = await editRecipeSupported()
  const rows = must(
    await supabase.from('photos').select(PHOTO_COLUMNS + (withRecipe ? ', edit_recipe' : '')).eq('album_id', albumId).order('position'),
  )
  return rows.map((r) => ({ ...r, edit_recipe: r.edit_recipe ?? null, src: publicUrl('portfolio', r.display_path) }))
}

// Put a post's photos in this order (photo ids, first to last); the first becomes the cover
// (except in a before/after, whose cover stays the "after").
export async function reorderPostPhotos(albumId, photoIds, { kind = 'album' } = {}) {
  const results = await Promise.all(photoIds.map((id, i) => supabase.from('photos').update({ position: i }).eq('id', id).eq('album_id', albumId)))
  for (const r of results) must(r)
  if (kind !== 'before_after' && photoIds[0]) must(await supabase.from('albums').update({ cover_photo_id: photoIds[0] }).eq('id', albumId))
}

// Make a photo the cover: it moves to the front (the cover is always the first photo).
export const setPostCover = (albumId, photoIds, coverId) =>
  reorderPostPhotos(albumId, [coverId, ...photoIds.filter((id) => id !== coverId)])

// Replace one photo of a post with a new file (same place, same before/after role, same
// hidden camera settings). item: as in uploadPostPhoto (File or { file, display?, settings?, recipe? }).
// photo: the row being replaced (from getPostPhotos). photos: all of the post's rows (to keep
// an original another photo still uses). Returns the new photo's { photoId, ... }.
export async function replacePostPhoto({ userId, albumId, photo, photos = [], item, onProgress, signal }) {
  const it = item instanceof Blob ? { file: item } : item
  const res = await uploadPostPhoto({
    userId, albumId, position: photo.position, hiddenFields: photo.exif_hidden || [], onProgress, signal,
    item: { ...it, pairRole: photo.pair_role || null },
  })
  // Keep the cover pointing at this spot, then drop the old row and its files.
  await supabase.from('albums').update({ cover_photo_id: res.photoId }).eq('id', albumId).eq('cover_photo_id', photo.id)
  must(await supabase.from('photos').delete().eq('id', photo.id))
  const originalShared = photos.some((p) => p.id !== photo.id && p.original_path && p.original_path === photo.original_path)
  await removeFiles({ portfolio: [photo.display_path], 'portfolio-originals': originalShared ? [] : [photo.original_path] }).catch(() => {})
  return res
}

// Remove one photo from a post (posts keep at least one photo; a before/after keeps both).
export async function removePostPhoto(albumId, photo, photos = []) {
  if (photos.length && photos.length <= 1) throw new Error('A post needs at least one photo. Delete the post instead.')
  must(await supabase.from('photos').delete().eq('id', photo.id).eq('album_id', albumId))
  const rest = photos.filter((p) => p.id !== photo.id)
  if (rest[0]) await supabase.from('albums').update({ cover_photo_id: rest[0].id }).eq('id', albumId).is('cover_photo_id', null)
  const originalShared = rest.some((p) => p.original_path && p.original_path === photo.original_path)
  await removeFiles({ portfolio: [photo.display_path], 'portfolio-originals': originalShared ? [] : [photo.original_path] }).catch(() => {})
}

// Turn a post into a before & after (exactly two photos: beforeId and afterId) or back into
// a plain post (toKind 'album'; photoIds = the order to keep, default after then before).
export async function convertPost(albumId, toKind, { beforeId = null, afterId = null, photoIds = null } = {}) {
  if (toKind === 'before_after') {
    if (!beforeId || !afterId || beforeId === afterId) throw new Error('Pick a before and an after photo.')
    const results = await Promise.all([
      supabase.from('photos').update({ pair_role: 'before', position: 0 }).eq('id', beforeId).eq('album_id', albumId),
      supabase.from('photos').update({ pair_role: 'after', position: 1 }).eq('id', afterId).eq('album_id', albumId),
    ])
    for (const r of results) must(r)
    must(await supabase.from('albums').update({ kind: 'before_after', cover_photo_id: afterId }).eq('id', albumId))
    return
  }
  const order = photoIds || [afterId, beforeId].filter(Boolean)
  const results = await Promise.all(order.map((id, i) => supabase.from('photos').update({ pair_role: null, position: i }).eq('id', id).eq('album_id', albumId)))
  for (const r of results) must(r)
  must(await supabase.from('albums').update({ kind: 'album', cover_photo_id: order[0] || null }).eq('id', albumId))
}

// Occasion tags on posts are stored as album tags 'occasion-<slug>'. Setting them (and post
// credits) was archived with the event platform; old posts still show their occasion tag.
const OCCASION_PREFIX = 'occasion-'
