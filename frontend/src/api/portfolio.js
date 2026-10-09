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
  'id, provider_id, title, caption, location_text, shot_on, kind, status, created_at, category:service_categories(name, slug), ' +
  'photos!photos_album_id_fkey(id, position, display_path, width, height, pair_role, exif, auto_tags)'

export async function listMyAlbums(providerId) {
  return must(
    await supabase
      .from('albums')
      .select(ALBUM_COLUMNS)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .order('position', { referencedTable: 'photos' }),
  )
}

// A photographer's albums, newest first (everyone sees published ones; owners see all of theirs).
export async function listAlbums(providerId) {
  return listMyAlbums(providerId)
}

export async function getAlbum(albumId) {
  return must(await supabase.from('albums').select(ALBUM_COLUMNS).eq('id', albumId).order('position', { referencedTable: 'photos' }).maybeSingle())
}

const prettyDate = (iso) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

// Shape a database album for the full-screen AlbumViewer.
export function toViewerAlbum(a) {
  const photos = [...(a.photos || [])].sort((x, y) => x.position - y.position)
  // SigLIP tags shared by the album's photos, most common first.
  const tagCounts = new Map()
  for (const p of photos) for (const t of p.auto_tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
  const shared = {
    id: a.id, providerId: a.provider_id, title: a.title, caption: a.caption, location: a.location_text,
    date: prettyDate(a.shot_on || a.created_at), genre: a.category?.name, status: a.status,
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

// Post an album: create the row, then for each photo upload a public copy
// (resized, metadata stripped) and the untouched original (private bucket),
// and save the photo row with its camera settings. Rolls back on failure.
export async function postAlbum({ userId, providerId, kind, title, caption, location, shotOn, categoryId, files, hiddenFields = [], onProgress }) {
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
  try {
    let coverId = null
    for (const [i, file] of files.entries()) {
      onProgress?.(i, files.length)
      const settings = await readCameraSettings(file)
      const exif = Object.fromEntries(Object.entries(settings).filter(([k]) => !hiddenFields.includes(k)))
      const { blob, width, height } = await makeDisplayCopy(file)
      const key = crypto.randomUUID()
      const displayPath = `${userId}/${album.id}/${key}.jpg`
      const originalPath = `${userId}/${album.id}/${key}-original.${fileExtension(file)}`

      must(await supabase.storage.from('portfolio').upload(displayPath, blob, { contentType: 'image/jpeg' }))
      uploaded.portfolio.push(displayPath)
      must(await supabase.storage.from('portfolio-originals').upload(originalPath, file, { contentType: file.type || undefined }))
      uploaded['portfolio-originals'].push(originalPath)

      const photo = must(
        await supabase.from('photos').insert({
          album_id: album.id,
          owner_id: userId,
          position: i,
          display_path: displayPath,
          original_path: originalPath,
          width,
          height,
          pair_role: kind === 'before_after' ? (i === 0 ? 'before' : 'after') : null,
          exif,
          exif_hidden: hiddenFields,
        }).select('id').single(),
      )
      if (i === 0 || (kind === 'before_after' && i === 1)) coverId = photo.id
    }
    must(await supabase.from('albums').update({ cover_photo_id: coverId }).eq('id', album.id))
    onProgress?.(files.length, files.length)
    return album.id
  } catch (err) {
    // Undo: the album row (photos cascade) and any files already uploaded.
    await supabase.from('albums').delete().eq('id', album.id)
    for (const [bucket, paths] of Object.entries(uploaded)) {
      if (paths.length) await supabase.storage.from(bucket).remove(paths)
    }
    throw err
  }
}
