// Archived in the photography pivot (2026-10-18): the multi-vertical builders cut from
// frontend/src/api/home.js (the old buildHomeFeed, /services/:vertical, /occasions/:slug,
// and the Discover vertical picker). Not built. They used GROUPS, OCCASIONS, VERTICALS and
// getVertical from the archived verticals/catalog.js, plus helpers still in api/home.js.

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

// The Home feed from real data.
//   providers: listBrowseProviders()   weekend: weekendAvailability()
// Returns { live: vertical[], soon: vertical[], counts, shelves: [...] } where each
// shelf is { key, title, sub, to, layout: 'cards'|'rows', items: provider[] }.
// Shelf titles name the vertical while only one has providers ("Photographers
// available this weekend") and go generic once several do.
export function buildHomeFeed({ providers = [], weekend = new Map(), weekendLabel = '' }) {
  const counts = countByVertical(providers)
  const live = VERTICALS.filter((v) => counts.get(v.slug))
  const soon = VERTICALS.filter((v) => !counts.get(v.slug))
  const single = live.length === 1 ? live[0] : null
  const who = single ? single.plural : 'Pros'
  const whoLower = single ? pluralLower(single) : 'pros'
  const qs = single ? `?v=${single.slug}` : ''

  const shelves = []
  const used = new Set()
  const take = (list, n) => list.slice(0, n)

  const matched = providers.filter((p) => p.tasteMatch != null).sort(byMatch)
  if (matched.length) {
    shelves.push({ key: 'match', title: 'Matched to your taste', sub: 'Based on your Discover swipes', to: `/search${qs}`, layout: 'cards', items: take(matched, 8) })
  }

  const free = providers.filter((p) => weekend.has(p.id)).map((p) => ({ ...p, freeDates: weekend.get(p.id) })).sort(byMatch)
  shelves.push({
    key: 'weekend',
    title: `${who} free this weekend`,
    sub: weekendLabel,
    to: `/search?${single ? `v=${single.slug}&` : ''}dates=${comingWeekend().map(toKey).join(',')}`,
    layout: 'cards',
    items: take(free, 8),
    empty: `No ${whoLower} have free time this weekend yet.`,
  })
  free.slice(0, 8).forEach((p) => used.add(p.id))

  // One shelf per vertical once several have providers ("Caterers near you").
  if (!single && live.length > 1) {
    for (const v of [...live].sort((a, b) => counts.get(b.slug) - counts.get(a.slug))) {
      const list = providers.filter((p) => p.vertical === v.slug).sort(byRating)
      shelves.push({ key: `v:${v.slug}`, title: `Top ${pluralLower(v)}`, to: `/services/${v.slug}`, layout: 'cards', items: take(list, 8), vertical: v })
    }
  } else {
    const rated = providers.filter((p) => p.rating != null).sort(byRating)
    if (rated.length && !sameOrder(rated, free)) {
      shelves.push({ key: 'top', title: `Top-rated ${whoLower}`, sub: 'Loved by clients', to: `/search${qs}`, layout: 'cards', items: take(rated, 8) })
    }
    const cap = budgetCap(single)
    const budget = underPrice(providers, cap)
    if (budget.length >= 2) {
      shelves.push({ key: 'budget', title: `Under ${money(cap)}`, sub: 'Great work at a friendly price', to: null, layout: 'cards', items: take(budget, 8) })
    }
  }

  const newest = [...providers].sort(byNewest)
  if (newest.length) shelves.push({ key: 'new', title: 'New on photomatch', sub: 'Recently joined', to: `/search${qs}`, layout: 'rows', items: take(newest, 4) })

  return { live, soon, counts, shelves }
}

// ---------------------------------------------------------------------------
// /services/:vertical
// ---------------------------------------------------------------------------

// Everything the vertical landing page shows.
//   service: an optional service slug chip; only providers offering it are kept.
export function buildVerticalPage({ vertical, providers = [], weekend = new Map(), service = null }) {
  const all = providers.filter((p) => p.vertical === vertical.slug)
  const list = service ? all.filter((p) => (p.categorySlugs || []).includes(service)) : all
  const free = list.filter((p) => weekend.has(p.id)).map((p) => ({ ...p, freeDates: weekend.get(p.id) })).sort(byMatch)
  const rated = list.filter((p) => p.rating != null).sort(byRating)
  const prices = all.map(startingPrice).filter((n) => n != null)
  // Services that at least one provider here offers, for the chip counts.
  const offered = new Map()
  for (const p of all) for (const s of p.categorySlugs || []) offered.set(s, (offered.get(s) || 0) + 1)
  const cap = budgetCap(vertical)
  return {
    total: all.length,
    list: [...list].sort(byMatch),
    free,
    rated: sameOrder(rated, free) ? [] : rated, // skip a shelf that repeats "free this weekend"
    budget: { cap, items: underPrice(list, cap) },
    newest: [...list].sort(byNewest),
    minPrice: prices.length ? Math.min(...prices) : null,
    offered,
    occasions: OCCASIONS.filter((o) => o.needs.includes(vertical.slug)),
  }
}

