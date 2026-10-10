// /services/[vertical]: native version of frontend/src/screens/ServiceHome.jsx.
// Hero (tint gradient, counts, "from" price, Map / See all), service chips with counts
// (?s= in the route params), shelves from the shared api/home.js buildVerticalPage():
// free this weekend, top rated, under $X, all; "Popular for" occasions; and for a vertical
// with nobody yet an intentional coming-soon state (invite via the share sheet, list your
// services, other live verticals).
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Map as MapIcon, Search as SearchIcon, SearchX, Send, Store, Tag } from 'lucide-react-native'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { buildVerticalPage, comingWeekend, listBrowseProviders, liveVerticals, pluralLower, weekendAvailability, withArticle } from '@shared/api/home.js'
import { fmtChip, toKey } from '@shared/lib/dates.js'
import { money } from '@shared/lib/format.js'
import { getVertical, unitLabel } from '@shared/verticals/catalog.js'
import { Button, Chip, ChipRow, EmptyState, ErrorState, Loading, Screen, SectionHeader, Text, VerticalIcon } from '@/components'
import useQuery from '@/hooks/useQuery'
import { makeStyles } from '@/theme'
import type { Occasion, Provider, Vertical } from '@/types'
import { useInvite } from '../home/Browse'
import { ProviderList, ProviderShelf } from '../home/ProviderShelves'
import { CatalogHero, FloatBar, MetaPill } from './Hero'

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)

export default function VerticalScreen() {
  const router = useRouter()
  const { vertical: slug } = useLocalSearchParams<{ vertical: string }>()
  const v = getVertical(String(slug))
  if (!v) {
    return (
      <Screen title="Services" back>
        <EmptyState icon={SearchX} title="We don’t have that service" text="Browse every service from Home."
          action={<Button title="Go home" size="sm" onPress={() => router.replace('/')} />} />
      </Screen>
    )
  }
  return <VerticalPage key={v.slug} v={v} />
}

