import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { List, Map as MapIcon, Search as SearchIcon, Sparkles, Star } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import Segmented from '../components/Segmented.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { money, startingPrice } from '../components/Booking.jsx'
import { img, posts, providers, serviceCategories } from '../data/mock.js'

const thumbs = (p) => {
  const own = posts.filter((x) => x.authorId === p.id).flatMap((x) => x.photos)
  return [...own, `${p.id}-a`, `${p.id}-b`, `${p.id}-c`].slice(0, 3)
}

export default function Search() {
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(params.get('cat'))
  const [date, setDate] = useState('')
  const [maxPrice, setMaxPrice] = useState('any')
  const [minRating, setMinRating] = useState(false)
  const [proOnly, setProOnly] = useState(false)
  const [view, setView] = useState('list')

  const results = providers
    .filter((p) => !category || p.categories.includes(category))
    .filter((p) => !query || `${p.name} ${p.specialties.join(' ')} ${p.city}`.toLowerCase().includes(query.toLowerCase()))
    .filter((p) => maxPrice === 'any' || (startingPrice(p) ?? 0) <= Number(maxPrice))
    .filter((p) => !minRating || p.rating >= 4.8)
    .filter((p) => !proOnly || p.pro)
    .sort((a, b) => b.tasteMatch - a.tasteMatch)

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
          <input autoFocus={!category} placeholder="Search photographers, styles, cities" value={query} onChange={(e) => setQuery(e.target.value)} />
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

      <div className="filters pad-x">
        <input type="date" className="filter" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="filter" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}>
          <option value="any">Any price</option>
          <option value="250">Under $250</option>
          <option value="500">Under $500</option>
          <option value="1500">Under $1,500</option>
        </select>
        <button className={`filter ${minRating ? 'on' : ''}`} onClick={() => setMinRating(!minRating)}>
          <Star size={13} /> 4.8+
        </button>
        <button className={`filter ${proOnly ? 'on' : ''}`} onClick={() => setProOnly(!proOnly)}>
          Verified Pro
        </button>
      </div>

      <div className="pad-x muted small">
        <Sparkles size={12} /> {results.length} photographers{date && ' available that day'} · sorted by taste match
      </div>

      {view === 'map' ? (
        <div className="fake-map">
          {results.map((p, i) => (
            <Link key={p.id} to={`/u/${p.id}`} className="map-pin" style={{ left: `${15 + ((i * 37) % 70)}%`, top: `${18 + ((i * 23) % 60)}%` }}>
              <img src={p.avatar} alt="" />
              <span>{money(startingPrice(p))}</span>
            </Link>
          ))}
          <div className="map-label">Los Angeles</div>
        </div>
      ) : (
        <div className="pad-x">
          {results.map((p) => (
            <Link key={p.id} to={`/u/${p.id}`} className="provider-card">
              <div className="provider-thumbs">
                {thumbs(p).map((s) => (
                  <img key={s} src={img(s, 300, 300)} alt="" loading="lazy" />
                ))}
              </div>
              <div className="provider-info">
                <img className="avatar" src={p.avatar} alt="" />
                <div className="grow">
                  <div className="person-name">
                    {p.name} {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
                  </div>
                  <div className="muted small">
                    {p.specialties.join(' · ')} · {p.distanceKm} km
                  </div>
                  <div className="small row gap-xs">
                    <Star size={12} className="star-on" fill="currentColor" /> {p.rating} ({p.reviewCount})
                    <span className="muted">· from {money(startingPrice(p))}</span>
                  </div>
                </div>
                <div className="match">
                  <b>{p.tasteMatch}%</b>
                  <span>match</span>
                </div>
              </div>
            </Link>
          ))}
          {results.length === 0 && <div className="empty small">No photographers match these filters.</div>}
        </div>
      )}
    </div>
  )
}
