// Discover: the swipe deck, swipe logging and undo, the taste profile, "Not into
// this", and "% match". Plain JS (no React, no DOM): the Expo app imports it too.
//
// Photography only (one vertical; see verticals/catalog.js). The deck is every photo &
// video creator's work; service chips narrow it. Changed in the photography pivot: no
// vertical picker (`vertical` is accepted and means the whole deck; another vertical's
// slug gives []), `service` works on the whole deck, and normalizeDeckChoice() returns
// { vertical: 'all', service, occasion: null }. Vendor cards stay: they show photographers
// who haven't posted yet.
//
// ---------------------------------------------------------------------------
// API (stable names; mobile/ imports these)
// ---------------------------------------------------------------------------
// Deck
//   EVERYTHING                        'all': the whole deck
//   getDeck({ service = null, occasion = null, limit = 8, exclude = null, seen = null })
//       -> Promise<DeckCard[]>  the next cards. exclude: card ids to leave out (fetched or swiped
//          already); seen: cards already fetched/swiped (their albums are left out too). [] = done.
//       Posts give photo cards (discover_feed, SigLIP-ranked; posts the ranking can't see yet,
//       e.g. without embeddings, follow newest first). Photographers with no posts give vendor
//       cards, ranked by discover_vendors() when that migration is applied and by rankVendors()
//       here otherwise. They're mixed: three photos, then one vendor card.
//       occasion: only old posts tagged with that occasion (occasions can't be set any more).
//   getFeed({ limit, category, occasion }) -> PhotoCard[]   the ranked photo feed alone
//   getVendorCards({ vertical, service, occasion, limit, exclude }) -> VendorCard[]
//   toVendorCard(provider, { reason, exploration, score }) -> VendorCard   (pure)
//   vendorCardId(providerId) -> 'v:<providerId>'
//   vendorFacts(provider) -> { lines: ['Mexican, Californian', 'Up to 400 guests'], tags: ['mexican', ...] }
//   rankVendors(providers, { liked, passed, explore, diversify }) -> [{ provider, score, reason, exploration }]
//   deckWords(vertical) -> wording for the deck: { noun, plural, things, finding, empty }
//   cardWords(card) -> { thing ('photo'|'dish'|'set'|'profile'...), things, kindLabel, visual }
//   normalizeDeckChoice(c), readDeckChoice(storage), writeDeckChoice(storage, c)
//       -> { vertical: 'all'|slug, service: slug|null, occasion: slug|null } (storage: a Storage-like
//          object; pass null where there is none)
//   DeckCard = PhotoCard | VendorCard. Shared fields: { kind, id, photoId, albumId, authorId,
//     providerId, provider, vertical, title, category, categorySlug, photos [{ id, src, exif }], tags[],
//     reason, exploration, score, exif }
//     PhotoCard  kind 'photo': id = photoId; occasion { slug, name } | null; photos[0] is the picked photo
//     VendorCard kind 'vendor': id 'v:<providerId>', photoId null, albumId null, photos = album covers
//                (often []), lines (key attributes), tags (lower-case traits, for "Not into this")
// Swipes
//   logSwipe(card, action, { dwellMs, position }) -> swipe id | null (signed out). Vendor cards log
//       provider_id with photo_id / album_id null.
//   undoSwipe(swipeId), likePhoto(photo)
// Taste and corrections
//   getTasteProfile() -> { swipes, likes, styles: [{ tag, weight }], corrections: [tag],
//       verticals: [{ slug, name, likes }], traits: [{ tag, weight }], vendorSwipes, hiddenVendors: [{ id, name }] }
//   addCorrections(tags), removeCorrection(tag), popularTags(limit)
//   getHiddenVendors() -> Set<providerId>;  hideVendor(providerId);  unhideVendor(providerId)
// "% match"
//   getDeckMatches() -> Map(providerId -> 60..98): photo-based provider_matches() for vendors with
//       posts, plus vendorMatches() (likes of similar vendors) for the rest
//   vendorSimilarity(a, b) -> 0..1;  vendorMatches(providers, { liked, passed }) -> Map
import { supabase } from '../lib/supabase.js'
import { exifLine, photoUrl, startingPackage } from '../lib/format.js'
import { cached, getMatches, invalidate, listProviders } from './catalog.js'
import { listPostIndex } from './home.js'
import {
  getService, isPhotoVertical, lowerFirst, optionLabel, postConfig, verticalConfig, verticalMeta, attributeLines,
} from '../verticals/index.js'

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const viewer = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null

