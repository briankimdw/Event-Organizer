// Discover -> "Explore": a Pinterest-style two-column masonry of real photo & video work
// (native port of frontend/src/components/discover/Explore.jsx). Service chips (the services
// that have photos) filter it (kept in the route param ?s=); tap a photo to open it in its
// post, tap the name to open the photographer. Photographers who haven't posted yet appear
// as tinted tiles between the photos; with no posts at all there's a "be the first" invite.
// Pages in 24 at a time as you scroll.
// Data + shaping: the shared api/home.js (listExplorePhotos, buildExploreTiles, exploreFilters,
// exploreVendorTiles, mixExploreTiles, masonry) and api/discover.js (vendorFacts).
import { useRouter } from 'expo-router'
import { ImageOff, Search as SearchIcon, Send, Star, Store, Upload } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { invalidate } from '@shared/api/catalog.js'
import { vendorFacts } from '@shared/api/discover.js'
import {
  buildExploreTiles, exploreFilters, exploreVendorTiles, listBrowseProviders, listExplorePhotos, masonry, mixExploreTiles,
} from '@shared/api/home.js'
import { verticalMeta } from '@shared/verticals/index.js'
import { Avatar, Button, Chip, EmptyState, ErrorState, Photo, Text, VerticalIcon } from '@/components'
import { fromPriceText } from '@/components/PriceLabel'
import useQuery from '@/hooks/useQuery'
import { IMAGE_BUTTON_ROLE } from '@/lib/a11y'
import { useInvite } from '@/screens/home/Browse'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useReadableTint, useTheme } from '@/theme'
import type { Provider } from '@/types'
import { DiscoverHeader, PillButton } from './DiscoverHeader'

const PAGE = 24
const GAP = 8
const SIDE = 12
const CAP = 1.4 // Dynamic Type cap inside fixed-size tiles

type PhotoTile = { kind: 'photo'; id: string; src: string; ratio: number; albumId: string; title?: string; provider: Provider }
type VendorTileT = { kind: 'vendor'; id: string; providerId: string; ratio: number; provider: Provider }
type Tile = PhotoTile | VendorTileT
type Filters = { services: { slug: string; name: string; n: number }[] }
type Meta = { slug: string; name: string; noun: string; icon: string; tint: string }
const META = verticalMeta() as Meta

