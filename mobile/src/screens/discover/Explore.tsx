// Discover -> "Explore": a Pinterest-style two-column masonry of real portfolio posts
// across every vertical (native port of frontend/src/components/discover/Explore.jsx).
// Chips filter by vertical, service and occasion (kept in the route params ?v= / ?s= / ?o=);
// tap a photo to open it in its post, tap the name to open the vendor. Vendors who haven't
// posted yet appear as tinted vendor tiles between the photos, and a vertical with no posts
// shows its vendors plus a "be the first" invite. Pages in 24 at a time as you scroll.
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
  buildExploreTiles, exploreFilters, exploreVendorTiles, listBrowseProviders, listExplorePhotos, masonry, mixExploreTiles, withArticle,
} from '@shared/api/home.js'
import { nounFor, postConfig, verticalMeta } from '@shared/verticals/index.js'
import { Avatar, Button, Chip, EmptyState, ErrorState, Photo, Text, VerticalIcon } from '@/components'
import { fromPriceText } from '@/components/PriceLabel'
import useQuery from '@/hooks/useQuery'
import { IMAGE_BUTTON_ROLE } from '@/lib/a11y'
import { useInvite } from '@/screens/home/Browse'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useReadableTint, useTheme } from '@/theme'
import type { Occasion, Provider, Vertical } from '@/types'
import { DiscoverHeader, PillButton } from './DiscoverHeader'
import { TintChip } from './VerticalPicker'

const PAGE = 24
const GAP = 8
const SIDE = 12
const CAP = 1.4 // Dynamic Type cap inside fixed-size tiles

type PhotoTile = { kind: 'photo'; id: string; src: string; ratio: number; albumId: string; title?: string; provider: Provider }
type VendorTileT = { kind: 'vendor'; id: string; providerId: string; ratio: number; provider: Provider }
type Tile = PhotoTile | VendorTileT
type Filters = {
  allVerticals: (Vertical & { photos: number; vendors: number })[]
  services: { slug: string; name: string; n: number }[]
  occasions: (Occasion & { n: number })[]
}
type Meta = { slug: string; name: string; noun: string; icon: string; tint: string }

