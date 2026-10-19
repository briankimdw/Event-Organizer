// /search: native port of frontend/src/screens/Search.jsx.
// Params (like the web URL): ?q= text, ?cat= service slug (or name, older links),
// ?dates=YYYY-MM-DD,..., ?view=map, ?focus= provider to open on the map, ?bbox=w,s,e,n map area.
// (?v= from old links is ignored: photo & video is the only vertical.)
// Ported: text search, service chips (photo and video services), dates (picker sheet + removable
// chips), list / map views (react-native-maps; "Search this area"), filters sheet (price, rating,
// distance, Pro, ID), sort sheet (incl. Nearest), availability footer with Book.
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowUpDown, CalendarCheck, CalendarDays, Check, List, LocateFixed, Map as MapIcon, MapPin, MapPinOff, Plus, Search as SearchIcon, SearchX,
  SlidersHorizontal, X, type LucideIcon,
} from 'lucide-react-native'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Switch, View } from 'react-native'

import { listProviders, searchProviders, withMatches } from '@shared/api/catalog.js'
import { distanceKm, fmtBbox, fmtKm, getMyLocation, lastKnownLocation, parseBbox, parsePoint, splitByArea } from '@shared/api/locations.js'
import { fmtChip, fromKey, isPast, parseDates } from '@shared/lib/dates.js'
import { money, startingPrice } from '@shared/lib/format.js'
import { PHOTO_VERTICAL, SERVICE_CHIPS, getService, isPhotoVertical, verticalMeta } from '@shared/verticals/index.js'
import {
  Button, Chip, ChipRow, DatePicker, EmptyState, ErrorState, Loading, ProviderCard, Screen, Sheet, Text, TextField, iconByName,
} from '@/components'
import { ProviderMap, type Box, type LatLng, type MapProvider } from '@/components/map'
import useQuery from '@/hooks/useQuery'
import { announce } from '@/lib/a11y'
import { useAuth } from '@/state/auth'
import { useStore } from '@/state/store'
import { makeStyles, useTheme } from '@/theme'
import type { Provider } from '@/types'

// Starting-price filter (a shoot's starting price).
const PRICE_OPTIONS = [
  { value: null as number | null, label: 'Any' },
  ...[250, 500, 1500].map((v) => ({ value: v as number | null, label: `Under ${money(v)}` })),
]
const RATING_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 4.5, label: '4.5+' },
  { value: 4.8, label: '4.8+' },
]
type Distance = null | 'travels' | number
const DISTANCE_OPTIONS: { value: Distance; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 'travels', label: 'Travels to you' },
  { value: 10, label: 'Within 10 km' },
  { value: 25, label: 'Within 25 km' },
  { value: 50, label: 'Within 50 km' },
]
type Result = Provider & { distanceKm: number | null }
const byRating = (a: Provider, b: Provider) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount
const SORTS = {
  match: { label: 'Best match', fn: (a: Result, b: Result) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || byRating(a, b) },
  rating: { label: 'Top rated', fn: byRating },
  price: { label: 'Lowest price', fn: (a: Result, b: Result) => (startingPrice(a) ?? Infinity) - (startingPrice(b) ?? Infinity) },
  distance: { label: 'Nearest', fn: (a: Result, b: Result) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byRating(a, b) },
}
type SortKey = keyof typeof SORTS
type Filters = { maxPrice: number | null; minRating: number | null; proOnly: boolean; idOnly: boolean; distance: Distance }
const NO_FILTERS: Filters = { maxPrice: null, minRating: null, proOnly: false, idOnly: false, distance: null }
const withinDistance = (p: Result, d: Distance) => (d === 'travels' ? (p.distanceKm ?? Infinity) <= (p.radiusKm ?? 0) : (p.distanceKm ?? Infinity) <= (d as number))

const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)

// ?cat= a service slug, or a service name (older links). Anything else (an old vertical slug) = all.
const META = verticalMeta()
const PLURAL = 'photographers & videographers'
function resolveService(cat?: string): string | null {
  if (!cat) return null
  if (getService(cat)) return cat
  return META.services.find((sv: { slug: string; name: string }) => sv.name.toLowerCase() === cat.toLowerCase())?.slug ?? null
}
const countLabel = (n: number) => `${n} ${n === 1 ? 'pro' : 'pros'}`

