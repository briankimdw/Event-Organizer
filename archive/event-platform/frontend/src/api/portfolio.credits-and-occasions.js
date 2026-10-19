// Archived in the photography pivot (2026-10-18): post occasions and post credits
// ("tag the other vendors who worked an event"), cut from frontend/src/api/portfolio.js.
// Not built. To restore, paste these back into api/portfolio.js and re-add `credits`
// to listAlbums / getAlbum (withCredits) and `occasion` / `credits` to postAlbum / updateAlbum.
// Needs: supabase, must, avatarUrl, nounTitle, getOccasion, ALBUM_COLUMNS, toViewerAlbum (see portfolio.js).

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
    .select(`album_id, role, created_at, provider:providers!album_credits_provider_id_fkey(${VENDOR_COLUMNS})`)
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
    .select(`created_at, album:albums!album_credits_album_id_fkey(${ALBUM_COLUMNS}, by:providers!albums_provider_id_fkey(id, display_name, status))`)
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
