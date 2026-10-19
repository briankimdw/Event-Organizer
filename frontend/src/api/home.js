// Data for the browse screens: Home and Discover's Explore grid. Plain JS (no React,
// no DOM) so the Expo app can reuse it.
//
// Fetchers hit Supabase; everything else is a pure function that shapes data the
// screens already have (providers from listProviders, catalog metadata from
// verticals/catalog.js). Nothing here invents data.
//
// Photography only (see verticals/catalog.js): providers come from listProviders(),
// which keeps photo & video listings; posts and photos are filtered to them here too.
// Removed in the photography pivot (the /services and /occasions pages and the vertical
// picker; archived in archive/event-platform/frontend/src/api/home.multi-vertical.js):
//   buildVerticalPage, liveVerticals, buildOccasionChecklist, occasionPrompt, readCovered,
//   writeCovered, deckVerticals, deckChoices, verticalsWithPosts.
import { supabase } from '../lib/supabase.js'
import { fromPriceLabel, money, photoUrl, startingPrice } from '../lib/format.js'
import { addDays, toKey, today } from '../lib/dates.js'
import { cached, listProviders, searchProviders, withMatches } from './catalog.js'
import { LEGACY_VERTICALS, PHOTO_VERTICAL, SERVICE_CHIPS, getService, getVertical, isPhotoVertical, normalizeVertical } from '../verticals/catalog.js'

// Vertical slugs whose posts and photos count (photography and its old aliases).
const PHOTO_SLUGS = [PHOTO_VERTICAL, ...Object.keys(LEGACY_VERTICALS)]

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

// Every active provider, each with `.vertical` (a catalog slug, from api/catalog.js)
// and `.tasteMatch` (% match from Discover swipes, null when unknown).
export const listBrowseProviders = () => listProviders().then(withMatches)

// Providers free on any day of the coming weekend: Map(providerId -> free 'YYYY-MM-DD'[]).
// service: optionally only providers offering it (a vertical slug, from old callers, means everyone).
export async function weekendAvailability(service = null) {
  const rows = await searchProviders({ dates: comingWeekend(), service })
  return new Map(rows.filter((p) => p.freeDates.length).map((p) => [p.id, p.freeDates]))
}