type Params = { q?: string; v?: string; cat?: string; dates?: string; view?: string; focus?: string; bbox?: string }

export default function Search() {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<Params>()
  const { user, profile } = useAuth()
  const { toast } = useStore()

  const [query, setQuery] = useState(one(params.q) || '')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('match')
  const [sheet, setSheet] = useState<null | 'dates' | 'filters' | 'sort'>(null)
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }))
  // Route params play the web URL's part: Back returns to the same search.
  const update = (patch: Partial<Record<keyof Params, string | undefined>>) => router.setParams(patch as any)

  // What: one of the photo / video services (?cat=).
  const service = resolveService(one(params.cat))
  const serviceName: string | null = service ? getService(service)?.name ?? null : null
  const setService = (slug: string | null) => update({ v: undefined, cat: slug ?? undefined })

  // List or map; focus: a provider to open on the map; bbox: the searched map area.
  const view = one(params.view) === 'map' ? 'map' : 'list'
  const focusId = one(params.focus) || null
  const setView = (next: 'list' | 'map') => update({ view: next === 'map' ? 'map' : undefined, focus: undefined })
  const bboxParam = one(params.bbox)
  const area = useMemo(() => parseBbox(bboxParam) as Box | null, [bboxParam])
  const setArea = (box: Box | null) => update({ bbox: box ? fmtBbox(box) : undefined })

  // The user's location (optional): asked for on demand, remembered on this device.
  const [myLoc, setMyLoc] = useState<LatLng | null>(() => lastKnownLocation())
  const userLocation: LatLng | null = myLoc || parsePoint((profile as any)?.location)
  const locate = async (): Promise<LatLng | null> => {
    try {
      const point = await getMyLocation()
      setMyLoc(point)
      return point
    } catch (e: any) {
      toast(e?.message || 'Couldn’t find your location.')
      return null
    }
  }

  // Dates live in the route params (so Back keeps them), like the web's URL.
  const dates: string[] = parseDates(one(params.dates))
  const setDates = (next: string[]) => update({ dates: next.length ? [...next].sort().join(',') : undefined })
  const toggleDate = (key: string) => setDates(dates.includes(key) ? dates.filter((k) => k !== key) : [...dates, key])
  const datesParam = dates.length ? dates.join(',') : undefined

  const all = useQuery<Provider[]>(() => listProviders().then(withMatches), [user?.id])
  // Dates, service, price, rating and Pro are filtered in the database.
  const serverArgs = { dates, service, maxPrice: filters.maxPrice, minRating: filters.minRating, proOnly: filters.proOnly }
  const needsServer = dates.length > 0 || !!service || filters.maxPrice != null || filters.minRating != null || filters.proOnly
  const searched = useQuery<Provider[]>(
    // JS default params (`dates = []`) infer as never[] in TS, hence the cast.
    needsServer ? () => searchProviders(serverArgs as any) : null,
    [JSON.stringify(serverArgs), needsServer],
  )

  const matchOf = new Map((all.data || []).map((p) => [p.id, p.tasteMatch]))
  const hasMatches = [...matchOf.values()].some((m) => m != null)
  const sortKey: SortKey = (sort === 'match' && !hasMatches) || (sort === 'distance' && !userLocation) ? (hasMatches ? 'match' : 'rating') : sort
  const distanceFilter = userLocation ? filters.distance : null
  const freeOn = (p: Provider) => (dates.length ? (p.freeDates || []).filter((k: string) => dates.includes(k)) : [])

  const source = needsServer ? searched : all
  const loading = (all.data === undefined && !all.error) || (source.data === undefined && !source.error)
  const error = all.error || source.error
  const q = query.trim().toLowerCase()
  const allResults: Result[] = (source.data || [])
    .filter((p) => isPhotoVertical(p.vertical)) // the live data may still hold other verticals
    .map((p) => ({ ...p, tasteMatch: matchOf.get(p.id) ?? null, distanceKm: distanceKm(userLocation, p.location) }))
    .filter((p) => distanceFilter == null || (p.distanceKm != null && withinDistance(p, distanceFilter)))
    .filter((p) => !q || [p.name, p.username, p.city, p.verticalInfo?.name, ...p.specialties, ...p.categories].join(' ').toLowerCase().includes(q))
    .filter((p) => !filters.idOnly || p.idVerified)
    .sort((a, b) => freeOn(b).length - freeOn(a).length || SORTS[sortKey].fn(a, b))
  const onMap = allResults.filter((p) => p.location) as (Result & MapProvider)[]
  // In a map area: providers based in it, then ones based elsewhere who travel to it.
  const { inside: areaInside, travels: areaTravels } = splitByArea(onMap, area) as { inside: Result[]; travels: Result[] }
  const results = area ? [...areaInside, ...areaTravels] : allResults
  const fullyFree = results.filter((p) => freeOn(p).length === dates.length).length
  const plural = PLURAL

  // Removable chips for whatever is filtering the list.
  const activeChips = [
    area && { key: 'area', label: 'Map area', icon: MapPin, clear: () => setArea(null) },
    filters.maxPrice != null && { key: 'maxPrice', label: `Under ${money(filters.maxPrice)}`, clear: () => setFilter('maxPrice', null) },
    filters.minRating != null && { key: 'minRating', label: `${filters.minRating}+ stars`, clear: () => setFilter('minRating', null) },
    filters.proOnly && { key: 'pro', label: 'Verified Pro', clear: () => setFilter('proOnly', false) },
    filters.idOnly && { key: 'id', label: 'ID verified', clear: () => setFilter('idOnly', false) },
    distanceFilter != null && { key: 'distance', label: DISTANCE_OPTIONS.find((o) => o.value === distanceFilter)?.label || '', clear: () => setFilter('distance', null) },
  ].filter(Boolean) as { key: string; label: string; icon?: LucideIcon; clear: () => void }[]
  const filterCount = activeChips.filter((x) => x.key !== 'area').length

  const reload = () => {
    all.reload()
    searched.reload()
  }
  const clearAll = () => {
    setFilters(NO_FILTERS)
    setQuery('')
    update({ cat: undefined, q: undefined })
  }

  const summary =
    area && !dates.length
      ? areaTravels.length
        ? `${areaInside.length ? `${areaInside.length} based here · ` : ''}${areaTravels.length} travel${areaTravels.length === 1 ? 's' : ''} here`
        : `${countLabel(areaInside.length)} in this area`
      : dates.length
        ? `${fullyFree} free on ${dates.length === 1 ? 'your date' : `all ${dates.length} dates`}${results.length > fullyFree ? ` · ${results.length - fullyFree} partly free` : ''}${area ? ' here' : ''}`
        : countLabel(results.length)
  const notOnMap = view === 'map' && !area && results.length > onMap.length && onMap.length > 0 ? ` · ${results.length - onMap.length} not on map` : ''
  // Screen readers hear the new result count once typing / filtering settles.
  const spoken = loading || error ? '' : summary.replace(/ · /g, ', ')
  useEffect(() => {
    if (!spoken) return
    const t = setTimeout(() => announce(spoken), 900)
    return () => clearTimeout(t)
  }, [spoken])

  const header = (
    <View>
      <View style={s.pad}>
        <TextField
          icon={SearchIcon}
          placeholder="Search names, styles, cities"
          accessibilityLabel="Search photographers and videographers by name, style or city"
          value={query}
          onChangeText={setQuery}
          clearable
          autoFocus={!one(params.cat) && !dates.length && view === 'list'}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {/* What: a photo or video service */}
      <ChipRow scroll style={s.rowGap}>
        <Chip label="All" accessibilityLabel="All photo and video services" toggle select on={!service} onPress={() => setService(null)} />
        {/* The picked service first, so it's in view. */}
        {[...SERVICE_CHIPS].sort((a: { slug: string }, b: { slug: string }) => Number(b.slug === service) - Number(a.slug === service)).map((x: { slug: string; name: string; icon: string }) => (
          <Chip key={x.slug} label={x.name} icon={iconByName(x.icon)} toggle select on={service === x.slug} onPress={() => setService(service === x.slug ? null : x.slug)} />
        ))}
        {/* A service that isn't a chip (coaching, meetups) still shows as selected. */}
        {!!service && !SERVICE_CHIPS.some((x: { slug: string }) => x.slug === service) && (
          <Chip label={serviceName || service} toggle select on onPress={() => setService(null)} />
        )}
      </ChipRow>

      {/* When: the dates you need someone for */}
      <View style={s.pad}>
        <View style={[s.when, dates.length > 0 && s.whenSet]}>
          <CalendarDays size={16} color={c.ink} />
          {dates.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.whenChips}>
              {dates.map((k) => (
                <Chip key={k} label={fmtChip(fromKey(k))} accessibilityLabel={`${fmtChip(fromKey(k))}, remove date`} iconRight={X} onPress={() => toggleDate(k)} style={s.dateChip} />
              ))}
              <Chip label="Add" accessibilityLabel="Add dates" icon={Plus} onPress={() => setSheet('dates')} style={s.dateChip} />
            </ScrollView>
          ) : (
            <Pressable onPress={() => setSheet('dates')} style={s.grow} hitSlop={{ top: 13, bottom: 13 }} accessibilityRole="button" accessibilityLabel="Dates: any date" accessibilityHint="Pick the dates you need someone for">
              <Text variant="small"><Text variant="small" weight="700">Any date</Text><Text variant="small" muted> · pick the dates you need</Text></Text>
            </Pressable>
          )}
        </View>
      </View>

      <ChipRow scroll style={s.rowGap}>
        <Chip label={filterCount ? `Filters · ${filterCount}` : 'Filters'} accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'} icon={SlidersHorizontal} toggle asButton on={filterCount > 0} onPress={() => setSheet('filters')} />
        <Chip label={SORTS[sortKey].label} accessibilityLabel={`Sort: ${SORTS[sortKey].label}`} icon={ArrowUpDown} toggle asButton onPress={() => setSheet('sort')} />
        {activeChips.map((x) => (
          <Chip key={x.key} label={x.label} accessibilityLabel={`${x.label}, remove filter`} icon={x.icon} iconRight={X} onPress={x.clear} />
        ))}
      </ChipRow>

      {!error && !loading && (
        <View style={s.resultBar}>
          <Text variant="small" muted numberOfLines={1} style={s.grow}>{summary}{notOnMap}</Text>
          <View style={s.toggle} accessibilityRole="tablist" accessibilityLabel="Show results as">
            <ViewTab icon={List} label="List" on={view === 'list'} onPress={() => setView('list')} />
            <ViewTab icon={MapIcon} label="Map" on={view === 'map'} onPress={() => setView('map')} />
          </View>
        </View>
      )}
    </View>
  )

  const body = error ? (
    <ErrorState error={error} onRetry={reload} />
  ) : loading ? (
    <Loading label={`Finding ${plural}…`} />
  ) : null

  const emptyList = area && results.length === 0 && allResults.length > 0 ? (
    <EmptyState
      icon={MapPinOff}
      title="Nobody in this area"
      text="Nobody matching your search is based in this map area or travels to it."
      action={
        <View style={s.actions}>
          <Button title="Search everywhere" variant="ghost" size="sm" onPress={() => setArea(null)} />
          <Button title="Move the map" variant="ghost" size="sm" onPress={() => setView('map')} />
        </View>
      }
    />
  ) : results.length === 0 ? (
    <EmptyState
      icon={SearchX}
      title={dates.length ? 'Nobody free on those dates' : 'No one found'}
      text={dates.length ? 'Nobody matching these filters is free on those dates.' : `No ${plural} match these filters.`}
      action={
        activeChips.length > 0 || dates.length > 0 || q || service ? (
          <View style={s.actions}>
            {(filterCount > 0 || !!q || !!service) && <Button title="Clear filters" variant="ghost" size="sm" onPress={clearAll} />}
            {!!area && <Button title="Search everywhere" variant="ghost" size="sm" onPress={() => setArea(null)} />}
            {dates.length > 0 && <Button title="Clear dates" variant="ghost" size="sm" onPress={() => setDates([])} />}
          </View>
        ) : undefined
      }
    />
  ) : null

  return (
    <Screen title={serviceName || META.name} subtitle={serviceName ? META.name : undefined} back scroll={false}>
      {view === 'map' && !body ? (
        <View style={s.flex}>
          {header}
          {onMap.length > 0 ? (
            <ProviderMap
              providers={onMap}
              vertical={PHOTO_VERTICAL}
              area={area}
              onAreaChange={setArea}
              userLocation={userLocation}
              onLocate={locate}
              focusId={focusId}
              dates={datesParam}
              fitUser={distanceFilter != null}
              onSelect={(id) => update({ focus: id ?? undefined })}
              style={s.map}
            />
          ) : allResults.length > 0 ? (
            <EmptyState
              icon={MapPinOff}
              title="Not on the map yet"
              text={`${allResults.length === 1 ? 'This pro hasn’t' : 'These pros haven’t'} set where they’re based yet.`}
              action={<Button title="Show the list" variant="ghost" size="sm" onPress={() => setView('list')} />}
            />
          ) : emptyList}
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          {header}
          {body ?? (
            <View style={s.padX}>
              {results.map((p, i) => {
                const free = freeOn(p)
                return (
                  <Fragment key={p.id}>
                    {area && areaTravels.length > 0 && i === areaInside.length && (
                      <View style={s.areaSection}>
                        <Text variant="small" weight="700">{areaInside.length ? 'Also travels here' : `Nobody’s based here yet, but these ${plural} travel here`}</Text>
                        <Text variant="tiny" muted>Based outside this map area; it’s within how far they travel.</Text>
                      </View>
                    )}
                    <ProviderCard
                      provider={p}
                      variant="result"
                      meta={p.distanceKm != null ? `· ${fmtKm(p.distanceKm)}` : undefined}
                      onPress={() => router.push({ pathname: '/u/[id]', params: datesParam ? { id: p.id, dates: datesParam } : { id: p.id } })}
                      footer={
                        dates.length > 0 && free.length > 0 ? (
                          <View style={s.avail}>
                            <CalendarCheck size={13} color={free.length === dates.length ? c.ok : c.warn} />
                            <Text variant="small" weight="600" style={[s.grow, { color: free.length === dates.length ? c.ok : c.warn }]}>
                              {free.length === dates.length
                                ? dates.length === 1 ? 'Free on your date' : `Free on all ${dates.length} dates`
                                : free.length === 1 ? `Free ${fmtChip(fromKey(free[0]))} only` : `Free ${free.length} of ${dates.length} dates`}
                            </Text>
                            <Button title="Book" size="sm" variant="accent" onPress={() => router.push({ pathname: '/book/[providerId]', params: { providerId: p.id, dates: free.join(',') } })} />
                          </View>
                        ) : undefined
                      }
                    />
                  </Fragment>
                )
              })}
              {emptyList}
            </View>
          )}
        </ScrollView>
      )}

      <Sheet open={sheet === 'dates'} onClose={() => setSheet(null)} title="When do you need them?">
        <Text variant="small" muted style={s.sheetLead}>Pick one or more dates. We’ll show who’s free.</Text>
        <DatePicker selected={dates} onToggle={toggleDate} isDisabled={isPast} />
        <Button
          title={dates.length ? `Show ${plural} for ${dates.length === 1 ? fmtChip(fromKey(dates[0])) : `${dates.length} dates`}` : 'Done'}
          block
          onPress={() => setSheet(null)}
          style={s.sheetCta}
        />
      </Sheet>

      <Sheet open={sheet === 'filters'} onClose={() => setSheet(null)} title="Filters">
        <OptionGroup label="Starting price" options={PRICE_OPTIONS} value={filters.maxPrice} onChange={(v) => setFilter('maxPrice', v)} />
        <OptionGroup label="Rating" options={RATING_OPTIONS} value={filters.minRating} onChange={(v) => setFilter('minRating', v)} />
        {userLocation ? (
          <OptionGroup label="Distance" options={DISTANCE_OPTIONS} value={filters.distance} onChange={(v) => setFilter('distance', v)} />
        ) : (
          <View>
            <Text variant="label" style={s.groupLabel}>Distance</Text>
            <View style={s.locRow}>
              <Text variant="small" muted style={s.grow}>Share your location to find {plural} who travel to you.</Text>
              <Button title="Use my location" icon={LocateFixed} variant="ghost" size="sm" onPress={locate} />
            </View>
          </View>
        )}
        <Text variant="label" style={s.groupLabel}>Trust</Text>
        <ToggleRow label="Verified Pro" hint="Pros on the paid Verified Pro plan" value={filters.proOnly} onChange={(v) => setFilter('proOnly', v)} />
        <ToggleRow label="ID verified" hint="Identity confirmed with a government ID" value={filters.idOnly} onChange={(v) => setFilter('idOnly', v)} />
        <View style={[s.actions, s.sheetActions]}>
          <Button title="Clear all" variant="ghost" disabled={!filterCount} onPress={() => setFilters(NO_FILTERS)} />
          <Button title={loading ? 'Show results' : `Show ${countLabel(results.length)}`} grow onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {(Object.keys(SORTS) as SortKey[])
          .filter((key) => (key !== 'match' || hasMatches) && (key !== 'distance' || !!userLocation))
          .map((key) => (
            <Pressable key={key} style={s.listRow} onPress={() => { setSort(key); setSheet(null) }} accessibilityRole="button" accessibilityState={{ selected: sortKey === key }}>
              <Text variant="body" style={s.grow}>{SORTS[key].label}</Text>
              {sortKey === key && <Check size={18} color={c.ink} />}
            </Pressable>
          ))}
        {!hasMatches && <Text variant="tiny" muted style={s.sheetNote}>Swipe in Discover to sort by how well {plural} match your taste.</Text>}
        {!userLocation && (
          <Button
            title="Use my location to sort by distance"
            icon={LocateFixed}
            variant="link"
            size="sm"
            onPress={async () => {
              if (await locate()) {
                setSort('distance')
                setSheet(null)
              }
            }}
            style={s.sheetNote}
          />
        )}
      </Sheet>
    </Screen>
  )
}

