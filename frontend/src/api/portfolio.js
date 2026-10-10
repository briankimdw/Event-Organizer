// Data layer for photographer listings and portfolio albums. Screens call these
// functions instead of talking to Supabase directly.
import { supabase } from '../lib/supabase.js'
import { fileExtension, makeDisplayCopy, readCameraSettings } from '../lib/images.js'
import { avatarUrl } from '../lib/format.js'
import { getOccasion, getVertical, nounTitle } from '../verticals/index.js'

// Bookings a new listing can hold at the same time when its vertical serves
// several events at once (caterers, rentals). Owners can change it later.
const DEFAULT_CONCURRENT = 3

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export const publicUrl = (bucket, path) => supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl

// ---------------------------------------------------------------------------
// Photographer listing
// ---------------------------------------------------------------------------

// All of the signed-in user's listings (one per vertical), oldest first.
// Each is a providers row plus `vertical` (slug).
export async function getMyProviders(userId) {
  if (!userId) return []
  const rows = must(
    await supabase
      .from('providers')
      .select('*, vertical:service_categories!providers_vertical_id_fkey(slug)')
      .eq('profile_id', userId)
      .order('created_at'),
  )
  return rows.map((r) => ({ ...r, vertical: r.vertical?.slug || 'photography' }))
}

// One of the user's listings, or null if they haven't set one up.
// `pick`: a provider id or vertical slug to prefer; otherwise the oldest listing.
export async function getMyProvider(userId, pick = null) {
  const all = await getMyProviders(userId)
  return all.find((p) => p.id === pick || p.vertical === pick) || all[0] || null
}