export function Explore({ tabs, service }: { tabs: ReactNode; service: string | null }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { user } = useAuth()
  const { myProvider } = useStore()
  const invite = useInvite()
  const { width } = useWindowDimensions()
  const scroller = useRef<ScrollView>(null)

  const photos = useQuery<any[]>(() => listExplorePhotos({ limit: 200 }), [])
  const providers = useQuery<Provider[]>(() => listBrowseProviders(), [user?.id])
  const ready = !!photos.data && !!providers.data
  const error = photos.error || providers.error
  const args = { photos: photos.data, providers: providers.data, service } as any
  const filters: Filters = ready ? (exploreFilters(args) as Filters) : { services: [] }
  const photoTiles: Tile[] = ready ? (buildExploreTiles(args) as Tile[]) : []
  // Photographers without posts: tiles between the photos.
  const vendorTiles: Tile[] = ready ? (exploreVendorTiles(args) as Tile[]) : []
  const tiles = mixExploreTiles(photoTiles as any, vendorTiles as any, 6) as Tile[]
  const noPosts = ready && photoTiles.length === 0
  // A service picked elsewhere (a deck chip) that has no photos still shows as a chip.
  const serviceChips = service && !filters.services.some((x) => x.slug === service)
    ? [{ slug: service, name: (META as any).services?.find((x: { slug: string }) => x.slug === service)?.name || service, n: 0 }, ...filters.services]
    : filters.services

  const [shown, setShown] = useState(PAGE)
  useEffect(() => {
    setShown(PAGE)
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [service])
  const more = tiles.length > shown
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    if (more && contentOffset.y + layoutMeasurement.height > contentSize.height - 600) setShown((n) => n + PAGE)
  }

  const setService = (value: string | null) => router.setParams({ s: value ?? undefined, v: undefined, o: undefined } as any)
  const clearAll = () => setService(null)
  const refresh = () => {
    invalidate('home:explore')
    photos.reload()
    providers.reload()
  }

  const colWidth = Math.floor((Math.min(width, 700) - SIDE * 2 - GAP) / 2)
  const columns = masonry(tiles.slice(0, shown), 2) as Tile[][]

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DiscoverHeader tabs={tabs} right={<PillButton icon={SearchIcon} label="Search" onPress={() => router.push('/search')} />} />

      <ScrollView
        ref={scroller}
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={c.muted} colors={[c.ink]} progressBackgroundColor={c.card} />}
        contentContainerStyle={s.content}
      >
        {ready && serviceChips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityLabel="Filter by service">
            <Chip label="All" toggle select on={!service} onPress={clearAll} accessibilityLabel="All services" />
            {serviceChips.map((x) => (
              <Chip key={x.slug} label={x.name} toggle select on={service === x.slug} onPress={() => setService(service === x.slug ? null : x.slug)} />
            ))}
          </ScrollView>
        )}

        {error && <ErrorState error={error} onRetry={refresh} />}
        {!ready && !error && <GridSkeleton width={colWidth} />}

        {/* Nobody has posted yet: say so, and invite. */}
        {noPosts && !service && (
          <View style={[s.beFirst, { backgroundColor: `${META.tint}14`, borderColor: `${META.tint}40` }]}>
            <VerticalIcon name={META.icon} tint={META.tint} size={22} bubble bubbleSize={48} />
            <View style={s.grow}>
              <Text variant="body" weight="700">No posts yet</Text>
              <Text variant="small" muted style={s.mtXs}>
                {myProvider
                  ? 'Be the first to post your photo or video work here.'
                  : vendorTiles.length
                    ? 'Here are the photographers and videographers on photomatch. Know another great one? Invite them.'
                    : 'Be the first photographer or videographer on photomatch, or invite one you love.'}
              </Text>
              <View style={s.actions}>
                {myProvider ? (
                  <Button title="Post your work" icon={Upload} size="sm" onPress={() => router.push('/upload')} />
                ) : (
                  <Button title="List your work" icon={Store} size="sm" onPress={() => router.push('/new-listing')} />
                )}
                <Button title="Invite a photographer" icon={Send} size="sm" variant="ghost" onPress={invite} />
              </View>
            </View>
          </View>
        )}
        {ready && tiles.length === 0 && !!service && (
          <EmptyState
            icon={ImageOff}
            title="No posts here yet"
            text="New work shows up as soon as photographers and videographers post it."
            action={<Button title="See everything" variant="ghost" size="sm" onPress={clearAll} />}
          />
        )}

        {tiles.length > 0 && (
          <View style={s.masonry}>
            {columns.map((col, i) => (
              <View key={i} style={[s.col, { width: colWidth }]}>
                {col.map((t) =>
                  t.kind === 'vendor' ? (
                    <VendorTile key={t.id} t={t} width={colWidth} onOpen={() => router.push(`/u/${t.provider.id}`)} />
                  ) : (
                    <ExploreTile
                      key={t.id}
                      t={t}
                      width={colWidth}
                      onOpen={() => router.push({ pathname: '/gallery/[personId]', params: { personId: t.provider.id, post: t.albumId, photo: t.id } })}
                      onOpenProvider={() => router.push(`/u/${t.provider.id}`)}
                    />
                  ),
                )}
              </View>
            ))}
          </View>
        )}
        {ready && tiles.length > 0 && !more && <Text variant="tiny" muted center style={s.end}>You’re all caught up</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

function ExploreTile({ t, width, onOpen, onOpenProvider }: { t: PhotoTile; width: number; onOpen: () => void; onOpenProvider: () => void }) {
  const s = useStyles()
  const p = t.provider
  return (
    <View>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.tileImg, pressed && s.pressed]}
        accessibilityRole={IMAGE_BUTTON_ROLE}
        accessibilityLabel={`${t.title || 'Post'} by ${p.name}`}
      >
        <Photo uri={t.src} style={{ width, height: Math.round(width * t.ratio) }} />
      </Pressable>
      <Pressable onPress={onOpenProvider} style={s.cap} accessibilityRole="link" accessibilityLabel={p.name}>
        <Avatar uri={p.avatar} name={p.name} size={22} />
        <Text variant="tiny" weight="600" numberOfLines={1} style={s.grow}>{p.name}</Text>
      </Pressable>
    </View>
  )
}

