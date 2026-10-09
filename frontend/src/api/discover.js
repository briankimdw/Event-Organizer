// Discover: the personalised photo feed (discover_feed in the database, ranked
// with SigLIP embeddings), swipe logging, the taste profile and "Not into this".
import { supabase } from '../lib/supabase.js'
import { exifLine, photoUrl } from '../lib/format.js'
import { invalidate, listProviders } from './catalog.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const viewer = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null

// Cards for the swipe deck. category: a service slug ('wedding') or null for all.
// Each card: { id, photoId, albumId, authorId, provider, title, category, photos: [{ id, src, exif }],
//              tags, reason, exploration, exif }  (photos[0] is the photo the feed picked)
export async function getFeed({ limit = 20, category = null } = {}) {
  const rows = must(await supabase.rpc('discover_feed', { p_limit: limit, p_category: category }))
  if (!rows.length) return []
  const [albums, providers] = await Promise.all([
    supabase
      .from('albums')
      .select('id, title, kind, category:service_categories(name, slug), photos!photos_album_id_fkey(id, display_path, position, exif, pair_role)')
      .in('id', [...new Set(rows.map((r) => r.album_id))])
      .then(must),
    listProviders(),
  ])
  const albumById = new Map(albums.map((a) => [a.id, a]))
  const providerById = new Map(providers.map((p) => [p.id, p]))
  return rows
    .filter((r) => providerById.has(r.provider_id))
    .map((r) => {
      const album = albumById.get(r.album_id)
      const photos = [...(album?.photos || [])]
        .filter((p) => album?.kind !== 'before_after' || p.pair_role !== 'before')
        .sort((a, b) => a.position - b.position)
      // The picked photo first, then the rest of the album (up to 5 total).
      const ordered = [photos.find((p) => p.id === r.photo_id), ...photos.filter((p) => p.id !== r.photo_id)].filter(Boolean).slice(0, 5)
      const first = ordered[0]
      return {
        id: r.photo_id,
        photoId: r.photo_id,
        albumId: r.album_id,
        authorId: r.provider_id,
        provider: providerById.get(r.provider_id),
        title: r.album_title,
        category: album?.category?.name ?? null,
        categorySlug: album?.category?.slug ?? null,
        photos: ordered.map((p) => ({ id: p.id, src: photoUrl(p.display_path), exif: p.exif || {} })),
        tags: r.auto_tags || [],
        reason: r.reason,
        exploration: r.exploration,
        score: r.score,
        exif: exifLine(first?.exif),
      }
    })
}

// Record a swipe: action 'like' | 'pass' | 'save'. Signed-out swipes aren't saved.
// Returns the swipe id (for undo) or null.
export async function logSwipe(card, action, { dwellMs = null, position = null } = {}) {
  if (!(await viewer())) return null
  const row = must(
    await supabase
      .from('swipes')
      .insert({
        photo_id: card.photoId,
        album_id: card.albumId,
        provider_id: card.authorId,
        action,
        dwell_ms: dwellMs == null ? null : Math.round(dwellMs),
        position,
        reason_shown: card.reason ?? null,
      })
      .select('id')
      .single(),
  )
  invalidate('matches')
  return row.id
}

export async function undoSwipe(swipeId) {
  if (swipeId == null) return
  must(await supabase.from('swipes').delete().eq('id', swipeId))
  invalidate('matches')
}

// Like a photo outside the deck (e.g. in a gallery). Same signal as a right swipe.
export const likePhoto = (photo) => logSwipe({ photoId: photo.photoId ?? photo.id, albumId: photo.albumId, authorId: photo.providerId }, 'like')

// What the taste model has learned: { swipes, likes, styles: [{ tag, weight 0..1 }], corrections: [tag] }
export async function getTasteProfile() {
  const uid = await viewer()
  if (!uid) return { swipes: 0, likes: 0, styles: [], corrections: [] }
  const [swipes, corrections] = await Promise.all([
    supabase.from('swipes').select('action, photo:photos(auto_tags)').eq('user_id', uid).order('created_at', { ascending: false }).limit(300).then(must),
    supabase.from('taste_corrections').select('value').eq('user_id', uid).eq('kind', 'tag').then(must),
  ])
  const counts = new Map()
  let likes = 0
  for (const s of swipes) {
    if (s.action === 'pass') continue
    likes++
    for (const t of s.photo?.auto_tags || []) counts.set(t, (counts.get(t) || 0) + 1)
  }
  const top = Math.max(1, ...counts.values())
  const styles = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, n]) => ({ tag, weight: Math.round((n / top) * 100) / 100 }))
  return { swipes: swipes.length, likes, styles, corrections: corrections.map((c) => c.value) }
}

// "Not into this": hide photos with these auto-tags from Discover.
export async function addCorrections(tags) {
  const uid = await viewer()
  if (!uid || !tags.length) return
  must(await supabase.from('taste_corrections').upsert(tags.map((value) => ({ user_id: uid, kind: 'tag', value })), { onConflict: 'user_id,kind,value', ignoreDuplicates: true }))
}

export async function removeCorrection(tag) {
  const uid = await viewer()
  if (!uid) return
  must(await supabase.from('taste_corrections').delete().eq('user_id', uid).eq('kind', 'tag').eq('value', tag))
}

// Every auto-tag in use, most common first (for the "Not into this" picker and filters).
export async function popularTags(limit = 30) {
  const rows = must(await supabase.from('photos').select('auto_tags').not('auto_tags', 'is', null).limit(1000))
  const counts = new Map()
  for (const r of rows) for (const t of r.auto_tags || []) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag)
}