// Portfolio photos (photo & video listings only) for the Explore grid, newest posts first. Each:
// { id, src, width, height, albumId, title, providerId, serviceSlug, serviceName, occasion (slug|null) }
export const listExplorePhotos = ({ limit = 120 } = {}) =>
  cached(`home:explore:${limit}`, async () => {
    const rows = must(
      await supabase
        .from('photos')
        .select('id, display_path, width, height, pair_role, position, album:albums!photos_album_id_fkey!inner(id, title, kind, status, provider_id, created_at, category:service_categories(slug, name), album_tags(tag:tags(slug)), provider:providers!albums_provider_id_fkey!inner(vertical:service_categories!providers_vertical_id_fkey!inner(slug)))')
        .eq('album.status', 'published')
        .in('album.provider.vertical.slug', PHOTO_SLUGS)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
    return rows
      .filter((r) => r.album && r.pair_role !== 'before')
      .map((r) => ({
        id: r.id,
        src: photoUrl(r.display_path),
        width: r.width || 4,
        height: r.height || 5,
        position: r.position ?? 0,
        albumId: r.album.id,
        albumCreatedAt: r.album.created_at,
        title: r.album.title,
        providerId: r.album.provider_id,
        serviceSlug: r.album.category?.slug ?? null,
        serviceName: r.album.category?.name ?? null,
        occasion: occasionOfTags(r.album.album_tags),
      }))
  })

// The occasion slug stored on a post as an album tag 'occasion-<slug>', or null.
export const occasionOfTags = (albumTags = []) => {
  const slug = (albumTags || []).map((t) => t.tag?.slug).find((x) => x?.startsWith('occasion-'))
  return slug ? slug.slice('occasion-'.length) : null
}

// Every published post (album) by an active photo & video provider, newest first: the index
// the Discover deck and its service chips work from. Cached a minute.
// Each: { albumId, providerId, vertical ('photography'), service, serviceName, occasion, title, createdAt, coverPhotoId, coverSrc }
export const listPostIndex = () =>
  cached('home:post-index', async () => {
    const rows = must(
      await supabase
        .from('albums')
        .select('id, title, created_at, cover_photo_id, category:service_categories(slug, name), cover:photos!albums_cover_photo_fk(display_path), provider:providers!albums_provider_id_fkey!inner(id, status, vertical:service_categories!providers_vertical_id_fkey!inner(slug)), album_tags(tag:tags(slug))')
        .eq('status', 'published')
        .eq('provider.status', 'active')
        .in('provider.vertical.slug', PHOTO_SLUGS)
        .order('created_at', { ascending: false })
        .limit(2000),
    )
    return rows.filter((r) => isPhotoVertical(r.provider?.vertical?.slug)).map((r) => ({
      albumId: r.id,
      providerId: r.provider?.id,
      vertical: normalizeVertical(r.provider?.vertical?.slug),
      service: r.category?.slug ?? null,
      serviceName: r.category?.name ?? null,
      occasion: occasionOfTags(r.album_tags),
      title: r.title,
      createdAt: r.created_at,
      coverPhotoId: r.cover_photo_id ?? null,
      coverSrc: photoUrl(r.cover?.display_path),
    }))
  })

// Post counts within a scope, for chips and the picker.
//   posts: listPostIndex(); vertical / service: optional scope ('all' or null = every vertical).
// Returns { total, verticals: { slug: n }, services: { slug: n }, occasions: { slug: n }, providers: Set<providerId> }
// (verticals and providers ignore the scope: they count every post).
export function postFacets(posts = [], { vertical = null, service = null } = {}) {
  const all = !vertical || vertical === 'all'
  const out = { total: 0, verticals: {}, services: {}, occasions: {}, providers: new Set() }
  for (const p of posts) {
    out.verticals[p.vertical] = (out.verticals[p.vertical] || 0) + 1
    out.providers.add(p.providerId)
    if (!all && p.vertical !== vertical) continue
    if (p.service) out.services[p.service] = (out.services[p.service] || 0) + 1
    if (service && p.service !== service) continue
    out.total++
    if (p.occasion) out.occasions[p.occasion] = (out.occasions[p.occasion] || 0) + 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// The coming weekend: this Sat + Sun (just Sunday if today is Sunday).
export function comingWeekend(now = today()) {
  if (now.getDay() === 0) return [now]
  const sat = addDays(now, 6 - now.getDay())
  return [sat, addDays(sat, 1)]
}

export const byRating = (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount
export const byNewest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
export const byMatch = (a, b) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || byRating(a, b)

// True when two lists start with the same providers in the same order (a shelf
// that would just repeat the one above it).
export const sameOrder = (a, b) => a.length > 0 && a.every((p, i) => b[i]?.id === p.id)

// A friendly "under $X" price for a budget shelf (vertical: kept for old callers).
export const budgetCap = (vertical = null) => (vertical?.priceUnit === 'hour' ? 150 : 250)

// Providers whose starting price is at most `cap`, cheapest first.
export const underPrice = (providers, cap) =>
  providers
    .filter((p) => startingPrice(p) != null && startingPrice(p) <= cap)
    .sort((a, b) => startingPrice(a) - startingPrice(b))

// Map(vertical slug -> number of active providers).
export function countByVertical(providers) {
  const counts = new Map()
  for (const p of providers) if (p.vertical) counts.set(p.vertical, (counts.get(p.vertical) || 0) + 1)
  return counts
}

// "from $250", "from $45 / person", or null when nothing is priced.
export const priceFrom = (provider) => fromPriceLabel(provider)

// What a provider does, for card subtitles: their services, else "Photo & video".
// (The second argument, { withVertical }, is kept for old callers; with one vertical it adds nothing.)
export function subtitleOf(provider) {
  const v = getVertical(provider.vertical)
  const specialties = (provider.specialties || []).slice(0, 2).join(' · ')
  return specialties || v?.name || ''
}

// "photographers" style words for copy (lower-cases words, keeps acronyms).
export const pluralLower = (v) => v.plural.replace(/([A-Z])(?=[a-z])/g, (c) => c.toLowerCase())
export const withArticle = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`

// Text for "Know a great photographer? Invite them" shares. (vertical: optional, kept for old callers.)
export function inviteMessage(vertical = null) {
  return {
    title: 'Join me on photomatch',
    text: 'I’d love to book you through photomatch. Photographers and videographers list their work there, and clients find and book them.',
    noun: vertical?.noun || 'photographer',
  }
}

// How many providers offer each browse service (SERVICE_CHIPS), plus how many posts it has
// when `posts` (listPostIndex()) is given: [{ slug, name, kind, icon, providers, posts }],
// catalog order.
export function serviceCounts(providers = [], posts = null) {
  const byProvider = new Map()
  for (const p of providers) for (const s of p.categorySlugs || []) byProvider.set(s, (byProvider.get(s) || 0) + 1)
  const byPost = new Map()
  for (const p of posts || []) if (p.service) byPost.set(p.service, (byPost.get(p.service) || 0) + 1)
  return SERVICE_CHIPS.map((s) => ({ ...s, providers: byProvider.get(s.slug) || 0, posts: byPost.get(s.slug) || 0 }))
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

// The Home feed from real data.
//   providers: listBrowseProviders()   weekend: weekendAvailability()
// Returns { counts, services, shelves } where counts is Map(vertical -> n), services is
// serviceCounts(providers) and each shelf is { key, title, sub, to, layout: 'cards'|'rows',
// items: provider[], empty? }. Shelves: 'match' (signed in, after a few likes), 'weekend',
// 'top', 'budget', 'new' (ones with nothing to show are left out, except 'weekend').
export function buildHomeFeed({ providers = [], weekend = new Map(), weekendLabel = '' }) {
  const shelves = []
  const take = (list, n) => list.slice(0, n)

  const matched = providers.filter((p) => p.tasteMatch != null).sort(byMatch)
  if (matched.length) {
    shelves.push({ key: 'match', title: 'Matched to your taste', sub: 'Based on your Discover swipes', to: '/search', layout: 'cards', items: take(matched, 8) })
  }

  const free = providers.filter((p) => weekend.has(p.id)).map((p) => ({ ...p, freeDates: weekend.get(p.id) })).sort(byMatch)
  shelves.push({
    key: 'weekend',
    title: 'Available this weekend',
    sub: weekendLabel,
    to: `/search?dates=${comingWeekend().map(toKey).join(',')}`,
    layout: 'cards',
    items: take(free, 8),
    empty: 'No photographers have free time this weekend yet.',
  })

  const rated = providers.filter((p) => p.rating != null).sort(byRating)
  if (rated.length && !sameOrder(rated, free)) {
    shelves.push({ key: 'top', title: 'Top rated', sub: 'Loved by clients', to: '/search', layout: 'cards', items: take(rated, 8) })
  }
  const cap = budgetCap()
  const budget = underPrice(providers, cap)
  if (budget.length >= 2) {
    shelves.push({ key: 'budget', title: `Under ${money(cap)}`, sub: 'Great work at a friendly price', to: null, layout: 'cards', items: take(budget, 8) })
  }

  const newest = [...providers].sort(byNewest)
  if (newest.length) shelves.push({ key: 'new', title: 'New on photomatch', sub: 'Recently joined', to: '/search', layout: 'rows', items: take(newest, 4) })

  return { counts: countByVertical(providers), services: serviceCounts(providers), shelves }
}

// ---------------------------------------------------------------------------
// Discover → Explore
// ---------------------------------------------------------------------------

// Photos joined to their providers, interleaved so one provider doesn't fill the
// top of the grid (round-robin by provider, newest first within each).
//   vertical / service / occasion: optional filters (vertical 'all' = every vertical).
export function buildExploreTiles({ photos = [], providers = [], vertical = null, service = null, occasion = null }) {
  if (vertical === 'all') vertical = null
  const byId = new Map(providers.map((p) => [p.id, p]))
  const tiles = photos
    .map((ph) => ({ ...ph, kind: 'photo', provider: byId.get(ph.providerId) }))
    .filter((t) => t.provider && (!vertical || t.provider.vertical === vertical) && (!service || t.serviceSlug === service) && (!occasion || t.occasion === occasion))
  const queues = new Map()
  for (const t of tiles) {
    if (!queues.has(t.providerId)) queues.set(t.providerId, [])
    queues.get(t.providerId).push(t)
  }
  const out = []
  const lists = [...queues.values()]
  for (let i = 0; out.length < tiles.length; i++) for (const q of lists) if (q[i]) out.push(q[i])
  // Display shape (height / width). Most portfolio shots share one shape, which
  // makes a flat grid, so portrait photos get a gently varied crop (Pinterest
  // rhythm); landscape photos keep their own shape.
  return out.map((t, i) => {
    const real = t.height / t.width
    return { ...t, ratio: real >= 1 ? CROPS[i % CROPS.length] : Math.max(0.66, real) }
  })
}
const CROPS = [1.25, 1, 1.4, 1.15, 0.85, 1.3, 1.05]

// Filter chips for Explore: the services (album categories) that have photos, most first:
// { services: [{ slug, name, n }] }. `verticals`, `allVerticals` and `occasions` are always []
// (kept for old callers); `vertical` / `service` arguments are ignored.
export function exploreFilters({ photos = [], providers = [] }) {
  const byId = new Map(providers.map((p) => [p.id, p]))
  const sCounts = new Map()
  for (const ph of photos) {
    if (!byId.has(ph.providerId) || !ph.serviceSlug) continue
    const s = sCounts.get(ph.serviceSlug) || { slug: ph.serviceSlug, name: getService(ph.serviceSlug)?.name || ph.serviceName, n: 0 }
    s.n++
    sCounts.set(ph.serviceSlug, s)
  }
  return { services: [...sCounts.values()].sort((a, b) => b.n - a.n), verticals: [], allVerticals: [], occasions: [] }
}

// Vendor tiles for Explore: vendors who haven't posted (so the grid has no photos of
// theirs), best rated first. vertical: a slug or null / 'all'. service: only vendors offering it.
// Each: { kind: 'vendor', id: 'v:<providerId>', providerId, provider, ratio }
export function exploreVendorTiles({ photos = [], providers = [], vertical = null, service = null }) {
  if (vertical === 'all') vertical = null
  const posted = new Set(photos.map((ph) => ph.providerId))
  const list = providers
    .filter((p) => !posted.has(p.id) && (!vertical || p.vertical === vertical) && (!service || (p.categorySlugs || []).includes(service)))
    .sort(byRating)
  // Alternate verticals when showing every vertical.
  const queues = new Map()
  for (const p of list) {
    if (!queues.has(p.vertical)) queues.set(p.vertical, [])
    queues.get(p.vertical).push(p)
  }
  const out = []
  const lists = [...queues.values()]
  for (let i = 0; out.length < list.length; i++) for (const q of lists) if (q[i]) out.push(q[i])
  return out.map((p, i) => ({ kind: 'vendor', id: `v:${p.id}`, providerId: p.id, provider: p, ratio: [1.2, 1.05, 1.3][i % 3] }))
}

// Photo tiles with a vendor tile after every `every` photos (vendor tiles fill in when photos run out).
export function mixExploreTiles(photoTiles = [], vendorTiles = [], every = 6) {
  if (!photoTiles.length) return vendorTiles
  const out = []
  let j = 0
  photoTiles.forEach((t, i) => {
    out.push(t)
    if ((i + 1) % every === 0 && j < vendorTiles.length) out.push(vendorTiles[j++])
  })
  return out
}

// Split tiles into columns for a masonry grid, each tile going to the shortest
// column (by aspect ratio), so reading order stays roughly left-to-right.
export function masonry(tiles, columns = 2) {
  const cols = Array.from({ length: columns }, () => ({ h: 0, items: [] }))
  for (const t of tiles) {
    const col = cols.reduce((a, b) => (b.h < a.h ? b : a))
    col.items.push(t)
    col.h += t.ratio ?? t.height / t.width
  }
  return cols.map((c) => c.items)
}