// A photographer who hasn't posted yet: the vertical's colour, name, key facts and price.
function VendorTile({ t, width, onOpen }: { t: VendorTileT; width: number; onOpen: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const readable = useReadableTint()
  const p = t.provider
  const m = verticalMeta(p.vertical) as Meta
  const ink = readable(m.tint, 5) // on the card surface inside the tile
  const facts = ((vendorFacts(p) as { lines: string[] }).lines || []).slice(0, 2)
  const price = fromPriceText(p)
  return (
    <View>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.tileImg, s.vtile, { width, minHeight: Math.round(width * t.ratio), backgroundColor: `${m.tint}1f` }, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={[p.name, m.noun, ...facts, p.rating != null ? `rated ${p.rating.toFixed(1)}` : 'new', price].filter(Boolean).join(', ')}
        accessibilityHint="Opens their profile"
      >
        <View style={s.vtileArt} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <VerticalIcon name={m.icon} tint={m.tint} size={64} />
        </View>
        <View style={s.vtileBody} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={s.row}>
            <VerticalIcon name={m.icon} size={12} color={ink} />
            <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="700" style={{ color: ink }}>{m.noun[0].toUpperCase() + m.noun.slice(1)}</Text>
          </View>
          <Text maxFontSizeMultiplier={CAP} variant="body" weight="700" numberOfLines={2}>{p.name}</Text>
          {facts.map((f) => <Text key={f} maxFontSizeMultiplier={CAP} variant="tiny" numberOfLines={1}>{f}</Text>)}
          <View style={s.row}>
            {p.rating != null ? (
              <>
                <Star size={11} color={c.star} fill={c.star} />
                <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600">{p.rating.toFixed(1)}</Text>
              </>
            ) : <Text maxFontSizeMultiplier={CAP} variant="tiny" weight="600">New</Text>}
            {!!price && <Text maxFontSizeMultiplier={CAP} variant="tiny" numberOfLines={1} style={s.shrink}>· {price}</Text>}
          </View>
        </View>
      </Pressable>
      <View style={s.cap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Avatar uri={p.avatar} name={p.name} size={22} />
        <Text variant="tiny" weight="600" numberOfLines={1} style={s.grow}>{p.name}</Text>
      </View>
    </View>
  )
}

// Grey masonry blocks while photos load.
function GridSkeleton({ width }: { width: number }) {
  const s = useStyles()
  const heights = [[220, 160, 240], [170, 230, 190]]
  return (
    <View style={s.masonry} accessibilityElementsHidden>
      {heights.map((col, i) => (
        <View key={i} style={[s.col, { width }]}>
          {col.map((h, j) => <View key={j} style={[s.skel, { height: h }]} />)}
        </View>
      ))}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  content: { paddingBottom: t.space.xxl },
  chips: { flexDirection: 'row', gap: 6, paddingHorizontal: t.space.lg, paddingTop: 2, paddingBottom: 8, alignItems: 'center' },
  masonry: { flexDirection: 'row', gap: GAP, paddingHorizontal: SIDE, alignItems: 'flex-start', marginTop: 4 },
  col: { gap: 12 },
  tileImg: { borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.soft },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  cap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 2 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  skel: { borderRadius: t.radius.lg, backgroundColor: t.c.soft },
  end: { paddingTop: 20, paddingBottom: 8 },
  vtile: { justifyContent: 'flex-end' },
  vtileArt: { position: 'absolute', top: 14, right: 10, opacity: 0.35 },
  vtileBody: { padding: 12, gap: 3, backgroundColor: t.c.card, margin: 6, borderRadius: t.radius.md },
  beFirst: { flexDirection: 'row', gap: 12, marginHorizontal: t.space.lg, marginTop: 4, marginBottom: 12, padding: 14, borderRadius: t.radius.xl, borderWidth: 1 },
  mtXs: { marginTop: t.space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
}))