export const EVERYTHING = 'all'
// One vertical: 'all', none, 'photography' (or 'videography') all mean the whole deck.
const isAll = (vertical) => !vertical || vertical === EVERYTHING || isPhotoVertical(vertical)

// ---------------------------------------------------------------------------
// Photo cards
// ---------------------------------------------------------------------------

// Rows like discover_feed's ({ photo_id, album_id, provider_id, album_title, auto_tags, score,
// reason, exploration }) as deck cards. photo_id may be null: the album's cover is used.
async function photoCards(rows) {
  if (!rows.length) return []
  const [albums, providers] = await Promise.all([
    supabase
      .from('albums')
      .select('id, title, kind, cover_photo_id, category:service_categories(name, slug), album_tags(tag:tags(slug, name)), photos!photos_album_id_fkey(id, display_path, position, exif, pair_role, auto_tags)')
      .in('id', [...new Set(rows.map((r) => r.album_id))])
      .then(must),
    listProviders(),
  ])
  const albumById = new Map(albums.map((a) => [a.id, a]))
  const providerById = new Map(providers.map((p) => [p.id, p]))
  return rows
    .filter((r) => providerById.has(r.provider_id) && albumById.has(r.album_id))
    .map((r) => {
      const album = albumById.get(r.album_id)
      const provider = providerById.get(r.provider_id)
      const photos = [...(album.photos || [])]
        .filter((p) => album.kind !== 'before_after' || p.pair_role !== 'before')
        .sort((a, b) => a.position - b.position)
      const pickedId = r.photo_id || album.cover_photo_id || photos[0]?.id
      // The picked photo first, then the rest of the album (up to 5 total).
      const ordered = [photos.find((p) => p.id === pickedId), ...photos.filter((p) => p.id !== pickedId)].filter(Boolean).slice(0, 5)
      const first = ordered[0]
      if (!first) return null
      const occTag = (album.album_tags || []).map((t) => t.tag).find((t) => t?.slug?.startsWith('occasion-'))
      const occSlug = occTag ? occTag.slug.slice('occasion-'.length) : null
      return {
        kind: 'photo',
        id: first.id,
        photoId: first.id,
        albumId: r.album_id,
        authorId: r.provider_id,
        providerId: r.provider_id,
        provider,
        vertical: provider.vertical,
        title: r.album_title ?? album.title,
        category: album.category?.name ?? null,
        categorySlug: album.category?.slug ?? null,
        occasion: occSlug ? { slug: occSlug, name: occTag.name || occSlug } : null,
        photos: ordered.map((p) => ({ id: p.id, src: photoUrl(p.display_path), exif: p.exif || {} })),
        tags: r.auto_tags || first.auto_tags || [],
        reason: r.reason ?? null,
        exploration: !!r.exploration,
        score: r.score ?? 0,
        exif: exifLine(first.exif),
      }
    })
    .filter(Boolean)
}

// Albums with an occasion tag: Set<albumId>.
const occasionAlbums = async (occasion) => new Set((await listPostIndex()).filter((p) => p.occasion === occasion).map((p) => p.albumId))

// The ranked photo feed (discover_feed). category: a service slug, or null for all (a vertical
// slug counts as all). occasion: keep only posts tagged with it.
// Each card: see PhotoCard at the top. (photos[0] is the photo the feed picked; posts by
// listings outside photography are dropped, so the request asks for a few extra.)
export async function getFeed({ limit = 20, category = null, occasion = null } = {}) {
  const service = category && !isPhotoVertical(category) && category !== EVERYTHING ? category : null
  const rows = must(await supabase.rpc('discover_feed', { p_limit: occasion ? 50 : service ? limit : limit * 2, p_category: service }))
  if (!rows.length) return []
  const keep = occasion ? await occasionAlbums(occasion) : null
  return (await photoCards(keep ? rows.filter((r) => keep.has(r.album_id)) : rows)).slice(0, limit)
}