export function Explore({ tabs, vertical: v, service, occasion }: { tabs: ReactNode; vertical: string | null; service: string | null; occasion: string | null }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const { user } = useAuth()
  const { myProviders = [] } = useStore()
  const invite = useInvite()
  const { width } = useWindowDimensions()
  const scroller = useRef<ScrollView>(null)
  const vertical = v && v !== 'all' ? v : null
  // The vertical chips scroll so the selected one is in view (e.g. arriving from the deck on DJs).
  const chipRow = useRef<ScrollView>(null)
  const chipX = useRef<Record<string, number>>({})

  const photos = useQuery<any[]>(() => listExplorePhotos({ limit: 200 }), [])
  const providers = useQuery<Provider[]>(() => listBrowseProviders(), [user?.id])
  const ready = !!photos.data && !!providers.data
  const error = photos.error || providers.error
  const args = { photos: photos.data, providers: providers.data, vertical, service } as any
  const filters: Filters = ready ? (exploreFilters(args) as Filters) : { allVerticals: [], services: [], occasions: [] }
  const photoTiles: Tile[] = ready ? (buildExploreTiles({ ...args, occasion }) as Tile[]) : []
  // Vendors without posts: tiles between the photos (not when narrowing to an occasion).
  const vendorTiles: Tile[] = ready && !occasion ? (exploreVendorTiles(args) as Tile[]) : []
  const tiles = mixExploreTiles(photoTiles as any, vendorTiles as any, vertical ? 4 : 6) as Tile[]
  const meta = vertical ? (verticalMeta(vertical) as Meta) : null
  const noPosts = ready && photoTiles.length === 0
  const mine = vertical ? myProviders.find((p: Provider) => p.vertical === vertical) : null

  const [shown, setShown] = useState(PAGE)
  useEffect(() => {
    setShown(PAGE)
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [vertical, service, occasion])
  const chipsReady = ready && filters.allVerticals.length > 0
  useEffect(() => {
    const t = setTimeout(() => {
      const x = vertical ? chipX.current[vertical] : 0
      if (x != null) chipRow.current?.scrollTo({ x: Math.max(0, x - 60), animated: false })
    }, 50)
    return () => clearTimeout(t)
  }, [vertical, chipsReady])
  const more = tiles.length > shown
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    if (more && contentOffset.y + layoutMeasurement.height > contentSize.height - 600) setShown((n) => n + PAGE)
  }

  const setFilter = (key: 'v' | 's' | 'o', value: string | null) =>
    router.setParams((key === 'v' ? { v: value ?? undefined, s: undefined, o: undefined } : key === 's' ? { s: value ?? undefined, o: undefined } : { o: value ?? undefined }) as any)
  const clearAll = () => router.setParams({ v: undefined, s: undefined, o: undefined } as any)
  const refresh = () => {
    invalidate('home:explore')
    photos.reload()
    providers.reload()
  }

  const colWidth = Math.floor((Math.min(width, 700) - SIDE * 2 - GAP) / 2)
  const columns = masonry(tiles.slice(0, shown), 2) as Tile[][]
  const subFilters = (vertical ? filters.services.length : 0) + filters.occasions.length > 0

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
        {ready && (
          <ScrollView ref={chipRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityLabel="Filter posts">
            <Chip label="All" toggle on={!vertical && !service && !occasion} onPress={clearAll} />
            {filters.allVerticals.map((x) => (
              <View key={x.slug} onLayout={(e) => { chipX.current[x.slug] = e.nativeEvent.layout.x }}>
                <TintChip info={x} label={x.name} on={vertical === x.slug} onPress={() => setFilter('v', vertical === x.slug ? null : x.slug)} />
              </View>
            ))}
          </ScrollView>
        )}
        {ready && subFilters && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityLabel={meta ? `Filter ${meta.name}` : 'Filter by occasion'}>
            {!!vertical && filters.services.map((x) => (
              <Chip key={x.slug} label={x.name} toggle on={service === x.slug} onPress={() => setFilter('s', service === x.slug ? null : x.slug)} />
            ))}
            {!!vertical && filters.services.length > 0 && filters.occasions.length > 0 && <View style={s.divider} />}
            {filters.occasions.map((o) => (
              <TintChip key={o.slug} info={o} label={o.name} on={occasion === o.slug} onPress={() => setFilter('o', occasion === o.slug ? null : o.slug)} />
            ))}
          </ScrollView>
        )}

        {error && <ErrorState error={error} onRetry={refresh} />}
        {!ready && !error && <GridSkeleton width={colWidth} />}

        {/* A vertical nobody has posted in yet: say so, and invite. */}
        {noPosts && meta && !service && !occasion && (
          <View style={[s.beFirst, { backgroundColor: `${meta.tint}14`, borderColor: `${meta.tint}40` }]}>
            <VerticalIcon name={meta.icon} tint={meta.tint} size={22} bubble bubbleSize={48} />
            <View style={s.grow}>
              <Text variant="body" weight="700">{vendorTiles.length ? `No ${postConfig(meta.slug).noun} posts yet` : `No ${nounFor(meta.slug, 2)} yet`}</Text>
              <Text variant="small" muted style={s.mtXs}>
                {mine
                  ? `Be the first ${meta.noun} to post your work here.`
                  : vendorTiles.length
                    ? `Here are the ${nounFor(meta.slug, 2)} on photomatch. Know another great ${meta.noun}? Invite them.`
                    : `Be the first ${meta.noun} on photomatch, or invite one you love.`}
              </Text>
              <View style={s.actions}>
                {mine ? (
                  <Button title="Post your work" icon={Upload} size="sm" onPress={() => router.push('/upload')} />
                ) : (
                  <Button title="List your services" icon={Store} size="sm" onPress={() => router.push({ pathname: '/new-listing', params: { v: meta.slug } } as any)} />
                )}
                <Button title={`Invite ${withArticle(meta.noun)}`} icon={Send} size="sm" variant="ghost" onPress={() => invite(meta as any)} />
              </View>
            </View>
          </View>
        )}
        {ready && tiles.length === 0 && !(vertical && !service && !occasion) && (
          <EmptyState
            icon={ImageOff}
            title="No posts here yet"
            text="New work shows up as soon as vendors post it."
            action={(vertical || service || occasion) ? <Button title="See everything" variant="ghost" size="sm" onPress={clearAll} /> : undefined}
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

// A vendor who hasn't posted yet: their vertical's colour, name, key facts and price.
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
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 4, marginHorizontal: 2, backgroundColor: t.c.line },
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