// Services under a vertical (Wedding, Graduation, ... for photography), in display order: [{ id, slug, name, ... }].
export async function getServicesOf(vertical = 'photography') {
  const rows = must(await supabase.from('service_categories').select('id, slug, name, kind, parent_id, sort_order').eq('is_active', true).order('sort_order'))
  const parent = rows.find((c) => c.slug === vertical)
  return parent ? rows.filter((c) => c.parent_id === parent.id) : []
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

// Create a listing in a vertical (active straight away), and record which services it offers.
// A user can have one listing per vertical.
export async function becomeProvider({ displayName, slug, city, serviceIds = [], vertical = 'photography', bio = null }) {
  const provider = must(await supabase.rpc('become_provider', {
    p_display_name: displayName,
    p_slug: slug,
    p_vertical_slug: vertical,
    p_city: city || null,
    p_bio: bio || null,
  }))
  if (serviceIds.length) {
    must(await supabase.from('provider_services').insert(serviceIds.map((category_id) => ({ provider_id: provider.id, category_id }))))
  }
  // max_concurrent only exists once the all-verticals migration is applied, and
  // only concurrent verticals need it (they don't exist before that migration).
  const changes = getVertical(vertical)?.concurrent ? { status: 'active', max_concurrent: DEFAULT_CONCURRENT } : { status: 'active' }
  return must(await supabase.from('providers').update(changes).eq('id', provider.id).select().single())
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

// A provider's albums (everyone sees published ones; owners see all of theirs),
// each with `credits` (the vendors tagged on it; [] until the credits migration is applied).
export async function listAlbums(providerId) {
  return withCredits(await listMyAlbums(providerId))
}

export async function getAlbum(albumId) {
  const row = must(await supabase.from('albums').select(ALBUM_COLUMNS).eq('id', albumId).order('position', { referencedTable: 'photos' }).maybeSingle())
  return row ? (await withCredits([row]))[0] : row
}

const prettyDate = (iso) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

// Shape a database album for the full-screen AlbumViewer.
// Also carries the raw fields the owner's edit sheet needs (shotOn, categoryId, kind, occasion).
// occasion: { slug, name } | null. credits: [{ providerId, name, avatar, vertical, role, label }].
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
    occasion: occasionTag ? { slug: occasionSlug, name: getOccasion(occasionSlug)?.name || occasionTag.name } : null,
    credits: a.credits || [],
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
// occasion: an OCCASIONS slug or null. credits: [{ providerId, role? }] (other vendors at the event).
// Both are saved once the post is up; if that fails (or credits aren't in the database yet),
// the post stays and the problem is only logged.
export async function postAlbum({
  userId, providerId, kind, title, caption, location, shotOn, categoryId, files, hiddenFields = [], onProgress, onPhotoProgress,
  occasion = null, credits = [],
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
  } catch (err) {
    // Undo: the album row (photos cascade) and any files already uploaded.
    await supabase.from('albums').delete().eq('id', album.id)
    await removeFiles(uploaded).catch(() => {})
    throw err
  }
  const extras = await Promise.allSettled([
    occasion ? setAlbumOccasion(album.id, occasion) : null,
    credits.length ? setAlbumCredits(album.id, credits) : null,
  ])
  for (const r of extras) if (r.status === 'rejected') console.warn('postAlbum: the post is up, but not its occasion / credits', r.reason)
  return album.id
}

// ---------------------------------------------------------------------------
// Managing posts (owners only; RLS enforces it)
// ---------------------------------------------------------------------------

// Change a post's details. Pass only the fields to change. Returns the fresh album row (with credits).
// occasion: slug, or null for none. credits: [{ providerId, role? }], replaces the list.
export async function updateAlbum(albumId, { title, caption, location, shotOn, categoryId, occasion, credits }) {
  const patch = {}
  if (title !== undefined) patch.title = title.trim()
  if (caption !== undefined) patch.caption = caption.trim() || null
  if (location !== undefined) patch.location_text = location.trim() || null
  if (shotOn !== undefined) patch.shot_on = shotOn || null
  if (categoryId !== undefined) patch.category_id = categoryId || null
  const rows = must(await supabase.from('albums').update(patch).eq('id', albumId).select('id'))
  if (!rows.length) throw new Error('This post couldn’t be changed. It may have been deleted.')
  if (occasion !== undefined) await setAlbumOccasion(albumId, occasion)
  if (credits !== undefined && !creditsMissing) await setAlbumCredits(albumId, credits)
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

// ---------------------------------------------------------------------------
// Occasion: stored as an album tag 'occasion-<slug>' (no new column needed)
// ---------------------------------------------------------------------------

const OCCASION_PREFIX = 'occasion-'

// The tag id for an occasion, creating the tag the first time (signed-in users may add 'user' tags).
async function occasionTagId(slug) {
  const tagSlug = `${OCCASION_PREFIX}${slug}`
  const find = async () => must(await supabase.from('tags').select('id').eq('slug', tagSlug).maybeSingle())?.id
  const found = await find()
  if (found) return found
  const { data, error } = await supabase.from('tags').insert({ slug: tagSlug, name: getOccasion(slug)?.name || slug, kind: 'user' }).select('id').single()
  if (!error) return data.id
  if (error.code === '23505') return find() // created by someone else at the same moment
  throw error
}

// Set a post's occasion (an OCCASIONS slug), or clear it with null.
export async function setAlbumOccasion(albumId, slug) {
  const rows = must(await supabase.from('album_tags').select('tag_id, tag:tags(slug)').eq('album_id', albumId))
  const old = rows.filter((r) => r.tag?.slug?.startsWith(OCCASION_PREFIX)).map((r) => r.tag_id)
  const tagId = slug ? await occasionTagId(slug) : null
  const drop = old.filter((id) => id !== tagId)
  if (drop.length) must(await supabase.from('album_tags').delete().eq('album_id', albumId).in('tag_id', drop))
  if (tagId && !old.includes(tagId)) must(await supabase.from('album_tags').insert({ album_id: albumId, tag_id: tagId }))
}

// ---------------------------------------------------------------------------
// Credits: other vendors tagged on a post (table album_credits, migration
// 20261011000200_post_credits.sql). Until that migration is applied, reads
// return no credits and creditsSupported() is false, so screens hide them.
// ---------------------------------------------------------------------------

let creditsMissing = false
const isMissingTable = (err) =>
  !!err && (err.code === 'PGRST205' || err.code === '42P01' || (/album_credits/.test(err.message || '') && /schema cache|does not exist|could not find/i.test(err.message || '')))

const VENDOR_COLUMNS = 'id, display_name, slug, city, status, vertical:service_categories!providers_vertical_id_fkey(slug), profile:profiles!providers_profile_id_fkey(avatar_path)'

// A providers row (VENDOR_COLUMNS) as a small vendor for pickers and chips.
const toVendor = (p) => {
  const vertical = p.vertical?.slug || 'photography'
  return { id: p.id, name: p.display_name, slug: p.slug, city: p.city || null, vertical, label: nounTitle(vertical), avatar: avatarUrl(p.profile?.avatar_path, p.display_name) }
}

// A credit as screens use it: { providerId, name, avatar, vertical, role, label } (label: the role, else e.g. 'Photographer').
const toCredit = (row) => {
  const v = toVendor(row.provider)
  return { providerId: v.id, name: v.name, avatar: v.avatar, vertical: v.vertical, role: row.role || null, label: row.role || v.label }
}

/** Is the credits table there? Cached; false until the migration is applied. */
export async function creditsSupported() {
  if (creditsMissing) return false
  const { error } = await supabase.from('album_credits').select('album_id').limit(1)
  if (isMissingTable(error)) creditsMissing = true
  return !creditsMissing
}

/** Credits of several posts: Map(albumId -> [credit]). Empty when the table isn't there. */
export async function listCredits(albumIds) {
  const out = new Map()
  const ids = [...new Set(albumIds.filter(Boolean))]
  if (!ids.length || creditsMissing) return out
  const { data, error } = await supabase
    .from('album_credits')
    .select(`album_id, role, created_at, provider:providers(${VENDOR_COLUMNS})`)
    .in('album_id', ids)
    .order('created_at')
  if (error) {
    if (isMissingTable(error)) creditsMissing = true
    else console.warn('listCredits', error)
    return out
  }
  for (const row of data || []) {
    if (!row.provider) continue // that listing isn't active any more
    if (!out.has(row.album_id)) out.set(row.album_id, [])
    out.get(row.album_id).push(toCredit(row))
  }
  return out
}

// Album rows with `credits` attached (one extra query; credits never make the load fail).
async function withCredits(rows) {
  const credits = await listCredits(rows.map((r) => r.id)).catch(() => new Map())
  return rows.map((r) => ({ ...r, credits: credits.get(r.id) || [] }))
}

/** Replace a post's credits. credits: [{ providerId, role? }]. Throws if the table isn't there. */
export async function setAlbumCredits(albumId, credits) {
  const list = [...new Map(credits.filter((c) => c?.providerId).map((c) => [c.providerId, c])).values()]
  const del = await supabase.from('album_credits').delete().eq('album_id', albumId)
  if (isMissingTable(del.error)) {
    creditsMissing = true
    throw new Error('Credits aren’t available yet.')
  }
  must(del)
  if (!list.length) return
  must(await supabase.from('album_credits').insert(list.map((c) => ({ album_id: albumId, provider_id: c.providerId, role: c.role?.trim() || null }))))
}

/**
 * Vendors to credit on a post (the Credits picker): active listings whose name contains `q`,
 * best rated first (with no query: the top ones). exclude: provider ids to leave out.
 * Returns [{ id, name, slug, city, vertical, label, avatar }].
 */
export async function searchVendors(q = '', { exclude = [], limit = 12 } = {}) {
  let query = supabase.from('providers').select(VENDOR_COLUMNS).eq('status', 'active')
  const term = q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)
  if (term) query = query.ilike('display_name', `%${term}%`)
  const rows = must(await query.order('rating_count', { ascending: false }).order('display_name').limit(limit + exclude.length))
  return rows.filter((r) => !exclude.includes(r.id)).slice(0, limit).map(toVendor)
}

/**
 * Posts by other vendors that credit this provider ("Tagged in"), newest first, as viewer
 * albums plus `by` ({ id, name }: who posted it). [] until the credits migration is applied.
 */
export async function listTaggedAlbums(providerId, { limit = 24 } = {}) {
  if (!providerId || creditsMissing) return []
  const { data, error } = await supabase
    .from('album_credits')
    .select(`created_at, album:albums(${ALBUM_COLUMNS}, by:providers!albums_provider_id_fkey(id, display_name, status))`)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isMissingTable(error)) creditsMissing = true
    else console.warn('listTaggedAlbums', error)
    return []
  }
  const albums = (data || []).map((r) => r.album).filter((a) => a && a.status === 'published' && a.by?.status === 'active' && a.photos?.length)
  const rows = await withCredits(albums)
  return rows.map((a) => ({ ...toViewerAlbum(a), by: { id: a.by.id, name: a.by.display_name } }))
}
