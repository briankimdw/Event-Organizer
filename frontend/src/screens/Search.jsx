import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpDown, CalendarCheck, CalendarDays, Check, Plus, Search as SearchIcon, SearchX, SlidersHorizontal, Star, X,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Sheet from '../components/Sheet.jsx'
import DatePicker from '../components/DatePicker.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { money, startingPrice } from '../components/Booking.jsx'
import { EmptyState, ErrorState, Loading } from '../components/States.jsx'
import { useAuth } from '../auth.jsx'
import useQuery from '../lib/useQuery.js'
import { fmtChip, fromKey, isPast, parseDates } from '../lib/dates.js'
import { getCategories, listProviders, searchProviders, withMatches } from '../api/catalog.js'

const PRICE_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 250, label: 'Under $250' },
  { value: 500, label: 'Under $500' },
  { value: 1500, label: 'Under $1,500' },
]
const RATING_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 4.5, label: '4.5+' },
  { value: 4.8, label: '4.8+' },
]
const byRating = (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewCount - a.reviewCount
const SORTS = {
  match: { label: 'Best match', fn: (a, b) => (b.tasteMatch ?? -1) - (a.tasteMatch ?? -1) || byRating(a, b) },
  rating: { label: 'Top rated', fn: byRating },
  price: { label: 'Lowest price', fn: (a, b) => (startingPrice(a) ?? Infinity) - (startingPrice(b) ?? Infinity) },
}
const NO_FILTERS = { maxPrice: null, minRating: null, proOnly: false, idOnly: false }

export default function Search() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [catParam, setCatParam] = useState(params.get('cat')) // a service slug (or a category name from older links)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [sort, setSort] = useState('match')
  const [sheet, setSheet] = useState(null) // dates | filters | sort

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))

  const cats = useQuery(() => getCategories(), [])
  const categories = cats.data || []
  const catInfo = catParam ? categories.find((c) => c.slug === catParam || c.name.toLowerCase() === catParam.toLowerCase()) : null
  const category = catInfo?.slug ?? null

  // Dates live in the URL so they survive going to a profile and back.
  const dates = parseDates(params.get('dates'))
  const setDates = (next) => {
    const p = new URLSearchParams(params)
    next.length ? p.set('dates', [...next].sort().join(',')) : p.delete('dates')
    setParams(p, { replace: true })
  }
  const toggleDate = (key) => setDates(dates.includes(key) ? dates.filter((k) => k !== key) : [...dates, key])
  const datesQuery = dates.length ? `dates=${dates.join(',')}` : ''

  // Everyone (with % match when the user has swiped enough).
  const all = useQuery(() => listProviders().then(withMatches), [user?.id])
  // Dates, category, price, rating and Pro are filtered in the database.
  const serverArgs = { dates, category, maxPrice: filters.maxPrice, minRating: filters.minRating, proOnly: filters.proOnly }
  const needsServer = dates.length > 0 || !!category || filters.maxPrice != null || filters.minRating != null || filters.proOnly
  const waitingForCategory = !!catParam && !cats.data && !cats.error
  const searched = useQuery(needsServer && !waitingForCategory ? () => searchProviders(serverArgs) : null, [JSON.stringify(serverArgs), needsServer, waitingForCategory])

  const matchOf = new Map((all.data || []).map((p) => [p.id, p.tasteMatch]))
  const hasMatches = [...matchOf.values()].some((m) => m != null)
  const sortKey = sort === 'match' && !hasMatches ? 'rating' : sort
  const freeOn = (p) => (dates.length ? (p.freeDates || []).filter((k) => dates.includes(k)) : [])

  const source = needsServer ? searched : all
  // Keep showing the previous results while a new search runs.
  const loading = waitingForCategory || (all.data === undefined && !all.error) || (source.data === undefined && !source.error)
  const error = all.error || source.error || (catParam && cats.error)
  const q = query.trim().toLowerCase()
  const results = (source.data || [])
    .map((p) => ({ ...p, tasteMatch: matchOf.get(p.id) ?? null }))
    .filter((p) => !q || [p.name, p.username, p.city, ...p.specialties, ...p.categories].join(' ').toLowerCase().includes(q))
    .filter((p) => !filters.idOnly || p.idVerified)
    .sort((a, b) => freeOn(b).length - freeOn(a).length || SORTS[sortKey].fn(a, b))
  const fullyFree = results.filter((p) => freeOn(p).length === dates.length).length

  // Removable chips for whatever is currently filtering the list.
  const activeChips = [
    filters.maxPrice != null && { key: 'maxPrice', label: `Under ${money(filters.maxPrice)}`, clear: () => setFilter('maxPrice', null) },
    filters.minRating != null && { key: 'minRating', label: `${filters.minRating}+ stars`, clear: () => setFilter('minRating', null) },
    filters.proOnly && { key: 'pro', label: 'Verified Pro', clear: () => setFilter('proOnly', false) },
    filters.idOnly && { key: 'id', label: 'ID verified', clear: () => setFilter('idOnly', false) },
  ].filter(Boolean)

  const reload = () => {
    all.reload()
    searched.reload()
    if (cats.error) cats.reload()
  }

  return (
    <div>
      <TopBar title={catInfo?.name || 'All photographers'} />

      <div className="pad-x mt-sm">
        <div className="search">
          <SearchIcon size={16} />
          <input autoFocus={!catParam && !dates.length} placeholder="Search photographers, styles, cities" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><X size={14} /></button>}
        </div>
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

      <div className="chips scroll-x pad-x mt-sm">
        <button className={`chip toggle ${!category ? 'on' : ''}`} onClick={() => setCatParam(null)}>All</button>
        {categories.map((c) => (
          <button key={c.slug} className={`chip toggle ${category === c.slug ? 'on' : ''}`} onClick={() => setCatParam(c.slug)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="filter-row scroll-x pad-x">
        <button className={`filter-btn ${activeChips.length ? 'on' : ''}`} onClick={() => setSheet('filters')}>
          <SlidersHorizontal size={14} /> Filters
          {activeChips.length > 0 && <span className="filter-count">{activeChips.length}</span>}
        </button>
        <button className="filter-btn" onClick={() => setSheet('sort')}>
          <ArrowUpDown size={14} /> {SORTS[sortKey].label}
        </button>
        {activeChips.map((c) => (
          <button key={c.key} className="chip active-filter" onClick={c.clear}>
            {c.label} <X size={12} />
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <Loading label="Finding photographers…" />
      ) : (
        <>
          <div className="pad-x result-summary">
            {dates.length
              ? `${fullyFree} free on ${dates.length === 1 ? 'your date' : `all ${dates.length} dates`}${results.length > fullyFree ? ` · ${results.length - fullyFree} partly free` : ''}`
              : `${results.length} photographer${results.length === 1 ? '' : 's'}`}
          </div>

          <div className="pad-x">
            {results.map((p) => {
              const free = freeOn(p)
              const thumbs = p.covers.slice(0, 3)
              return (
                <div key={p.id} className="result-card">
                  <Link to={`/u/${p.id}${datesQuery && `?${datesQuery}`}`}>
                    <div className="result-photos">
                      {thumbs.map((src) => (
                        <img key={src} src={src} alt="" loading="lazy" />
                      ))}
                      {Array.from({ length: 3 - thumbs.length }, (_, i) => (
                        <div key={`ph${i}`} className="img-ph" />
                      ))}
                      {p.tasteMatch != null && <span className="match-badge">{p.tasteMatch}% match</span>}
                    </div>
                    <div className="result-info">
                      <img className="avatar" src={p.avatar} alt="" />
                      <div className="grow">
                        <div className="row between gap-xs">
                          <div className="person-name">
                            {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                          </div>
                          {startingPrice(p) != null && <span className="result-price">from {money(startingPrice(p))}</span>}
                        </div>
                        <div className="muted small ellipsis">{p.specialties.join(' · ')}</div>
                        <div className="small row gap-xs mt-xs">
                          {p.rating != null ? (
                            <>
                              <Star size={12} className="star-on" fill="currentColor" /> <b>{p.rating.toFixed(1)}</b>
                              <span className="muted">({p.reviewCount}){p.city && ` · ${p.city}`}</span>
                            </>
                          ) : (
                            <>
                              <span className="new-tag">New</span>
                              {p.city && <span className="muted">· {p.city}</span>}
                            </>
                          )}
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
            })}
            {results.length === 0 && (
              <EmptyState
                icon={SearchX}
                title={dates.length ? 'Nobody free on those dates' : 'No photographers found'}
                text={dates.length ? 'Nobody matching these filters is free on those dates.' : 'No photographers match these filters.'}
                action={
                  (activeChips.length > 0 || dates.length > 0 || q || catParam) && (
                    <div className="row gap-xs">
                      {(activeChips.length > 0 || q || catParam) && (
                        <button className="btn ghost sm" onClick={() => { setFilters(NO_FILTERS); setQuery(''); setCatParam(null) }}>Clear filters</button>
                      )}
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
          {dates.length ? `Show photographers for ${dates.length === 1 ? fmtChip(fromKey(dates[0])) : `${dates.length} dates`}` : 'Done'}
        </button>
      </Sheet>

      <Sheet open={sheet === 'filters'} onClose={() => setSheet(null)} title="Filters">
        <FilterGroup label="Starting price" options={PRICE_OPTIONS} value={filters.maxPrice} onChange={(v) => setFilter('maxPrice', v)} />
        <FilterGroup label="Rating" options={RATING_OPTIONS} value={filters.minRating} onChange={(v) => setFilter('minRating', v)} />
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
          <button className="btn ghost" disabled={!activeChips.length} onClick={() => setFilters(NO_FILTERS)}>Clear all</button>
          <button className="btn grow" onClick={() => setSheet(null)}>
            {loading ? 'Show photographers' : `Show ${results.length} photographer${results.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {Object.entries(SORTS)
          .filter(([key]) => key !== 'match' || hasMatches)
          .map(([key, s]) => (
            <button key={key} className="list-row" onClick={() => { setSort(key); setSheet(null) }}>
              <div className="grow">{s.label}</div>
              {sortKey === key && <Check size={18} />}
            </button>
          ))}
        {!hasMatches && <div className="muted tiny mt-sm">Swipe in Discover to sort by how well photographers match your taste.</div>}
      </Sheet>
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