function VerticalPage({ v }: { v: Vertical }) {
  const s = useStyles()
  const router = useRouter()
  const invite = useInvite()
  const params = useLocalSearchParams<{ s?: string }>()
  const service = one(params.s) || null
  const setService = (x: string | null) => router.setParams({ s: x ?? undefined } as any)

  const providers = useQuery<Provider[]>(() => listBrowseProviders(), [])
  const weekend = useQuery<Map<string, string[]>>(() => weekendAvailability(v.slug as any), [v.slug])
  const page = buildVerticalPage({ vertical: v, providers: providers.data || [], weekend: weekend.data || new Map(), service } as any)
  const loading = providers.loading && !providers.data
  const empty = !!providers.data && page.total === 0
  const unit = unitLabel(v.priceUnit)
  const plural = pluralLower(v)
  const serviceName = v.services.find((x: { slug: string }) => x.slug === service)?.name
  const searchParams = { v: v.slug, ...(service ? { cat: service } : {}) }
  const others = providers.data ? (liveVerticals(providers.data, v.slug as any) as (Vertical & { count: number })[]) : []
  const toSearch = (extra: Record<string, string> = {}) => router.push({ pathname: '/search', params: { ...searchParams, ...extra } })

  return (
    <SafeAreaView style={s.root} edges={[]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <CatalogHero icon={v.icon} tint={v.tint} title={v.name} text={v.tagline}>
          <View style={s.meta}>
            {loading ? <MetaPill label="Loading…" /> : empty ? <MetaPill label="Coming soon near you" tint={v.tint} /> : (
              <MetaPill label={`${page.total} ${page.total === 1 ? v.noun : plural}`} />
            )}
            {page.minPrice != null && <MetaPill icon={Tag} label={`from ${money(page.minPrice)}${unit ? ` ${unit}` : ''}`} />}
            {page.minPrice == null && !!unit && <MetaPill label={`Priced ${unit}`} />}
          </View>
          {!empty && !loading && (
            <View style={s.heroActions}>
              <Button title="Map" icon={MapIcon} variant="ghost" grow onPress={() => toSearch({ view: 'map' })} style={s.heroBtn} />
              <Button title="See all" icon={SearchIcon} grow onPress={() => toSearch()} />
            </View>
          )}
        </CatalogHero>

        {!empty && (
          <ChipRow scroll>
            <Chip label="All" toggle on={!service} onPress={() => setService(null)} />
            {v.services.map((x: { slug: string; name: string }) => {
              const n = page.offered.get(x.slug) || 0
              return <Chip key={x.slug} label={n ? `${x.name} · ${n}` : x.name} toggle on={service === x.slug} onPress={() => setService(service === x.slug ? null : x.slug)} />
            })}
          </ChipRow>
        )}

        {providers.error && <ErrorState error={providers.error} onRetry={providers.reload} />}
        {loading && <Loading inline />}

        {empty && (
          <>
            <View style={s.pad}>
              <View style={s.card}>
                <Text variant="h4">No {plural} here yet</Text>
                <Text variant="small" muted style={s.mtXs}>
                  We’re bringing {plural} to the app. Invite {withArticle(v.noun)} you love so you can book them here, or be the first to list.
                </Text>
                <Button title={`Invite ${withArticle(v.noun)}`} icon={Send} block onPress={() => invite(v)} style={s.mt} />
                <Button title="List your services" icon={Store} variant="ghost" block onPress={() => router.push({ pathname: '/new-listing', params: { v: v.slug } })} style={s.mtSm} />
              </View>
            </View>
            <SectionHeader title="What you’ll be able to book" />
            <ChipRow style={s.padX}>
              {v.services.map((x: { slug: string; name: string }) => <Chip key={x.slug} label={x.name} />)}
            </ChipRow>
          </>
        )}

        {!loading && !empty && !!providers.data && (
          page.list.length === 0 ? (
            <EmptyState
              compact
              title={`No ${plural} offer ${serviceName?.toLowerCase() ?? 'this'} yet`}
              text="Try another service, or see everyone."
              action={<Button title={`Show all ${plural}`} variant="ghost" size="sm" onPress={() => setService(null)} />}
            />
          ) : (
            <>
              <ProviderShelf
                title="Free this weekend"
                sub={comingWeekend().map(fmtChip).join(' – ')}
                providers={page.free}
                loading={weekend.loading}
                emptyText={`Nobody${serviceName ? ` offering ${serviceName.toLowerCase()}` : ''} has free time this weekend yet.`}
                onSeeAll={page.free.length ? () => toSearch({ dates: comingWeekend().map(toKey).join(',') }) : undefined}
              />
              {page.rated.length > 0 && <ProviderShelf title="Top rated" sub="Loved by clients" providers={page.rated.slice(0, 8)} onSeeAll={() => toSearch()} />}
              {page.budget.items.length >= 2 && (
                <ProviderShelf title={`Under ${money(page.budget.cap)}`} sub="Great work at a friendly price" providers={page.budget.items.slice(0, 8)} />
              )}
              <ProviderList
                title={`All ${serviceName ? `${serviceName.toLowerCase()} ` : ''}${plural}`}
                sub={`${page.list.length} available`}
                providers={page.list}
                onSeeAll={() => toSearch()}
              />
            </>
          )
        )}

        {page.occasions.length > 0 && (
          <>
            <SectionHeader title="Popular for" />
            <View style={[s.padX, s.wrap]}>
              {(page.occasions as Occasion[]).map((o) => (
                <TintChip key={o.slug} icon={o.icon} tint={o.tint} label={o.name} onPress={() => router.push(`/occasions/${o.slug}`)} />
              ))}
            </View>
          </>
        )}

        {empty && others.length > 0 && (
          <>
            <SectionHeader title="Book now" sub="Already on the app near you" />
            <View style={[s.padX, s.wrap]}>
              {others.map((o) => (
                <TintChip key={o.slug} icon={o.icon} tint={o.tint} label={`${o.plural} · ${o.count}`} onPress={() => router.push(`/services/${o.slug}`)} />
              ))}
            </View>
          </>
        )}

        {!empty && !loading && (
          <View style={[s.pad, s.mtLg]}>
            <View style={s.card}>
              <Text variant="h4">Are you {withArticle(v.noun)}?</Text>
              <Text variant="small" muted style={s.mtXs}>
                List your {v.name.toLowerCase()} services, set your prices and availability, and get booked by people planning events nearby.
              </Text>
              <Button title="List your services" icon={Store} variant="ghost" size="sm" onPress={() => router.push({ pathname: '/new-listing', params: { v: v.slug } })} style={s.mt} />
            </View>
          </View>
        )}
      </ScrollView>
      <FloatBar onSearch={empty ? undefined : () => toSearch()} searchLabel={`Search ${plural}`} />
    </SafeAreaView>
  )
}

// An occasion / vertical as a tinted pill (the web's .hd-occ-chip).
export function TintChip({ icon, tint, label, onPress }: { icon: string; tint: string; label: string; onPress: () => void }) {
  const s = useStyles()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tintChip, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="link">
      <VerticalIcon name={icon} tint={tint} size={14} bubble bubbleSize={30} />
      <Text variant="small" weight="600">{label}</Text>
    </Pressable>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.c.bg },
  scroll: { paddingBottom: t.space.xxl },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroBtn: { backgroundColor: t.c.bg, borderWidth: 1, borderColor: t.c.line },
  pad: { paddingHorizontal: t.space.lg, paddingTop: t.space.md },
  padX: { paddingHorizontal: t.space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.xl, padding: 16, backgroundColor: t.c.card },
  mt: { marginTop: t.space.md },
  mtSm: { marginTop: t.space.sm },
  mtXs: { marginTop: t.space.xs, lineHeight: 19 },
  mtLg: { marginTop: t.space.lg },
  tintChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 12, borderRadius: 999, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg },
}))