// ---------------------------------------------------------------------------
// The signed-in user's swipes and hidden vendors (cached; logSwipe/undo refresh them)
// ---------------------------------------------------------------------------

const EMPTY_SWIPES = { photos: new Set(), albums: new Set(), vendors: new Set(), liked: new Set(), passed: new Set(), rows: [] }

// { photos: Set (swiped photo ids), albums: Set, vendors: Set (providers swiped as vendor cards),
//   liked: Set (providers liked or saved, either way), passed: Set (providers passed as vendor cards), rows }
async function mySwipes() {
  const uid = await viewer()
  if (!uid) return EMPTY_SWIPES
  return cached(`discover:swipes:${uid}`, async () => {
    const rows = must(
      await supabase.from('swipes').select('photo_id, album_id, provider_id, action, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1000),
    )
    const out = { photos: new Set(), albums: new Set(), vendors: new Set(), liked: new Set(), passed: new Set(), rows }
    for (const r of rows) {
      if (r.photo_id) out.photos.add(r.photo_id)
      if (r.album_id) out.albums.add(r.album_id)
      if (!r.photo_id && r.provider_id) {
        out.vendors.add(r.provider_id)
        if (r.action === 'pass') out.passed.add(r.provider_id)
      }
      if (r.action !== 'pass' && r.provider_id) out.liked.add(r.provider_id)
    }
    return out
  })
}

/** Vendors the user hid with "Not into this" (taste_corrections kind 'provider'): Set<providerId>. */
export async function getHiddenVendors() {
  const uid = await viewer()
  if (!uid) return new Set()
  return cached(`discover:hidden:${uid}`, async () => {
    const rows = must(await supabase.from('taste_corrections').select('value').eq('user_id', uid).eq('kind', 'provider'))
    return new Set(rows.map((r) => r.value))
  })
}

export async function hideVendor(providerId) {
  const uid = await viewer()
  if (!uid || !providerId) return
  must(await supabase.from('taste_corrections').upsert({ user_id: uid, kind: 'provider', value: providerId }, { onConflict: 'user_id,kind,value', ignoreDuplicates: true }))
  invalidate('discover:hidden')
}

export async function unhideVendor(providerId) {
  const uid = await viewer()
  if (!uid) return
  must(await supabase.from('taste_corrections').delete().eq('user_id', uid).eq('kind', 'provider').eq('value', providerId))
  invalidate('discover:hidden')
}

// ---------------------------------------------------------------------------
// Vendor cards
// ---------------------------------------------------------------------------

export const vendorCardId = (providerId) => `v:${providerId}`

const lc = (s) => String(s).trim().toLowerCase()
// Fields that say who a vendor is, not what their work is like (same list as vendor_traits() in SQL).
const NOT_TRAITS = new Set(['gear', 'languages', 'products', 'certifications'])

/**
 * What to show on a vendor card: { lines, tags }.
 *   lines: compact attribute lines from the vertical's cardKeys ('Mexican, Californian', 'Up to 400 guests'),
 *          then fleet / inventory names, then services. At most 3.
 *   tags:  lower-case traits (cuisines, genres, styles, services...) for "Not into this" and similarity.
 */
export function vendorFacts(provider) {
  const slug = provider.vertical
  const config = verticalConfig(slug)
  const attrs = provider.attributes || {}
  const fields = [...config.providerFields, ...config.packageFields.filter((f) => !config.providerFields.some((g) => g.key === f.key))]
  const lines = attributeLines(fields, attrs, config.cardKeys.length ? config.cardKeys : null).filter((l) => l.length <= 60)
  const named = (list, key) => (Array.isArray(list) ? list.map((x) => x?.[key]).filter(Boolean) : [])
  const fleet = named(attrs.fleet, 'vehicle')
  const inventory = named(attrs.inventory, 'item')
  if (fleet.length) lines.unshift(fleet.slice(0, 2).join(', '))
  if (inventory.length) lines.unshift(inventory.slice(0, 3).join(', '))
  if (lines.length < 2 && provider.categories?.length) lines.push(provider.categories.slice(0, 3).join(' · '))
  const tags = new Set()
  for (const f of config.providerFields) {
    if (NOT_TRAITS.has(f.key)) continue
    const v = attrs[f.key]
    if (f.type === 'tags' && Array.isArray(v)) v.forEach((x) => tags.add(lc(optionLabel(f, x))))
    if (f.type === 'select' && v) tags.add(lc(optionLabel(f, v)))
  }
  for (const s of provider.categories || []) tags.add(lc(s))
  return { lines: [...new Set(lines)].slice(0, 3), tags: [...tags].filter(Boolean).slice(0, 12) }
}

// Tokens used for vendor similarity (services + traits + fleet / inventory names).
function vendorTokens(p) {
  if (p.__tokens) return p.__tokens
  const { tags } = vendorFacts(p)
  const attrs = p.attributes || {}
  const extra = [...(Array.isArray(attrs.fleet) ? attrs.fleet.map((x) => x?.vehicle) : []), ...(Array.isArray(attrs.inventory) ? attrs.inventory.map((x) => x?.item) : [])]
  const t = { services: new Set(p.categorySlugs || []), traits: new Set([...tags, ...extra.filter(Boolean).map(lc)]) }
  Object.defineProperty(p, '__tokens', { value: t, enumerable: false, configurable: true })
  return t
}
const jaccard = (a, b) => {
  if (!a.size && !b.size) return 0
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n / (a.size + b.size - n)
}

/** How alike two vendors are, 0..1: same vertical, shared services and traits, similar prices. */
export function vendorSimilarity(a, b) {
  if (!a || !b || a.vertical !== b.vertical) return 0
  const ta = vendorTokens(a)
  const tb = vendorTokens(b)
  const pa = startingPackage(a)
  const pb = startingPackage(b)
  const price = pa && pb && pa.priceType === pb.priceType && pa.price > 0 && pb.price > 0
    ? Math.max(0, 1 - Math.abs(Math.log(pa.price / pb.price)) / Math.log(4))
    : 0.5
  return 0.45 * jaccard(ta.services, tb.services) + 0.35 * jaccard(ta.traits, tb.traits) + 0.2 * price
}

const DAY = 86400000
const quality = (p) => ((p.rating ?? 0) * (p.reviewCount || 0) + 4.2 * 3) / ((p.reviewCount || 0) + 3) / 5

/**
 * Order vendors for the deck (the client-side mirror of discover_vendors() in SQL).
 *   liked / passed: providers the user liked (any way) / passed as vendor cards
 *   explore: share of exploration picks (random picks from the lower half), 0..0.5
 *   diversify: alternate verticals ('all' deck)
 * score = 0.45 rating (shrunk toward 4.2 with few reviews) + 0.15 recency + 0.4 (similarity to the
 * closest liked vendor - half the similarity to the closest passed one) + 0.03 Pro.
 * Returns [{ provider, score, reason, exploration }].
 */
export function rankVendors(providers = [], { liked = [], passed = [], explore = 0.15, diversify = false, now = Date.now() } = {}) {
  const scored = providers.map((p) => {
    const likes = liked.filter((l) => l.id !== p.id && l.vertical === p.vertical)
    const passes = passed.filter((l) => l.id !== p.id && l.vertical === p.vertical)
    let best = null
    let sim = 0
    for (const l of likes) {
      const s = vendorSimilarity(p, l)
      if (s > sim) { sim = s; best = l }
    }
    const neg = Math.max(0, ...passes.map((l) => vendorSimilarity(p, l)))
    const age = p.createdAt ? (now - new Date(p.createdAt).getTime()) / DAY : 365
    const score = 0.45 * quality(p) + 0.15 * Math.exp(-age / 90) + 0.4 * (sim - 0.5 * neg) + (p.pro ? 0.03 : 0)
    const noun = verticalMeta(p.vertical).noun
    const reason = best && sim >= 0.35
      ? `Like ${best.name}, which you liked`
      : p.rating != null && p.rating >= 4.8 && p.reviewCount >= 3
        ? `Top-rated ${noun}`
        : age < 21
          ? 'New on photomatch'
          : p.city ? `${noun[0].toUpperCase()}${noun.slice(1)} in ${p.city.split(',')[0]}` : null
    return { provider: p, score, reason, exploration: false }
  })
  scored.sort((a, b) => b.score - a.score)
  let list = scored
  if (diversify) {
    const seen = new Map()
    list = scored
      .map((s) => {
        const k = (seen.get(s.provider.vertical) || 0) + 1
        seen.set(s.provider.vertical, k)
        return { ...s, adj: s.score - 0.06 * (k - 1) }
      })
      .sort((a, b) => b.adj - a.adj)
      .map(({ adj: _a, ...s }) => s)
  }
  const n = list.length
  const k = n >= 4 ? Math.max(1, Math.round(n * Math.min(0.5, explore))) : 0
  if (!k) return list
  const head = list.slice(0, Math.ceil(n / 2))
  const tail = list.slice(Math.ceil(n / 2))
  const picks = []
  while (picks.length < k && tail.length) picks.push({ ...tail.splice(Math.floor(Math.random() * tail.length), 1)[0], exploration: true, reason: 'Something new' })
  const out = [...head, ...tail]
  picks.forEach((p, i) => out.splice(Math.min(out.length, 3 + i * 6), 0, p))
  return out
}

/** A provider as a deck card (see VendorCard at the top). */
export function toVendorCard(provider, { reason = null, exploration = false, score = 0 } = {}) {
  const v = verticalMeta(provider.vertical)
  const facts = vendorFacts(provider)
  return {
    kind: 'vendor',
    id: vendorCardId(provider.id),
    photoId: null,
    albumId: null,
    authorId: provider.id,
    providerId: provider.id,
    provider,
    vertical: provider.vertical,
    title: provider.name,
    category: v.name,
    categorySlug: provider.vertical,
    occasion: null,
    photos: (provider.covers || []).slice(0, 5).map((src, i) => ({ id: `${provider.id}:${i}`, src, exif: {} })),
    lines: facts.lines,
    tags: facts.tags,
    reason,
    exploration,
    score,
    exif: '',
  }
}

let vendorRpc = true // false once we know discover_vendors() isn't in the database yet
const isMissingFn = (err) => !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message || ''))

