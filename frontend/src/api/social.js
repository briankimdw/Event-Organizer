// Follows, the shortlist (saved photographers) and photo collections.
import { supabase } from '../lib/supabase.js'
import { photoUrl } from '../lib/format.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const viewer = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null

// ---- follows ----------------------------------------------------------------
export async function listFollowing() {
  const uid = await viewer()
  if (!uid) return []
  return must(await supabase.from('follows').select('provider_id').eq('follower_id', uid)).map((r) => r.provider_id)
}
export const follow = async (providerId) => must(await supabase.from('follows').insert({ provider_id: providerId }))
export const unfollow = async (providerId) => {
  const uid = await viewer()
  must(await supabase.from('follows').delete().eq('follower_id', uid).eq('provider_id', providerId))
}

// ---- shortlist (saved photographers) ------------------------------------------
export async function listShortlist() {
  const uid = await viewer()
  if (!uid) return []
  return must(await supabase.from('saved_providers').select('provider_id, created_at').eq('user_id', uid).order('created_at', { ascending: false })).map(
    (r) => r.provider_id,
  )
}
export const addToShortlist = async (providerId) => must(await supabase.from('saved_providers').insert({ provider_id: providerId }))
export const removeFromShortlist = async (providerId) => {
  const uid = await viewer()
  must(await supabase.from('saved_providers').delete().eq('user_id', uid).eq('provider_id', providerId))
}

// ---- collections (saved photos) ------------------------------------------------
// [{ id, name, count, cover, photoIds }]
export async function listCollections() {
  const uid = await viewer()
  if (!uid) return []
  const rows = must(
    await supabase
      .from('collections')
      .select('id, name, created_at, items:collection_items(photo_id, created_at, photo:photos(display_path))')
      .eq('owner_id', uid)
      .order('created_at', { ascending: true }),
  )
  return rows.map((c) => {
    const items = [...(c.items || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return {
      id: c.id,
      name: c.name,
      count: items.length,
      cover: photoUrl(items[0]?.photo?.display_path),
      photos: items.map((i) => ({ id: i.photo_id, src: photoUrl(i.photo?.display_path) })),
      photoIds: items.map((i) => i.photo_id),
    }
  })
}

export async function createCollection(name) {
  return must(await supabase.from('collections').insert({ name }).select('id, name').single())
}

export const addToCollection = async (collectionId, photoId) =>
  must(await supabase.from('collection_items').upsert({ collection_id: collectionId, photo_id: photoId }, { ignoreDuplicates: true }))

export const removeFromCollection = async (collectionId, photoId) =>
  must(await supabase.from('collection_items').delete().eq('collection_id', collectionId).eq('photo_id', photoId))

// The default "Saved" collection (created the first time it's needed).
export async function defaultCollection() {
  const uid = await viewer()
  const existing = must(await supabase.from('collections').select('id, name').eq('owner_id', uid).eq('name', 'Saved').maybeSingle())
  return existing || createCollection('Saved')
}

// Photo ids in any of my collections.
export async function listSavedPhotoIds() {
  const uid = await viewer()
  if (!uid) return []
  const rows = must(await supabase.from('collection_items').select('photo_id, collection:collections!inner(owner_id)').eq('collection.owner_id', uid))
  return [...new Set(rows.map((r) => r.photo_id))]
}

// Photo ids I've liked (in Discover or a gallery).
export async function listLikedPhotoIds() {
  const uid = await viewer()
  if (!uid) return []
  const rows = must(await supabase.from('swipes').select('photo_id').eq('user_id', uid).eq('action', 'like').not('photo_id', 'is', null).limit(1000))
  return [...new Set(rows.map((r) => r.photo_id))]
}