function ViewTab({ icon: Icon, label, on, onPress }: { icon: LucideIcon; label: string; on: boolean; onPress: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 8, bottom: 8 }} style={[s.tab, on && s.tabOn]} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}>
      <Icon size={14} color={on ? c.ink : c.muted} />
      <Text variant="tiny" weight="600" muted={!on}>{label}</Text>
    </Pressable>
  )
}

function OptionGroup<T>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const s = useStyles()
  return (
    <View>
      <Text variant="label" style={s.groupLabel}>{label}</Text>
      <ChipRow>
        {options.map((o) => (
          <Chip key={o.label} label={o.label} accessibilityLabel={`${label}: ${o.label}`} toggle select on={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </ChipRow>
    </View>
  )
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={s.toggleRow}>
      <View style={s.grow}>
        <Text variant="small">{label}</Text>
        <Text variant="tiny" muted>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.ok, false: c.faint }} accessibilityLabel={label} accessibilityHint={hint} />
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  scroll: { paddingBottom: t.space.xxl },
  pad: { paddingHorizontal: t.space.lg, paddingTop: t.space.sm },
  padX: { paddingHorizontal: t.space.lg },
  rowGap: { paddingTop: t.space.sm },
  grow: { flex: 1, minWidth: 0 },
  when: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: t.radius.md,
    borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg,
  },
  whenSet: { backgroundColor: t.c.soft },
  whenChips: { gap: 6, alignItems: 'center', paddingVertical: 6 },
  dateChip: { backgroundColor: t.c.bg, borderWidth: 1, borderColor: t.c.line },
  resultBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: t.space.lg, paddingTop: 12, paddingBottom: 6 },
  toggle: { flexDirection: 'row', backgroundColor: t.c.soft, borderRadius: t.radius.sm, padding: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  tabOn: { backgroundColor: t.scheme === 'dark' ? t.c.line : '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  map: { marginTop: 4 },
  areaSection: { marginTop: 18, gap: 2 },
  avail: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.line },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  sheetActions: { marginTop: t.space.lg, justifyContent: 'flex-start' },
  sheetLead: { marginBottom: 10 },
  sheetCta: { marginTop: 14 },
  sheetNote: { marginTop: 8 },
  groupLabel: { marginTop: 14, marginBottom: 8 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
}))