/**
 * Vendor cards for photographers with nothing to swipe through as photos (no published posts),
 * best first. service: a service slug. exclude: card ids to leave out.
 * (vertical: another vertical's slug gives []; occasion: accepted and ignored.)
 */
export async function getVendorCards({ vertical = EVERYTHING, service = null, limit = 8, exclude = null } = {}) {
  if (!isAll(vertical)) return []
  const uid = await viewer()
  const [providers, posts, mine, hidden] = await Promise.all([listProviders(), listPostIndex(), mySwipes(), getHiddenVendors().catch(() => new Set())])
  const posted = new Set(posts.map((p) => p.providerId))
  const skip = new Set(exclude || [])
  const candidates = providers.filter((p) =>
    (!service || (p.categorySlugs || []).includes(service)) &&
    !posted.has(p.id) &&
    !(uid && p.profileId === uid) &&
    !mine.vendors.has(p.id) &&
    !hidden.has(p.id) &&
    !skip.has(vendorCardId(p.id)),
  )
  if (!candidates.length) return []
  const byId = new Map(providers.map((p) => [p.id, p]))

  // The database ranking, when the discover_vendors() migration is applied.
  if (vendorRpc) {
    const { data, error } = await supabase.rpc('discover_vendors', {
      p_limit: Math.min(100, limit + skip.size),
      p_vertical: null,
      p_service: service,
      p_without_posts: true,
    })
    if (error && isMissingFn(error)) vendorRpc = false
    else if (error) console.warn(error)
    else {
      const allowed = new Set(candidates.map((p) => p.id))
      const ranked = (Array.isArray(data) ? data : []).filter((r) => allowed.has(r.provider_id) && byId.has(r.provider_id))
      if (ranked.length) {
        return ranked.slice(0, limit).map((r) => toVendorCard(byId.get(r.provider_id), { reason: r.reason, exploration: r.exploration, score: r.score }))
      }
    }
  }
  const liked = [...mine.liked].map((id) => byId.get(id)).filter(Boolean)
  const passed = [...mine.passed].map((id) => byId.get(id)).filter(Boolean)
  return rankVendors(candidates, { liked, passed })
    .slice(0, limit)
    .map((r) => toVendorCard(r.provider, r))
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

// Round-robin by provider (newest first within each), so one vendor doesn't fill a run of cards.
function interleaveByProvider(posts) {
  const queues = new Map()
  for (const p of posts) {
    if (!queues.has(p.providerId)) queues.set(p.providerId, [])
    queues.get(p.providerId).push(p)
  }
  const lists = [...queues.values()]
  const out = []
  for (let i = 0; out.length < posts.length; i++) for (const q of lists) if (q[i]) out.push(q[i])
  return out
}

/** The next cards for the swipe deck. See the top of this file. */
export async function getDeck({ vertical = EVERYTHING, service = null, occasion = null, limit = 8, exclude = null, seen = null } = {}) {
  if (!isAll(vertical)) return []
  const uid = await viewer()
  const ids = new Set(exclude || [])
  const albumsSeen = new Set()
  for (const c of seen || []) {
    if (c?.id) ids.add(c.id)
    if (c?.albumId) albumsSeen.add(c.albumId)
  }
  const [posts, mine, hidden, providers] = await Promise.all([listPostIndex(), mySwipes(), getHiddenVendors().catch(() => new Set()), listProviders()])
  const own = new Set(uid ? providers.filter((p) => p.profileId === uid).map((p) => p.id) : [])
  const scoped = posts.filter((p) => (!service || p.service === service) && (!occasion || p.occasion === occasion))

  // 1. Photo cards: the ranked feed, then posts it doesn't rank (yet), newest first.
  let photos = []
  if (scoped.length) {
    const ranked = await getFeed({ limit, category: service, occasion }).catch((e) => {
      console.warn(e)
      return []
    })
    const albumsUsed = new Set()
    photos = ranked.filter((c) => {
      if (ids.has(c.id) || albumsSeen.has(c.albumId) || albumsUsed.has(c.albumId) || hidden.has(c.authorId)) return false
      albumsUsed.add(c.albumId)
      return true
    })
    if (photos.length < limit) {
      const rest = interleaveByProvider(
        scoped.filter((p) => !albumsSeen.has(p.albumId) && !albumsUsed.has(p.albumId) && !mine.albums.has(p.albumId) && !hidden.has(p.providerId) && !own.has(p.providerId)),
      ).slice(0, limit - photos.length)
      const more = await photoCards(rest.map((p) => ({ photo_id: null, album_id: p.albumId, provider_id: p.providerId, album_title: p.title, reason: 'New on photomatch', exploration: false, score: 0 })))
      photos = [...photos, ...more.filter((c) => !ids.has(c.id))]
    }
  }

  // 2. Vendor cards (photographers with no posts). Not when narrowing to an occasion's posts.
  const vendors = occasion ? [] : await getVendorCards({ service, limit, exclude: ids })

  // 3. Mix: one vendor card after every three photos, while both last.
  const every = 3
  const out = []
  let i = 0
  let j = 0
  let run = 0
  while (out.length < limit && (i < photos.length || j < vendors.length)) {
    if (i < photos.length && (run < every || j >= vendors.length)) {
      out.push(photos[i++])
      run++
    } else {
      out.push(vendors[j++])
      run = 0
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

/** Deck wording: { noun, plural, things, finding, empty }. (The argument is kept for old callers.) */
export function deckWords() {
  const v = verticalMeta()
  const plural = lowerFirst(v.plural)
  return {
    noun: v.noun,
    plural,
    things: 'work',
    finding: 'Finding work for you…',
    empty: `New ${plural} and their work show up here as they join and post.`,
  }
}

// 'dish' -> 'dishes', 'ceremony' -> 'ceremonies', 'photo' -> 'photos'.
const pluralOf = (w) => (/[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|sh|ch|x|z)$/.test(w) ? w + 'es' : w + 's')

/** Wording for one card: the thing you swipe on ('photo', 'dish', 'set'... or 'profile' for vendor cards). */
export function cardWords(card) {
  const v = verticalMeta(card?.vertical || card?.provider?.vertical)
  if (card?.kind === 'vendor') return { thing: 'profile', things: 'profiles', kindLabel: v.noun, visual: false, noun: v.noun }
  const thing = postConfig(v.slug).noun || 'photo'
  return { thing, things: pluralOf(thing), kindLabel: v.noun, visual: true, noun: v.noun }
}

// ---------------------------------------------------------------------------
// Remembering the deck choice (URL param + storage)
// ---------------------------------------------------------------------------

const DECK_KEY = 'discover:deck'

/** A valid { vertical: 'all', service, occasion: null } (an unknown service falls back to null). */
export function normalizeDeckChoice(c) {
  const service = c?.service && getService(c.service) ? c.service : null
  return { vertical: EVERYTHING, service, occasion: null }
}

export function readDeckChoice(storage) {
  try {
    return normalizeDeckChoice(JSON.parse(storage?.getItem(DECK_KEY) || 'null'))
  } catch {
    return normalizeDeckChoice(null)
  }
}

export function writeDeckChoice(storage, choice) {
  try {
    storage?.setItem(DECK_KEY, JSON.stringify(normalizeDeckChoice(choice)))
  } catch {
    // private mode / storage full: the choice just won't be remembered
  }
}

// ---------------------------------------------------------------------------
// Swipes
// ---------------------------------------------------------------------------

// Record a swipe: action 'like' | 'pass' | 'save'. Signed-out swipes aren't saved.
// Works for photo cards and vendor cards (photo_id / album_id null). Returns the swipe id (for undo) or null.
export async function logSwipe(card, action, { dwellMs = null, position = null } = {}) {
  if (!(await viewer())) return null
  const row = must(
    await supabase
      .from('swipes')
      .insert({
        photo_id: card.photoId ?? null,
        album_id: card.albumId ?? null,
        provider_id: card.authorId ?? card.providerId,
        action,
        dwell_ms: dwellMs == null ? null : Math.round(dwellMs),
        position,
        reason_shown: card.reason ?? null,
      })
      .select('id')
      .single(),
  )
  invalidate('matches')
  invalidate('discover:swipes')
  return row.id
}

export async function undoSwipe(swipeId) {
  if (swipeId == null) return
  must(await supabase.from('swipes').delete().eq('id', swipeId))
  invalidate('matches')
  invalidate('discover:swipes')
}

// Like a photo outside the deck (e.g. in a gallery). Same signal as a right swipe.
export const likePhoto = (photo) => logSwipe({ photoId: photo.photoId ?? photo.id, albumId: photo.albumId, authorId: photo.providerId }, 'like')

// ---------------------------------------------------------------------------
// Taste
// ---------------------------------------------------------------------------

// What the taste model has learned. See the top of this file for the shape.
export async function getTasteProfile() {
  const uid = await viewer()
  if (!uid) return { swipes: 0, likes: 0, styles: [], corrections: [], verticals: [], traits: [], vendorSwipes: 0, hiddenVendors: [] }
  const [swipes, corrections, providers] = await Promise.all([
    supabase.from('swipes').select('action, provider_id, photo_id, photo:photos(auto_tags)').eq('user_id', uid).order('created_at', { ascending: false }).limit(300).then(must),
    supabase.from('taste_corrections').select('kind, value').eq('user_id', uid).then(must),
    listProviders().catch(() => []),
  ])
  const byId = new Map(providers.map((p) => [p.id, p]))
  const counts = new Map()
  const verticals = new Map()
  const traits = new Map()
  let likes = 0
  let vendorSwipes = 0
  for (const s of swipes) {
    if (!s.photo_id) vendorSwipes++
    if (s.action === 'pass') continue
    likes++
    for (const t of s.photo?.auto_tags || []) counts.set(t, (counts.get(t) || 0) + 1)
    const p = byId.get(s.provider_id)
    if (p) {
      verticals.set(p.vertical, (verticals.get(p.vertical) || 0) + 1)
      if (!s.photo_id) for (const t of vendorFacts(p).tags) traits.set(t, (traits.get(t) || 0) + 1)
    }
  }
  const weigh = (m, n) => {
    const top = Math.max(1, ...m.values())
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag, c]) => ({ tag, weight: Math.round((c / top) * 100) / 100 }))
  }
  return {
    swipes: swipes.length,
    likes,
    styles: weigh(counts, 8),
    corrections: corrections.filter((c) => c.kind === 'tag').map((c) => c.value),
    verticals: [...verticals.entries()].sort((a, b) => b[1] - a[1]).map(([slug, n]) => ({ slug, name: verticalMeta(slug).name, likes: n })),
    traits: weigh(traits, 8),
    vendorSwipes,
    hiddenVendors: corrections.filter((c) => c.kind === 'provider').map((c) => ({ id: c.value, name: byId.get(c.value)?.name || 'A vendor' })),
  }
}

// "Not into this": hide photos with these auto-tags (and vendor cards with these traits) from Discover.
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

// ---------------------------------------------------------------------------
// "% match"
// ---------------------------------------------------------------------------

/**
 * "% match" from vendor likes: in each vertical where the user liked at least 2 vendors, every
 * vendor's similarity to the closest liked one (minus half the closest passed one), scaled to
 * 60..98 across that vertical (like provider_matches()). Map(providerId -> pct).
 */
export function vendorMatches(providers = [], { liked = [], passed = [] } = {}) {
  const out = new Map()
  const byVertical = new Map()
  for (const p of providers) {
    if (!byVertical.has(p.vertical)) byVertical.set(p.vertical, [])
    byVertical.get(p.vertical).push(p)
  }
  for (const [slug, list] of byVertical) {
    const likes = liked.filter((l) => l.vertical === slug)
    if (likes.length < 2) continue
    const passes = passed.filter((l) => l.vertical === slug)
    const sims = list.map((p) => {
      const pos = Math.max(0, ...likes.map((l) => (l.id === p.id ? 1 : vendorSimilarity(p, l))))
      const neg = Math.max(0, ...passes.filter((l) => l.id !== p.id).map((l) => vendorSimilarity(p, l)))
      return [p.id, pos - 0.5 * neg]
    })
    const lo = Math.min(...sims.map((s) => s[1]))
    const hi = Math.max(...sims.map((s) => s[1]))
    for (const [id, s] of sims) out.set(id, hi - lo < 1e-6 ? 90 : Math.round(60 + (38 * (s - lo)) / (hi - lo)))
  }
  return out
}

/** Map(providerId -> % match) for the deck: photo taste where there are posts, vendor likes elsewhere. */
export async function getDeckMatches() {
  const uid = await viewer()
  if (!uid) return new Map()
  const [photo, mine, providers] = await Promise.all([getMatches().catch(() => new Map()), mySwipes(), listProviders()])
  const byId = new Map(providers.map((p) => [p.id, p]))
  const vendor = vendorMatches(providers, {
    liked: [...mine.liked].map((id) => byId.get(id)).filter(Boolean),
    passed: [...mine.passed].map((id) => byId.get(id)).filter(Boolean),
  })
  return new Map([...vendor, ...photo])
}
