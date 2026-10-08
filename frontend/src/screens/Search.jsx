import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowUpDown, CalendarCheck, CalendarDays, Check, List, Map as MapIcon, Plus, Search as SearchIcon, SlidersHorizontal, Star, X,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Segmented from '../components/Segmented.jsx'
import Sheet from '../components/Sheet.jsx'
import DatePicker from '../components/DatePicker.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { money, startingPrice } from '../components/Booking.jsx'
import { img, isAvailable, posts, providers, serviceCategories } from '../data/mock.js'
import { fmtChip, fromKey, isPast, parseDates } from '../data/dates.js'

const thumbs = (p) => {
  const own = posts.filter((x) => x.authorId === p.id).flatMap((x) => x.photos)
  return [...own, `${p.id}-a`, `${p.id}-b`, `${p.id}-c`].slice(0, 3)
}

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
const DISTANCE_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 25, label: '25 km' },
]
const SORTS = {
  match: { label: 'Best match', fn: (a, b) => b.tasteMatch - a.tasteMatch },
  rating: { label: 'Top rated', fn: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount },
  price: { label: 'Lowest price', fn: (a, b) => (startingPrice(a) ?? Infinity) - (startingPrice(b) ?? Infinity) },
  distance: { label: 'Nearest', fn: (a, b) => a.distanceKm - b.distanceKm },
}
const NO_FILTERS = { maxPrice: null, minRating: null, maxKm: null, proOnly: false, idOnly: false }

