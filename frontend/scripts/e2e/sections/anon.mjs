// Signed-out browsing, through the app's own data layer. Read-only: runs in --dry-run too.
// Works before and after the photography-only cleanup (archived verticals still in the
// database are reported, not failed).
import { assert, eq, expectError, skip } from '../lib/harness.mjs'
import { projectRef } from '../lib/env.mjs'
import { addDays, toKey, today } from '../../../src/lib/dates.js'

// Before the cleanup, the video listings still sit in 'videography'; the app treats both as Photo & video.
const isPhoto = (slug) => slug === 'photography' || slug === 'videography'
const soon = (n) => Array.from({ length: n }, (_, i) => toKey(addDays(today(), 40 + i)))

export default {
  id: 'anon',
  title: 'Signed-out browsing',
  roles: [],
  readOnly: true,
  steps: [
    {
      name: 'config: publishable key + test users',
      run: (ctx) => `project ${projectRef(ctx.env.VITE_SUPABASE_URL)}, ${ctx.users.length} test users, run tag "${ctx.tag('').trim()}"`,
    },
    {
      name: 'getCategories: Photo & video is live',
      soft: true,
      run: async (ctx) => {
        ctx.anon()
        const cats = await ctx.app.catalog.getCategories()
        const photo = cats.find((c) => c.slug === 'photography')
        assert(photo && photo.live !== false, 'the photography vertical is not in the database (run supabase/seed.sql)')
        const live = (photo.services || []).filter((s) => s.live !== false).map((s) => s.slug)
        assert(live.includes('wedding'), `photography services: ${live.join(', ') || 'none'}`)
        // (Until photography_only_setup.sql runs, the video services still sit under 'videography'
        // in the database; the app matches them by slug, so they count here either way.)
        const video = ['wedding-film', 'event-recap', 'social-reels', 'music-video', 'drone'].filter((x) => live.includes(x))
        return `"${photo.name}": ${live.length} live services${video.length ? ` (video: ${video.join(', ')})` : ' (no video services yet)'}`
      },
    },
    {
      name: 'listProviders: photo & video listings',
      run: async (ctx) => {
        ctx.anon()
        const { catalog } = ctx.app
        const all = await catalog.listProviders()
        assert(all.length > 0, 'no active providers (run the seed + demo data)')
        const photo = await catalog.listProviders({ vertical: 'photography' })
        assert(photo.length > 0, 'no photography listings')
        assert(photo.every((p) => isPhoto(p.vertical)), "listProviders({vertical:'photography'}) returned another vertical")
        for (const p of all) {
          assert(p.id && p.name, `provider ${p.id} is missing basics`)
          assert(Array.isArray(p.packages), `provider ${p.slug} has no packages array`)
        }
        ctx.state.anonProviders = all
        const others = all.filter((p) => !isPhoto(p.vertical)).length
        return `${photo.length} photo & video listings${others ? `, ${others} in archived verticals (cleanup not run yet)` : ''}`
      },
    },
    {
      name: 'countProvidersByVertical agrees',
      soft: true,
      run: async ({ app, state, anon }) => {
        anon()
        const counts = await app.catalog.countProvidersByVertical()
        const expected = {}
        for (const p of state.anonProviders) if (isPhoto(p.vertical)) expected.photography = (expected.photography || 0) + 1
        eq(counts.photography, expected.photography, 'count for photography')
        return `${counts.photography} photo & video listings`
      },
    },
    {
      name: 'search_providers: dates + vertical (photography)',
      soft: true,
      run: async ({ app, anon }) => {
        anon()
        const dates = soon(3)
        const found = await app.catalog.searchProviders({ dates, vertical: 'photography' })
        assert(found.length > 0, 'nobody free on any of 3 days, 40+ days out')
        for (const p of found) {
          assert(isPhoto(p.vertical), `${p.slug} vertical ${p.vertical}`)
          assert(p.freeDates.length > 0 && p.freeDates.every((d) => dates.includes(d)), `${p.slug} freeDates ${p.freeDates} not within ${dates}`)
        }
        return `${found.length} free on ${dates[0]}..${dates[2]}`
      },
    },
    {
      name: 'search_providers: service slug (wedding)',
      soft: true,
      run: async ({ app, anon }) => {
        anon()
        const found = await app.catalog.searchProviders({ service: 'wedding' })
        assert(found.length > 0, 'no wedding photographers')
        for (const p of found) assert(p.categorySlugs.includes('wedding') || p.vertical === 'wedding', `${p.slug} doesn't offer wedding`)
        return `${found.length} offer wedding`
      },
    },
    {
      name: 'search_providers: photography + dates + max price',
      soft: true,
      run: async ({ app, anon }) => {
        anon()
        const maxPrice = 500
        const found = await app.catalog.searchProviders({ vertical: 'photography', dates: soon(2), maxPrice })
        for (const p of found) {
          assert(isPhoto(p.vertical), `${p.slug} vertical ${p.vertical}`)
          assert(p.startingPrice != null && p.startingPrice <= maxPrice, `${p.slug} starts at ${p.startingPrice} > ${maxPrice}`)
        }
        const unfiltered = await app.catalog.searchProviders({ vertical: 'photography' })
        assert(unfiltered.length >= found.length, 'price filter returned more than no filter')
        return `${found.length} of ${unfiltered.length} free and from <= $${maxPrice}`
      },
    },
    {
      name: 'getProvider by id, slug and owner profile id',
      run: async (ctx) => {
        ctx.anon()
        const { catalog } = ctx.app
        const sample = ctx.state.anonProviders.find((p) => p.packages.length) || ctx.state.anonProviders[0]
        const [byId, bySlug, byProfile] = await Promise.all([catalog.getProvider(sample.id), catalog.getProvider(sample.slug), catalog.getProvider(sample.profileId)])
        eq(byId?.id, sample.id, 'by id')
        eq(bySlug?.id, sample.id, 'by slug')
        assert(byProfile?.profileId === sample.profileId, 'by owner profile id')
        assert(Array.isArray(byId.reviews) && Array.isArray(byId.addons) && Array.isArray(byId.workingDays), 'full profile fields missing')
        return `${sample.name}: ${byId.packages.length} packages, ${byId.addons.length} add-ons, ${byId.reviews.length} reviews`
      },
    },
    {
      name: 'reviews match the rating aggregates',
      soft: true,
      run: async ({ app, state, anon }) => {
        anon()
        const p = state.anonProviders.find((x) => x.reviewCount > 0 && x.reviewCount <= 20)
        if (!p) skip('no provider with 1-20 reviews')
        const reviews = await app.catalog.listReviews(p.id, 50)
        eq(reviews.length, p.reviewCount, `${p.slug} revealed reviews vs rating_count`)
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        assert(Math.abs(avg - p.rating) < 0.011, `${p.slug} rating ${p.rating} but reviews average ${avg.toFixed(2)}`)
        return `${p.name}: ${p.reviewCount} reviews, avg ${p.rating}`
      },
    },
    {
      name: 'albums readable (listAlbums)',
      soft: true,
      run: async ({ app, state, anon }) => {
        anon()
        const p = state.anonProviders.find((x) => x.albumCount > 0)
        if (!p) skip('no provider has albums (seed with --with-photos)')
        const rows = await app.portfolio.listAlbums(p.id)
        assert(rows.length > 0, 'listAlbums returned nothing')
        const viewer = app.portfolio.toViewerAlbum(rows[0])
        assert(viewer.photos.length > 0 && /^https?:/.test(viewer.photos[0].src), 'viewer album has no photo URL')
        return `${p.name}: ${rows.length} albums`
      },
    },
    {
      name: 'discover feed for signed-out visitors',
      soft: true,
      run: async ({ app, anon }) => {
        anon()
        const cards = await app.discover.getFeed({ limit: 8 })
        assert(cards.length > 0, 'discover_feed returned no cards (are photos analysed? services/ml worker)')
        for (const c of cards) assert(c.provider && c.photos[0]?.src, `card ${c.id} has no provider or photo`)
        const swipe = await app.discover.logSwipe(cards[0], 'like')
        eq(swipe, null, 'signed-out swipe id')
        return `${cards.length} cards; signed-out swipes are not saved`
      },
    },
    {
      name: 'getPerson: client profile and username -> listing',
      soft: true,
      run: async ({ app, anon, roles }) => {
        anon()
        const client = await app.catalog.getPerson(roles.clientA.username)
        eq(client?.kind, 'person', `${roles.clientA.username} kind`)
        const vendor = await app.catalog.getPerson(roles.photographer.username)
        eq(vendor?.kind, 'provider', `${roles.photographer.username} kind`)
        return `${client.name} (client), ${vendor.name} (listing)`
      },
    },
    {
      name: 'RLS: signed-out visitors see no private rows',
      soft: true,
      run: async ({ app, anon }) => {
        const { client } = anon()
        const tables = ['bookings', 'messages', 'conversations', 'events', 'provider_private', 'swipes', 'saved_providers', 'event_members', 'booking_offers']
        const leaks = []
        for (const t of tables) {
          const { data, error } = await client.from(t).select('*').limit(5)
          if (!error && data?.length) leaks.push(`${t} (${data.length})`)
        }
        assert(!leaks.length, `anon can read: ${leaks.join(', ')}`)
        await expectError(client.rpc('request_booking', { p_package_id: '00000000-0000-0000-0000-000000000000', p_dates: ['2030-01-01'], p_start_time: '10:00' }).then(({ error }) => { if (error) throw error }), null, 'anon request_booking')
        const mine = await app.bookings.listMyBookings()
        eq(mine.length, 0, 'listMyBookings while signed out')
        return `${tables.length} private tables empty; booking RPC refused`
      },
    },
  ],
}
