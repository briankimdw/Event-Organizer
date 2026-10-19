// Home tab: native version of frontend/src/screens/Home.jsx (photography only).
// All data + shaping comes from the shared frontend/src/api/home.js:
//   listBrowseProviders() + weekendAvailability() -> buildHomeFeed() -> { services, shelves }
// so the shelves (titles, order, "see all" links) stay identical to the web.
// Layout, top to bottom: header, search, photo + video service chips (-> /search?cat=),
// bookings tiles (NeedsAction), the first shelf ("Matched to your taste" or "Available
// this weekend"), the Explore teaser, the other shelves (top rated, under $, new), and
// a small "shoot photo or video?" card (list your work / invite a photographer).
import { useRouter, type Href } from 'expo-router'
import { ScrollView, View } from 'react-native'

import { buildHomeFeed, comingWeekend, listBrowseProviders, listExplorePhotos, weekendAvailability } from '@shared/api/home.js'
import { fmtChip } from '@shared/lib/dates.js'
import { Chip, ErrorState, Screen, SectionHeader, iconByName } from '@/components'
import useQuery from '@/hooks/useQuery'
import { useAuth } from '@/state/auth'
import { makeStyles } from '@/theme'
import type { Provider } from '@/types'
import NeedsAction from '../bookings/NeedsAction'
import { ExploreTeaser, JoinCard } from './Browse'
import { HomeHeader, SearchLauncher } from './HomeHeader'
import { ProviderList, ProviderShelf } from './ProviderShelves'

type Shelf = { key: string; title: string; sub?: string; to?: string | null; layout: 'cards' | 'rows'; items: Provider[]; empty?: string }
type ServiceChip = { slug: string; name: string; kind: 'photo' | 'video'; icon: string; providers: number; posts: number }

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
  // Services someone offers come first; the rest keep catalog order (still worth a tap: search shows who's close).
  const services = [...(feed.services as ServiceChip[])].sort((a, b) => Number(b.providers > 0) - Number(a.providers > 0))
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
        <SearchLauncher placeholder="Photographers, videographers, styles…" />
      </View>

      <SectionHeader title="What are you shooting?" sub="Photo and video, for every kind of day" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityLabel="Browse by service">
        {services.map((x) => (
          <Chip
            key={x.slug}
            label={x.name}
            icon={iconByName(x.icon)}
            accessibilityLabel={`${x.name}${x.kind === 'video' ? ' video' : ''}, ${x.providers} ${x.providers === 1 ? 'pro' : 'pros'}`}
            accessibilityHint="Searches for this service"
            onPress={() => router.push({ pathname: '/search', params: { cat: x.slug } })}
          />
        ))}
      </ScrollView>

      <NeedsAction />

      {all.error && <ErrorState error={all.error} onRetry={all.reload} />}
      {all.loading && !all.data && <ProviderShelf title="Available this weekend" providers={[]} loading />}

      {firstShelf && shelf(firstShelf)}

      {teaser.length === 3 && (
        <View style={[s.pad, s.mtLg]}>
          <ExploreTeaser photos={teaser} />
        </View>
      )}

      {otherShelves.map(shelf)}

      {!!all.data && (
        <View style={[s.pad, s.mtLg]}>
          <JoinCard />
        </View>
      )}
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  pad: { paddingHorizontal: t.space.lg },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: t.space.lg, paddingBottom: 2 },
  mtLg: { marginTop: t.space.xl },
}))