export default function Search() {
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(params.get('cat'))
  const [filters, setFilters] = useState(NO_FILTERS)
  const [sort, setSort] = useState('match')
  const [view, setView] = useState('list')
  const [sheet, setSheet] = useState(null) // dates | filters | sort

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }))

  // Dates live in the URL so they survive going to a profile and back.
  const dates = parseDates(params.get('dates'))
  const setDates = (next) => {
    const p = new URLSearchParams(params)
    next.length ? p.set('dates', [...next].sort().join(',')) : p.delete('dates')
    setParams(p, { replace: true })
  }
  const toggleDate = (key) => setDates(dates.includes(key) ? dates.filter((k) => k !== key) : [...dates, key])
  const datesQuery = dates.length ? `dates=${dates.join(',')}` : ''
  const freeOn = (p) => dates.filter((k) => isAvailable(p, fromKey(k)))

  const results = providers
    .filter((p) => !category || p.categories.includes(category))
    .filter((p) => !query || `${p.name} ${p.specialties.join(' ')} ${p.city}`.toLowerCase().includes(query.toLowerCase()))
    .filter((p) => filters.maxPrice == null || (startingPrice(p) ?? 0) <= filters.maxPrice)
    .filter((p) => filters.minRating == null || p.rating >= filters.minRating)
    .filter((p) => filters.maxKm == null || p.distanceKm <= filters.maxKm)
    .filter((p) => !filters.proOnly || p.pro)
    .filter((p) => !filters.idOnly || p.idVerified)
    .filter((p) => !dates.length || freeOn(p).length > 0)
    .sort((a, b) => freeOn(b).length - freeOn(a).length || SORTS[sort].fn(a, b))
  const fullyFree = results.filter((p) => freeOn(p).length === dates.length).length

  // Removable chips for whatever is currently filtering the list.
  const activeChips = [
    filters.maxPrice != null && { key: 'maxPrice', label: `Under ${money(filters.maxPrice)}`, clear: () => setFilter('maxPrice', null) },
    filters.minRating != null && { key: 'minRating', label: `${filters.minRating}+ stars`, clear: () => setFilter('minRating', null) },
    filters.maxKm != null && { key: 'maxKm', label: `Within ${filters.maxKm} km`, clear: () => setFilter('maxKm', null) },
    filters.proOnly && { key: 'pro', label: 'Verified Pro', clear: () => setFilter('proOnly', false) },
    filters.idOnly && { key: 'id', label: 'ID verified', clear: () => setFilter('idOnly', false) },
  ].filter(Boolean)

  return (
    <div>
      <TopBar
        title={category || 'All photographers'}
        right={
          <Segmented
            className="compact"
            options={[
              { value: 'list', label: <List size={16} /> },
              { value: 'map', label: <MapIcon size={16} /> },
            ]}
            value={view}
            onChange={setView}
          />
        }
      />

      <div className="pad-x mt-sm">
        <div className="search">
          <SearchIcon size={16} />
          <input autoFocus={!category && !dates.length} placeholder="Search photographers, styles, cities" value={query} onChange={(e) => setQuery(e.target.value)} />
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
        <button className={`chip toggle ${!category ? 'on' : ''}`} onClick={() => setCategory(null)}>All</button>
        {serviceCategories.map((c) => (
          <button key={c} className={`chip toggle ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="filter-row scroll-x pad-x">
        <button className={`filter-btn ${activeChips.length ? 'on' : ''}`} onClick={() => setSheet('filters')}>
          <SlidersHorizontal size={14} /> Filters
          {activeChips.length > 0 && <span className="filter-count">{activeChips.length}</span>}
        </button>
        <button className="filter-btn" onClick={() => setSheet('sort')}>
          <ArrowUpDown size={14} /> {SORTS[sort].label}
        </button>
        {activeChips.map((c) => (
          <button key={c.key} className="chip active-filter" onClick={c.clear}>
            {c.label} <X size={12} />
          </button>
        ))}
      </div>

      <div className="pad-x result-summary">
        {dates.length
          ? `${fullyFree} free on ${dates.length === 1 ? 'your date' : `all ${dates.length} dates`}${results.length > fullyFree ? ` · ${results.length - fullyFree} partly free` : ''}`
          : `${results.length} photographer${results.length === 1 ? '' : 's'}`}
      </div>

      {view === 'map' ? (
        <div className="fake-map">
          {results.map((p, i) => (
            <Link key={p.id} to={`/u/${p.id}${datesQuery && `?${datesQuery}`}`} className="map-pin" style={{ left: `${15 + ((i * 37) % 70)}%`, top: `${18 + ((i * 23) % 60)}%` }}>
              <img src={p.avatar} alt="" />
              <span>{money(startingPrice(p))}</span>
            </Link>
          ))}
          <div className="map-label">Los Angeles</div>
        </div>
      ) : (
        <div className="pad-x">
          {results.map((p) => {
            const free = freeOn(p)
            return (
              <div key={p.id} className="result-card">
                <Link to={`/u/${p.id}${datesQuery && `?${datesQuery}`}`}>
                  <div className="result-photos">
                    {thumbs(p).map((s) => (
                      <img key={s} src={img(s, 400, 400)} alt="" loading="lazy" />
                    ))}
                    <span className="match-badge">{p.tasteMatch}% match</span>
                  </div>
                  <div className="result-info">
                    <img className="avatar" src={p.avatar} alt="" />
                    <div className="grow">
                      <div className="row between gap-xs">
                        <div className="person-name">
                          {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                        </div>
                        <span className="result-price">from {money(startingPrice(p))}</span>
                      </div>
                      <div className="muted small ellipsis">{p.specialties.join(' · ')}</div>
                      <div className="small row gap-xs mt-xs">
                        <Star size={12} className="star-on" fill="currentColor" /> <b>{p.rating}</b>
                        <span className="muted">({p.reviewCount}) · {p.distanceKm} km away</span>
                      </div>
                    </div>
                  </div>
                </Link>
                {dates.length > 0 && (
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
            <div className="empty small">
              {dates.length ? 'Nobody matching these filters is free on those dates.' : 'No photographers match these filters.'}
              <div className="row gap-xs">
                {activeChips.length > 0 && <button className="btn ghost sm" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
                {dates.length > 0 && <button className="btn ghost sm" onClick={() => setDates([])}>Clear dates</button>}
              </div>
            </div>
          )}
        </div>
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
        <FilterGroup label="Distance" options={DISTANCE_OPTIONS} value={filters.maxKm} onChange={(v) => setFilter('maxKm', v)} />
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
            Show {results.length} photographer{results.length === 1 ? '' : 's'}
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        {Object.entries(SORTS).map(([key, s]) => (
          <button key={key} className="list-row" onClick={() => { setSort(key); setSheet(null) }}>
            <div className="grow">{s.label}</div>
            {sort === key && <Check size={18} />}
          </button>
        ))}
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