// Other verticals that have providers, to suggest from an empty vertical page.
export const liveVerticals = (providers, except = null) => {
  const counts = countByVertical(providers)
  return VERTICALS.filter((v) => v.slug !== except && counts.get(v.slug)).map((v) => ({ ...v, count: counts.get(v.slug) }))
}

// ---------------------------------------------------------------------------
// /occasions/:slug
// ---------------------------------------------------------------------------

// The occasion's vendor checklist: one item per needed vertical, in order of importance.
// Each: { vertical, count, top: provider[] (best 3), minPrice }
export function buildOccasionChecklist(occasion, providers = []) {
  return occasion.needs
    .map(getVertical)
    .filter(Boolean)
    .map((vertical) => {
      const list = providers.filter((p) => p.vertical === vertical.slug)
      const prices = list.map(startingPrice).filter((n) => n != null)
      return {
        vertical,
        count: list.length,
        top: [...list].sort(byMatch).slice(0, 6),
        minPrice: prices.length ? Math.min(...prices) : null,
      }
    })
}

// The planner prompt for "Plan this with AI" (the planner opens with it via /plan?q=).
export function occasionPrompt(occasion, details = '') {
  const extra = details.trim()
  const article = withArticle(occasion.name.toLowerCase())
  if (!extra) return `I’m planning ${article}. Help me figure out what I need.`
  return /^(a|an|my|our)\b/i.test(extra) || extra.toLowerCase().includes(occasion.name.toLowerCase())
    ? extra
    : `${article[0].toUpperCase()}${article.slice(1)}: ${extra}`
}

// "I've got this covered" ticks on an occasion checklist, kept on this device.
// storage: a Storage-like object ({ getItem, setItem }); pass null where there is none.
export function readCovered(storage, occasionSlug) {
  try {
    return new Set(JSON.parse(storage?.getItem(`occasion-covered:${occasionSlug}`) || '[]'))
  } catch {
    return new Set()
  }
}
export function writeCovered(storage, occasionSlug, set) {
  try {
    storage?.setItem(`occasion-covered:${occasionSlug}`, JSON.stringify([...set]))
  } catch {
    // private mode / storage full: the ticks just won't persist
  }
}

// Verticals the swipe deck can show: those with visual portfolios, each with
// `count` (active providers). Deprecated (photo-only); use deckChoices(), which
// lists every vertical. Kept so older callers keep working.
export function deckVerticals(counts = {}, withPosts = null) {
  return VERTICALS.filter((v) => v.visual).map((v) => ({
    ...v,
    count: withPosts && !withPosts.has(v.slug) ? 0 : counts[v.slug] || 0,
  }))
}

// The swipe deck's picker: "Everything" plus all 18 verticals grouped like catalog GROUPS.
//   counts: { slug: providers } (countProvidersByVertical())   posts: listPostIndex() (or null while loading)
// Returns { everything: { slug: 'all', name, count, posts }, groups: [{ slug, name, verticals: [v] }] }
// where each v is a catalog vertical plus { count (vendors), posts (published posts),
// mode: 'photos' (swipe their work) | 'vendors' (swipe vendor cards) | 'empty' (nobody yet) }.
export function deckChoices(counts = {}, posts = null) {
  const byVertical = postFacets(posts || []).verticals
  const decorate = (v) => {
    const count = counts?.[v.slug] || 0
    const n = byVertical[v.slug] || 0
    return { ...v, count, posts: n, mode: n ? 'photos' : count ? 'vendors' : 'empty' }
  }
  const all = VERTICALS.map(decorate)
  return {
    everything: {
      slug: 'all', name: 'Everything', noun: 'vendor', plural: 'Vendors', icon: 'Sparkles', tint: '#334155',
      count: all.reduce((n, v) => n + v.count, 0), posts: all.reduce((n, v) => n + v.posts, 0),
    },
    groups: GROUPS.map((g) => ({ ...g, verticals: all.filter((v) => v.group === g.slug) })).filter((g) => g.verticals.length),
  }
}

// Slugs of the verticals that have at least one published post: Set<string>.
export const verticalsWithPosts = async () => new Set((await listPostIndex()).map((p) => p.vertical).filter(Boolean))
