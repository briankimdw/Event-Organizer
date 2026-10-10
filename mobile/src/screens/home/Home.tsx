// Home tab: native version of frontend/src/screens/Home.jsx (the redesigned one).
// All data + shaping comes from the shared frontend/src/api/home.js:
//   listBrowseProviders() + weekendAvailability() -> buildHomeFeed() -> { live, soon, counts, shelves }
// so the shelves (titles, order, "see all" links) stay identical to the web.
// Layout = independent sections, same order as the web: header, search, bookings tiles
// (NeedsAction, from the bookings port), vertical rail, AI planner card, occasions, first
// shelf, Explore teaser, the other shelves, "Coming soon near you".
import { useRouter, type Href } from 'expo-router'
import { View } from 'react-native'

import { buildHomeFeed, comingWeekend, listBrowseProviders, listExplorePhotos, weekendAvailability } from '@shared/api/home.js'
import { fmtChip } from '@shared/lib/dates.js'
import { ErrorState, Screen } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles } from '@/theme'
import type { Provider, Vertical } from '@/types'
import NeedsAction from '../bookings/NeedsAction'
import { ComingSoonCard, ExploreTeaser } from './Browse'
import { OccasionRail, VerticalRail } from './CatalogRails'
import { HomeHeader, SearchLauncher } from './HomeHeader'
import { PlannerEntry } from './PlannerEntry'
import { ProviderList, ProviderShelf } from './ProviderShelves'
import { EventsShelf } from '@/screens/events/parts'

type Shelf = { key: string; title: string; sub?: string; to?: string | null; layout: 'cards' | 'rows'; items: Provider[]; empty?: string }

export default function Home() {
  const s = useStyles()
  const router = useRouter()
  const { user } = useAuth()
  const uid = user?.id ?? null

  const all = useQuery<Provider[]>(() => listBrowseProviders(), [uid])
  const weekend = useQuery<Map<string, string[]>>(() => weekendAvailability(), [])
  const photos = useQuery<{ id: string; src: string; providerId: string }[]>(() => listExplorePhotos(), [])

  const feed = buildHomeFeed({
    providers: all.data || [],
    weekend: weekend.data || new Map(),
    weekendLabel: comingWeekend().map(fmtChip).join(' – '),
  } as any)
  const shelves = (all.data ? feed.shelves : []) as Shelf[]
  const [firstShelf, ...otherShelves] = shelves
  const soon = feed.soon as Vertical[]
  const open = (to?: string | null) => (to ? () => router.push(to as Href) : undefined)

  // Three real portfolio shots (different providers) for the Explore teaser.
  const teaser: { id: string; src: string; providerId: string }[] = []
  for (const ph of photos.data || []) {
    if (teaser.length === 3) break
    if (!teaser.some((t) => t.providerId === ph.providerId)) teaser.push(ph)
  }

  const refresh = () => {
    all.reload()
    weekend.reload()
    photos.reload()
  }

  const shelf = (sh: Shelf) =>
    sh.layout === 'rows' ? (
      <ProviderList key={sh.key} title={sh.title} sub={sh.sub} providers={sh.items} onSeeAll={sh.items.length ? open(sh.to) : undefined} emptyText={sh.empty} />
    ) : (
      <ProviderShelf
        key={sh.key}
        title={sh.title}
        sub={sh.sub}
        providers={sh.items}
        loading={sh.key === 'weekend' && weekend.loading}
        onSeeAll={sh.items.length ? open(sh.to) : undefined}
        emptyText={sh.empty}
      />
    )

  return (
    <Screen header={<HomeHeader />} refreshing={false} onRefresh={refresh}>
      <View style={s.pad}>
        <SearchLauncher placeholder="Photographers, venues, caterers…" />
      </View>

      <NeedsAction />

      <EventsShelf />
      <VerticalRail counts={all.data ? (feed.counts as Map<string, number>) : null} />

      <View style={s.pad}>
        <PlannerEntry />
      </View>

      <OccasionRail />

      {all.error && <ErrorState error={all.error} onRetry={all.reload} />}
      {all.loading && !all.data && <ProviderShelf title="Free this weekend" providers={[]} loading />}

      {firstShelf && shelf(firstShelf)}

      {teaser.length === 3 && (
        <View style={[s.pad, s.mtLg]}>
          <ExploreTeaser photos={teaser} />
        </View>
      )}

      {otherShelves.map(shelf)}

      {!!all.data && soon.length > 0 && (
        <View style={[s.pad, s.mtLg]}>
          <ComingSoonCard soon={soon} />
        </View>
      )}
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  pad: { paddingHorizontal: t.space.lg },
  mtLg: { marginTop: t.space.xl },
}))
