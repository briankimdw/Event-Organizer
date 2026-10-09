// Data layer for photographer listings and portfolio albums. Screens call these
// functions instead of talking to Supabase directly.
import { supabase } from '../lib/supabase.js'
import { fileExtension, makeDisplayCopy, readCameraSettings } from '../lib/images.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl

// ---------------------------------------------------------------------------
// Photographer listing
// ---------------------------------------------------------------------------

// The signed-in user's photographer listing, or null if they haven't set one up.
export async function getMyProvider(userId) {
  return must(await supabase.from('providers').select('*').eq('profile_id', userId).maybeSingle())
}

// Services under Photography (Wedding, Graduation, ...), in display order.
export async function getPhotographyServices() {
  const rows = must(await supabase.from('service_categories').select('id, slug, name, kind, parent_id, sort_order').order('sort_order'))
  const photography = rows.find((c) => c.slug === 'photography')
  return rows.filter((c) => c.parent_id === photography?.id)
}

// Category ids a photographer offers (provider_services), e.g. to pre-pick a post's category.
export async function getProviderServiceIds(providerId) {
  const rows = must(await supabase.from('provider_services').select('category_id').eq('provider_id', providerId))
  return rows.map((r) => r.category_id)
}

// Create the listing (active straight away), and record which services it offers.
export async function becomeProvider({ displayName, slug, city, serviceIds }) {
  const provider = must(await supabase.rpc('become_provider', {
    p_display_name: displayName,
    p_slug: slug,
    p_vertical_slug: 'photography',
    p_city: city || null,
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
  'photos!photos_album_id_fkey(id, position, display_path, width, height, pair_role, exif, auto_tags)'

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

// A photographer's albums (everyone sees published ones; owners see all of theirs).
export async function listAlbums(providerId) {
  return listMyAlbums(providerId)
}

export async function getAlbum(albumId) {
  return must(await supabase.from('albums').select(ALBUM_COLUMNS).eq('id', albumId).order('position', { referencedTable: 'photos' }).maybeSingle())
}

const prettyDate = (iso) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

// Shape a database album for the full-screen AlbumViewer.
// Also carries the raw fields the owner's edit sheet needs (shotOn, categoryId, kind).
export function toViewerAlbum(a) {
  const photos = [...(a.photos || [])].sort((x, y) => x.position - y.position)
  // SigLIP tags shared by the album's photos, most common first.
  const tagCounts = new Map()
  for (const p of photos) for (const t of p.auto_tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
  const shared = {
    id: a.id, providerId: a.provider_id, title: a.title, caption: a.caption, location: a.location_text,
    date: prettyDate(a.shot_on || a.created_at), genre: a.category?.name, status: a.status,
    shotOn: a.shot_on || '', categoryId: a.category_id ?? null, kind: a.kind, photoCount: photos.length,
    tags: [], autoTags: [...tagCounts.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t).slice(0, 6), realPhoto: false,
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
  return new Error(message || `Upload failed (${status}).`)
}

// Upload one file to Storage, reporting bytes sent. Uses XHR (fetch can't report
// upload progress); falls back to supabase-js if the request can't be made at all.
async function uploadFile(bucket, path, body, contentType, onBytes) {
  const { data } = await supabase.auth.getSession() // refreshes the token if it's about to expire
  const token = data.session?.access_token
  if (!token) throw new Error('You’re signed out. Sign in again to post.')
  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${STORAGE_URL}/object/${bucket}/${path}`)
      xhr.setRequestHeader('authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', API_KEY)
      xhr.setRequestHeader('content-type', contentType)
      xhr.setRequestHeader('cache-control', 'max-age=3600')
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.upload.onprogress = (e) => e.lengthComputable && onBytes?.(Math.min(e.loaded, body.size))
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(storageError(xhr.status, xhr.responseText)))
      xhr.onerror = () => reject(Object.assign(new Error('network'), { network: true }))
      xhr.send(body)
    })
  } catch (err) {
    if (!err.network) throw err
    // XHR couldn't connect: try once more the standard way (no byte progress).
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType })
    if (error) throw new Error('Network problem while uploading. Check your connection and try again.')
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

// Remove storage files; returns how many could not be removed. (Storage only
// deletes files the user can also *read* through the API.)
async function removeFiles(byBucket) {
  let left = 0
  for (const [bucket, paths] of Object.entries(byBucket)) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { data, error } = await supabase.storage.from(bucket).remove(chunk)
      left += error ? chunk.length : chunk.length - (data?.length ?? 0)
    }
  }
  return left
}

// Post an album: create the row, then for each photo upload a public copy
// (resized, metadata stripped) and the untouched original (private bucket),
// and save the photo row with its camera settings. Rolls back on failure.
//
// files: File objects, or { file, display?, settings? } where display ({ blob, width, height },
// from makeDisplayCopy) and settings (from readCameraSettings) were prepared ahead of time.
// onProgress(donePhotos, total) after each photo; onPhotoProgress(index, { stage, fraction })
// as each photo moves through preparing → uploading → saving → done (fraction 0..1, byte-based).
export async function postAlbum({
  userId, providerId, kind, title, caption, location, shotOn, categoryId, files, hiddenFields = [], onProgress, onPhotoProgress,
}) {
  const items = files.map((f) => (f instanceof Blob ? { file: f } : f))
  const album = must(
    await supabase.from('albums').insert({
      provider_id: providerId,
      category_id: categoryId || null,
      title,
      caption: caption || null,
      location_text: location || null,
      shot_on: shotOn || null,
      kind,
    }).select('id').single(),
  )

  const uploaded = { portfolio: [], 'portfolio-originals': [] }
  const photoIds = []
  let done = 0
  try {
    await inPool(items, 2, async ({ file, display, settings }, i) => {
      const report = (stage, fraction) => onPhotoProgress?.(i, { stage, fraction })
      report('preparing', 0)
      const all = settings ?? (await readCameraSettings(file))
      const exif = Object.fromEntries(Object.entries(all).filter(([k]) => !hiddenFields.includes(k)))
      const copy = display ?? (await makeDisplayCopy(file))
      const key = crypto.randomUUID()
      const displayPath = `${userId}/${album.id}/${key}.jpg`
      const originalPath = `${userId}/${album.id}/${key}-original.${fileExtension(file)}`
      const bytes = copy.blob.size + file.size
      report('uploading', 0.05)

      await uploadFile('portfolio', displayPath, copy.blob, 'image/jpeg', (sent) => report('uploading', 0.05 + (0.9 * sent) / bytes))
      uploaded.portfolio.push(displayPath)
      await uploadFile('portfolio-originals', originalPath, file, file.type || 'application/octet-stream',
        (sent) => report('uploading', 0.05 + (0.9 * (copy.blob.size + sent)) / bytes))
      uploaded['portfolio-originals'].push(originalPath)

      report('saving', 0.95)
      const photo = must(
        await supabase.from('photos').insert({
          album_id: album.id,
          owner_id: userId,
          position: i,
          display_path: displayPath,
          original_path: originalPath,
          width: copy.width,
          height: copy.height,
          pair_role: kind === 'before_after' ? (i === 0 ? 'before' : 'after') : null,
          exif,
          exif_hidden: hiddenFields,
        }).select('id').single(),
      )
      photoIds[i] = photo.id
      report('done', 1)
      onProgress?.(++done, items.length)
    })
    const coverId = kind === 'before_after' ? photoIds[1] ?? photoIds[0] : photoIds[0]
    must(await supabase.from('albums').update({ cover_photo_id: coverId }).eq('id', album.id))
    return album.id
  } catch (err) {
    // Undo: the album row (photos cascade) and any files already uploaded.
    await supabase.from('albums').delete().eq('id', album.id)
    await removeFiles(uploaded).catch(() => {})
    throw err
  }
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
