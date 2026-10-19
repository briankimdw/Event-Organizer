import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { onTablistKeyDown } from '../components/tabs.js'
import {
  ArrowUpDown, CalendarCheck, CalendarDays, Check, List, LocateFixed, Map as MapIcon, MapPin, MapPinOff, Plus, Search as SearchIcon, SearchX,
  SlidersHorizontal, Star, X,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import DatePicker from '../components/DatePicker.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { fromPriceLabel, money, startingPrice } from '../components/Booking.jsx'
import { EmptyState, ErrorState, Loading } from '../components/States.jsx'
import { VerticalBadge } from '../components/verticals/VerticalIcon.jsx'
import { useAuth } from '../auth.jsx'
import { useStore } from '../store.jsx'
import { ProviderMap } from '../components/map/LazyMap.jsx'
import useQuery from '../lib/useQuery.js'
import { fmtChip, fromKey, isPast, parseDates } from '../lib/dates.js'
import { getCategories, listProviders, searchProviders, withMatches } from '../api/catalog.js'
import { distanceKm, fmtBbox, fmtKm, getMyLocation, lastKnownLocation, parseBbox, parsePoint, splitByArea } from '../api/locations.js'
import { SERVICE_CHIPS, attributeLines, countLabel, getService, nounFor, verticalConfig, verticalMeta } from '../verticals/index.js'

// Starting-price filter.
const PRICE_OPTIONS = [
  { value: null, label: 'Any' },
  ...[250, 500, 1500, 3000].map((v) => ({ value: v, label: `Under ${money(v)}` })),
]
const RATING_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 4.5, label: '4.5+' },
  { value: 4.8, label: '4.8+' },
]
// Distance filter (needs the user's location): 'travels' = they travel to you.
const DISTANCE_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 'travels', label: 'Travels to you' },
  { value: 10, label: 'Within 10 km' },
  { value: 25, label: 'Within 25 km' },
  { value: 50, label: 'Within 50 km' },
]
const byRating = (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount
const SORTS = {
  match: { label: 'Best match', fn: (a, b) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || byRating(a, b) },
  rating: { label: 'Top rated', fn: byRating },
  price: { label: 'Lowest price', fn: (a, b) => (startingPrice(a) ?? Infinity) - (startingPrice(b) ?? Infinity) },
  distance: { label: 'Nearest', fn: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || byRating(a, b) },
}
const NO_FILTERS = { maxPrice: null, minRating: null, proOnly: false, idOnly: false, distance: null }
const withinDistance = (p, d) => (d === 'travels' ? p.distanceKm <= (p.radiusKm ?? 0) : p.distanceKm <= d)

// ?cat= (a service slug, or a service name from older links) -> a service slug, or null.
// `unknown` when it names nothing we know (yet: the database may have it).
function resolveService(cat, dbServices) {
  if (!cat) return { service: null }
  if (getService(cat)) return { service: cat }
  const db = (dbServices || []).find((s) => s.slug === cat || s.name.toLowerCase() === cat.toLowerCase())
  if (db) return { service: db.slug }
  const byName = SERVICE_CHIPS.find((s) => s.name.toLowerCase() === cat.toLowerCase())
  if (byName) return { service: byName.slug }
  return { service: null, unknown: true }
}

export default function Search() {
  const { user, profile } = useAuth()
  const { toast } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQueryState] = useState(() => params.get('q') || '') // ?q= lets other screens link to a text search
  const [filters, setFilters] = useState(NO_FILTERS)
  const [sort, setSort] = useState('match')
  const [sheet, setSheet] = useState(null) // dates | filters | sort

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))
  const update = (fn) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      fn(p)
      return p
    }, { replace: true })
  const setQuery = (text) => {
    setQueryState(text)
    update((p) => (text.trim() ? p.set('q', text) : p.delete('q')))
  }

  // List or map (in the URL so Back returns to the same view). focus: a provider to open on the map.
  const view = params.get('view') === 'map' ? 'map' : 'list'
  const focusId = params.get('focus')
  const setView = (next) => {
    update((p) => {
      next === 'map' ? p.set('view', 'map') : p.delete('view')
      p.delete('focus')
    })
    document.querySelector('.viewport')?.scrollTo({ top: 0 })
  }
  const setFocus = (id) => update((p) => (id ? p.set('focus', id) : p.delete('focus')))

  // Map area ("Search this area" on the map): ?bbox=w,s,e,n. Kept by the List/Map toggle.
  const bboxParam = params.get('bbox')
  const area = useMemo(() => parseBbox(bboxParam), [bboxParam])
  const setArea = (box) => update((p) => (box ? p.set('bbox', fmtBbox(box)) : p.delete('bbox')))

  // The user's location (optional): asked for on demand, remembered on this device.
  const [myLoc, setMyLoc] = useState(lastKnownLocation)
  const userLocation = myLoc || parsePoint(profile?.location)
  const locate = async () => {
    try {
      const point = await getMyLocation()
      setMyLoc(point)
      return point
    } catch (e) {
      toast(e.message)
      return null
    }
  }

  // What: a service (?cat=), e.g. weddings or drone. (?v= from older links is ignored: one vertical.)
  const cats = useQuery(getCategories, [])
  const catParam = params.get('cat')
  const dbServices = cats.data?.[0]?.services
  const { service, unknown } = resolveService(catParam, dbServices)
  const meta = verticalMeta()
  const serviceName = service ? getService(service)?.name || dbServices?.find((s) => s.slug === service)?.name : null
  const setService = (slug) =>
    update((p) => {
      p.delete('v')
      slug ? p.set('cat', slug) : p.delete('cat')
    })

  // Dates live in the URL so they survive going to a profile and back.
  const dates = parseDates(params.get('dates'))
  const setDates = (next) => update((p) => (next.length ? p.set('dates', [...next].sort().join(',')) : p.delete('dates')))
  const toggleDate = (key) => setDates(dates.includes(key) ? dates.filter((k) => k !== key) : [...dates, key])
  const datesQuery = dates.length ? `dates=${dates.join(',')}` : ''

  // Everyone (with % match when the user has swiped enough).
  const all = useQuery(() => listProviders().then(withMatches), [user?.id])
  // Dates, service, price, rating and Pro are filtered in the database.
  const serverArgs = { dates, service, maxPrice: filters.maxPrice, minRating: filters.minRating, proOnly: filters.proOnly }
  const needsServer = dates.length > 0 || !!service || filters.maxPrice != null || filters.minRating != null || filters.proOnly
  const waitingForCategory = !!unknown && !cats.data && !cats.error
  const searched = useQuery(needsServer && !waitingForCategory ? () => searchProviders(serverArgs) : null, [JSON.stringify(serverArgs), needsServer, waitingForCategory])

  const matchOf = new Map((all.data || []).map((p) => [p.id, p.tasteMatch]))
  const hasMatches = [...matchOf.values()].some((m) => m != null)
  const sortKey = (sort === 'match' && !hasMatches) || (sort === 'distance' && !userLocation) ? (hasMatches ? 'match' : 'rating') : sort
  const distanceFilter = userLocation ? filters.distance : null
  const freeOn = (p) => (dates.length ? (p.freeDates || []).filter((k) => dates.includes(k)) : [])

  const source = needsServer ? searched : all
  // Keep showing the previous results while a new search runs.
  const loading = waitingForCategory || (all.data === undefined && !all.error) || (source.data === undefined && !source.error)
  const error = all.error || source.error
  const q = query.trim().toLowerCase()
  const allResults = (source.data || [])
    .map((p) => ({ ...p, tasteMatch: matchOf.get(p.id) ?? null, distanceKm: distanceKm(userLocation, p.location) }))
    .filter((p) => distanceFilter == null || (p.distanceKm != null && withinDistance(p, distanceFilter)))
    .filter((p) => !q || [p.name, p.username, p.city, ...p.specialties, ...p.categories].join(' ').toLowerCase().includes(q))
    .filter((p) => !filters.idOnly || p.idVerified)
    .sort((a, b) => freeOn(b).length - freeOn(a).length || SORTS[sortKey].fn(a, b))
  const onMap = allResults.filter((p) => p.location)
  // In a map area: providers based in it, then ones based elsewhere who travel to it.
  const { inside: areaInside, travels: areaTravels } = splitByArea(onMap, area)
  const results = area ? [...areaInside, ...areaTravels] : allResults
  const fullyFree = results.filter((p) => freeOn(p).length === dates.length).length
  const plural = nounFor(null, 2)

  // Removable chips for whatever is currently filtering the list.
  const activeChips = [
    area && { key: 'area', label: 'Map area', icon: MapPin, clear: () => setArea(null) },
    filters.maxPrice != null && { key: 'maxPrice', label: `Under ${money(filters.maxPrice)}`, clear: () => setFilter('maxPrice', null) },
    filters.minRating != null && { key: 'minRating', label: `${filters.minRating}+ stars`, clear: () => setFilter('minRating', null) },
    filters.proOnly && { key: 'pro', label: 'Verified Pro', clear: () => setFilter('proOnly', false) },
    filters.idOnly && { key: 'id', label: 'ID verified', clear: () => setFilter('idOnly', false) },
    distanceFilter != null && {
      key: 'distance',
      label: DISTANCE_OPTIONS.find((o) => o.value === distanceFilter)?.label,
      clear: () => setFilter('distance', null),
    },
  ].filter(Boolean)
  const filterCount = activeChips.filter((c) => c.key !== 'area').length // what the Filters sheet controls

  const reload = () => {
    all.reload()
    searched.reload()
    if (cats.error) cats.reload()
  }
  const clearAll = () => {
    setFilters(NO_FILTERS)
    setQueryState('')
    update((p) => {
      p.delete('q')
      p.delete('cat')
    })
  }

  return (
    <div>
      <TopBar title={serviceName || 'Find a photographer'} subtitle={serviceName ? meta.name : null} />

      <div className="pad-x mt-sm">
        <div className="search">
          <SearchIcon size={16} />
          <input autoFocus={!catParam && !dates.length && view === 'list'} aria-label="Search photographers and videographers" placeholder="Search names, styles, cities" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><X size={14} /></button>}
        </div>
      </div>

      {/* What: the kind of shoot (photo and video services) */}
      <div className="chips scroll-x pad-x mt-sm" role="group" aria-label="Kind of shoot">
        <button className={`chip toggle ${!service ? 'on' : ''}`} aria-pressed={!service} onClick={() => setService(null)}>All</button>
        {[...SERVICE_CHIPS, ...(service && !SERVICE_CHIPS.some((s) => s.slug === service) ? [{ slug: service, name: serviceName || service }] : [])].map((s) => (
          <button key={s.slug} className={`chip toggle ${service === s.slug ? 'on' : ''}`} aria-pressed={service === s.slug} onClick={() => setService(service === s.slug ? null : s.slug)}>
            {s.name}
          </button>
        ))}
      </div>

      {/* When: the dates you need someone for */}
      <div className="pad-x mt-sm">
        <div className={`when-bar ${dates.length ? 'set' : ''}`}>
          <CalendarDays size={16} />
          {dates.length ? (
            <div className="chips grow">
              {dates.map((k) => (
                <button key={k} className="chip date-chip" onClick={() => toggleDate(k)}>
                  {fmtChip(fromKey(k))} <X size={12} />
                </button>
              ))}
              <button className="chip date-chip add" onClick={() => setSheet('dates')}><Plus size={12} /> Add</button>
            </div>
          ) : (
            <button className="grow left-text small" onClick={() => setSheet('dates')}>
              <b>Any date</b> <span className="muted">· pick the dates you need</span>
            </button>
          )}
        </div>
      </div>

      <div className="filter-row scroll-x pad-x">
        <button className={`filter-btn ${filterCount ? 'on' : ''}`} onClick={() => setSheet('filters')}>
          <SlidersHorizontal size={14} /> Filters
          {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
        </button>
        <button className="filter-btn" onClick={() => setSheet('sort')}>
          <ArrowUpDown size={14} /> {SORTS[sortKey].label}
        </button>
        {activeChips.map((c) => (
          <button key={c.key} className="chip active-filter" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
            {c.icon && <c.icon size={12} />}{c.label} <X size={12} />
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <Loading label={`Finding ${plural}…`} />
      ) : (
        <>
          <div className="pad-x result-bar">
            <div className="result-summary grow ellipsis">
              {area && !dates.length
                ? areaTravels.length
                  ? `${areaInside.length ? `${areaInside.length} based here · ` : ''}${areaTravels.length} travel${areaTravels.length === 1 ? 's' : ''} here`
                  : `${countLabel(areaInside.length)} in this area`
                : dates.length
                  ? `${fullyFree} free on ${dates.length === 1 ? 'your date' : `all ${dates.length} dates`}${results.length > fullyFree ? ` · ${results.length - fullyFree} partly free` : ''}${area ? ' here' : ''}`
                  : countLabel(results.length)}
              {view === 'map' && !area && results.length > onMap.length && onMap.length > 0 && ` · ${results.length - onMap.length} not on map`}
            </div>
            <div className="view-toggle" role="tablist" aria-label="View" onKeyDown={onTablistKeyDown}>
              <button role="tab" aria-selected={view === 'list'} tabIndex={view === 'list' ? 0 : -1} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                <List size={14} aria-hidden="true" /> List
              </button>
              <button role="tab" aria-selected={view === 'map'} tabIndex={view === 'map' ? 0 : -1} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                <MapIcon size={14} aria-hidden="true" /> Map
              </button>
            </div>
          </div>

          {view === 'map' && allResults.length > 0 && (
            onMap.length ? (
              <ProviderMap
                providers={onMap}
                area={area}
                onAreaChange={setArea}
                userLocation={userLocation}
                onLocate={locate}
                focusId={focusId}
                linkQuery={datesQuery}
                fitUser={distanceFilter != null}
                onSelect={setFocus}
              />
            ) : (
              <EmptyState
                icon={MapPinOff}
                title="Not on the map yet"
                text={`${allResults.length === 1 ? `This ${nounFor()} hasn’t` : `These ${plural} haven’t`} set where they’re based yet.`}
                action={<button className="btn ghost sm" onClick={() => setView('list')}>Show the list</button>}
              />
            )
          )}

          <div className="pad-x">
            {view === 'list' && results.map((p, i) => (
              <Fragment key={p.id}>
                {area && areaTravels.length > 0 && i === areaInside.length && (
                  <div className="area-section">
                    <div className="area-section-title">{areaInside.length ? 'Also travels here' : `Nobody’s based here yet, but these ${plural} travel here`}</div>
                    <div className="muted tiny">Based outside this map area; it’s within how far they travel.</div>
                  </div>
                )}
                <ResultCard p={p} free={freeOn(p)} dates={dates} datesQuery={datesQuery} />
              </Fragment>
            ))}
            {area && view === 'list' && results.length === 0 && allResults.length > 0 ? (
              <EmptyState
                icon={MapPinOff}
                title={`No ${plural} in this area`}
                text="Nobody matching your search is based in this map area or travels to it."
                action={
                  <div className="row gap-xs">
                    <button className="btn ghost sm" onClick={() => setArea(null)}>Search everywhere</button>
                    <button className="btn ghost sm" onClick={() => setView('map')}>Move the map</button>
                  </div>
                }
              />
            ) : (view === 'list' ? results : allResults).length === 0 && (
              <EmptyState
                icon={SearchX}
                title={dates.length ? 'Nobody free on those dates' : `No ${plural} found`}
                text={dates.length ? 'Nobody matching these filters is free on those dates.' : `No ${plural} match these filters.`}
                action={
                  (activeChips.length > 0 || dates.length > 0 || q || service) && (
                    <div className="row gap-xs wrap">
                      {(filterCount > 0 || q || service) && <button className="btn ghost sm" onClick={clearAll}>Clear filters</button>}
                      {area && <button className="btn ghost sm" onClick={() => setArea(null)}>Search everywhere</button>}
                      {dates.length > 0 && <button className="btn ghost sm" onClick={() => setDates([])}>Clear dates</button>}
                    </div>
                  )
                }
              />
            )}
          </div>
        </>
      )}

      <Sheet open={sheet === 'dates'} onClose={() => setSheet(null)} title="When do you need them?">
        <p className="muted small">Pick one or more dates. We'll show who's free.</p>
        <div className="mt-sm">
          <DatePicker selected={dates} onToggle={toggleDate} isDisabled={isPast} />
        </div>
        <button className="btn block mt" onClick={() => setSheet(null)}>
          {dates.length ? `Show ${plural} for ${dates.length === 1 ? fmtChip(fromKey(dates[0])) : `${dates.length} dates`}` : 'Done'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'filters'} onClose={() => setSheet(null)} title="Filters">
        <FilterGroup label="Starting price" options={PRICE_OPTIONS} value={filters.maxPrice} onChange={(v) => setFilter('maxPrice', v)} />
        <FilterGroup label="Rating" options={RATING_OPTIONS} value={filters.minRating} onChange={(v) => setFilter('minRating', v)} />
        {userLocation ? (
          <FilterGroup label="Distance" options={DISTANCE_OPTIONS} value={filters.distance} onChange={(v) => setFilter('distance', v)} />
        ) : (
          <div className="filter-group">
            <div className="filter-label">Distance</div>
            <div className="row gap-xs">
              <div className="muted small grow">Share your location to find {plural} who travel to you.</div>
              <button className="btn ghost sm" onClick={locate}><LocateFixed size={14} /> Use my location</button>
            </div>
          </div>
        )}
        <div className="filter-group">
          <div className="filter-label">Trust</div>
          <label className="toggle-row">
            <div className="grow">
              <div className="small">Verified Pro</div>
              <div className="muted tiny">Photographers on the paid Verified Pro plan</div>
            </div>
            <input type="checkbox" className="switch" checked={filters.proOnly} onChange={(e) => setFilter('proOnly', e.target.checked)} />
          </label>
          <label className="toggle-row">
            <div className="grow">
              <div className="small">ID verified</div>
              <div className="muted tiny">Identity confirmed with a government ID</div>
            </div>
            <input type="checkbox" className="switch" checked={filters.idOnly} onChange={(e) => setFilter('idOnly', e.target.checked)} />
          </label>
        </div>
        <div className="row gap-xs mt">
          <button className="btn ghost" disabled={!filterCount} onClick={() => setFilters(NO_FILTERS)}>Clear all</button>
          <button className="btn grow" onClick={() => setSheet(null)}>
            {loading ? `Show ${plural}` : `Show ${countLabel(results.length)}`}
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {Object.entries(SORTS)
          .filter(([key]) => (key !== 'match' || hasMatches) && (key !== 'distance' || userLocation))
          .map(([key, s]) => (
            <button key={key} className="list-row" onClick={() => { setSort(key); setSheet(null) }}>
              <div className="grow">{s.label}</div>
              {sortKey === key && <Check size={18} />}
            </button>
          ))}
        {!hasMatches && <div className="muted tiny mt-sm">Swipe in Discover to sort by how well {plural} match your taste.</div>}
        {!userLocation && (
          <button className="link-btn small mt-sm" onClick={async () => { if (await locate()) { setSort('distance'); setSheet(null) } }}>
            <LocateFixed size={14} /> Use my location to sort by distance
          </button>
        )}
      </Sheet>
    </div>
  )
}

// One photographer in the list, led by their latest work.
function ResultCard({ p, free, dates, datesQuery }) {
  const thumbs = p.covers.slice(0, 3)
  const config = verticalConfig(p.vertical)
  const details = attributeLines(config.providerFields, p.attributes, config.cardKeys)
  const sub = details.length ? details.join(' · ') : p.specialties.join(' · ')
  const price = fromPriceLabel(p)
  return (
    <div className="result-card">
      <Link to={`/u/${p.id}${datesQuery && `?${datesQuery}`}`}>
        {thumbs.length > 0 && (
          <div className="result-photos">
            {thumbs.map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
            {Array.from({ length: 3 - thumbs.length }, (_, i) => (
              <div key={`ph${i}`} className="img-ph" />
            ))}
            {p.tasteMatch != null && <span className="match-badge">{p.tasteMatch}% match</span>}
          </div>
        )}
        <div className="result-info">
          {thumbs.length ? <img className="avatar" src={p.avatar} alt="" /> : <span className="result-avatar"><img className="avatar" src={p.avatar} alt="" /><VerticalBadge vertical={p.vertical} size={20} className="result-avatar-badge" /></span>}
          <div className="grow">
            <div className="row between gap-xs">
              <div className="person-name">
                {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
              </div>
              {price && <span className="result-price">{price}</span>}
            </div>
            {sub && <div className="muted small ellipsis">{sub}</div>}
            <div className="small row gap-xs mt-xs result-meta">
              {p.rating != null ? (
                <>
                  <Star size={12} className="star-on" fill="currentColor" /> <b>{p.rating.toFixed(1)}</b>
                  <span className="muted ellipsis">({p.reviewCount}){p.city && ` · ${p.city}`}</span>
                </>
              ) : (
                <>
                  <span className="new-tag">New</span>
                  {p.city && <span className="muted ellipsis">· {p.city}</span>}
                </>
              )}
              {p.distanceKm != null && <span className="muted result-distance">· {fmtKm(p.distanceKm)}</span>}
            </div>
          </div>
        </div>
      </Link>
      {dates.length > 0 && free.length > 0 && (
        <div className="provider-avail">
          <span className={`avail-label ${free.length === dates.length ? 'full' : 'partial'}`}>
            <CalendarCheck size={13} />
            {free.length === dates.length
              ? dates.length === 1 ? 'Free on your date' : `Free on all ${dates.length} dates`
              : free.length === 1 ? `Free ${fmtChip(fromKey(free[0]))} only` : `Free ${free.length} of ${dates.length} dates`}
          </span>
          <Link to={`/book/${p.id}?dates=${free.join(',')}`} className="btn sm accent">Book</Link>
        </div>
      )}
    </div>
  )
}

function FilterGroup({ label, options, value, onChange }) {
  return (
    <div className="filter-group">
      <div className="filter-label">{label}</div>
      <div className="chips">
        {options.map((o) => (
          <button key={o.label} className={`chip toggle ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
