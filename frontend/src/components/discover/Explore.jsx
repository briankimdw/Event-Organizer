import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImageOff, Search as SearchIcon } from 'lucide-react'
import ProfileLink, { PersonAvatar } from '../ProfileLink.jsx'
import { EmptyState, ErrorState } from '../States.jsx'
import CatalogIcon from '../home/CatalogIcon.jsx'
import { useAuth } from '../../auth.jsx'
import useQuery from '../../lib/useQuery.js'
import { buildExploreTiles, exploreFilters, listBrowseProviders, listExplorePhotos, masonry } from '../../api/home.js'
import './discover.css'

const PAGE = 24

// Discover → "Explore": an Instagram Explore / Pinterest-style masonry of real
// portfolio photos across every vertical. Chips filter by vertical and service;
// tap a photo to open it in its album, tap the name to open the vendor.
//   tabs: the For you | Explore switch, rendered in the header
export default function Explore({ tabs }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const vertical = params.get('v')
  const service = params.get('s')
  const setFilter = (key, value) => {
    const p = new URLSearchParams(params)
    value ? p.set(key, value) : p.delete(key)
    if (key === 'v') p.delete('s')
    setParams(p, { replace: true })
    setShown(PAGE)
    document.querySelector('.viewport')?.scrollTo({ top: 0 })
  }

  const photos = useQuery(() => listExplorePhotos({ limit: 200 }), [])
  const providers = useQuery(() => listBrowseProviders(), [user?.id])
  const ready = photos.data && providers.data
  const error = photos.error || providers.error
  const filters = ready ? exploreFilters({ photos: photos.data, providers: providers.data, vertical }) : { verticals: [], services: [] }
  const tiles = ready ? buildExploreTiles({ photos: photos.data, providers: providers.data, vertical, service }) : []

  // Show a page at a time; load more as the end of the grid scrolls into view.
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef(null)
  const more = tiles.length > shown
  useEffect(() => {
    if (!more || !sentinel.current) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE)
    }, { root: document.querySelector('.viewport'), rootMargin: '600px' })
    io.observe(sentinel.current)
    return () => io.disconnect()
  }, [more, shown])

  const columns = masonry(tiles.slice(0, shown), 2)
  const showVerticalChips = filters.verticals.length > 1

  return (
    <div className="explore">
      <header className="home-header">
        {tabs}
        <Link to="/search" className="pill-btn dc-icon-pill" aria-label="Search">
          <SearchIcon size={16} />
        </Link>
      </header>

      {(showVerticalChips || filters.services.length > 0) && (
        <div className="chips scroll-x pad-x dc-filter-row" role="group" aria-label="Filter photos">
          <button className={`chip toggle ${!vertical && !service ? 'on' : ''}`} aria-pressed={!vertical && !service} onClick={() => { setFilter('v', null) }}>
            All
          </button>
          {showVerticalChips && filters.verticals.map((v) => (
            <button
              key={v.slug}
              className={`chip toggle dc-vfilter ${vertical === v.slug ? 'on' : ''}`}
              style={{ '--tint': v.tint }}
              aria-pressed={vertical === v.slug}
              onClick={() => setFilter('v', vertical === v.slug ? null : v.slug)}
            >
              <CatalogIcon name={v.icon} size={13} /> {v.name}
            </button>
          ))}
          {showVerticalChips && filters.services.length > 0 && <span className="dc-chip-divider" aria-hidden="true" />}
          {filters.services.map((s) => (
            <button key={s.slug} className={`chip toggle ${service === s.slug ? 'on' : ''}`} aria-pressed={service === s.slug} onClick={() => setFilter('s', service === s.slug ? null : s.slug)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorState error={error} onRetry={() => { photos.reload(); providers.reload() }} />}
      {!ready && !error && <GridSkeleton />}
      {ready && tiles.length === 0 && (
        <EmptyState
          icon={ImageOff}
          title="No photos here yet"
          text="New work shows up as soon as vendors post it."
          action={(vertical || service) && <button className="btn ghost" onClick={() => setFilter('v', null)}>See everything</button>}
        />
      )}

      {tiles.length > 0 && (
        <div className="dc-masonry">
          {columns.map((col, i) => (
            <div key={i} className="dc-col">
              {col.map((t) => <Tile key={t.id} t={t} />)}
            </div>
          ))}
        </div>
      )}
      {more && <div ref={sentinel} className="dc-sentinel" aria-hidden="true" />}
      {ready && tiles.length > 0 && !more && <div className="muted tiny center-col dc-end">You’re all caught up</div>}
    </div>
  )
}

function Tile({ t }) {
  const p = t.provider
  return (
    <figure className="dc-tile">
      <Link to={`/gallery/${p.id}?post=${t.albumId}&photo=${t.id}`} className="dc-tile-img" style={{ aspectRatio: `1 / ${t.ratio}` }} aria-label={`${t.title || 'Photo'} by ${p.name}`}>
        <img src={t.src} alt={t.title ? `${t.title} by ${p.name}` : `Work by ${p.name}`} loading="lazy" draggable={false} />
      </Link>
      <figcaption className="dc-tile-cap">
        <PersonAvatar id={p.id} src={p.avatar} name={p.name} username={p.username} className="avatar dc-tile-avatar" />
        <ProfileLink id={p.id} className="dc-tile-name ellipsis">{p.name}</ProfileLink>
      </figcaption>
    </figure>
  )
}

// Grey masonry blocks while photos load.
function GridSkeleton() {
  const heights = [[220, 160, 240], [170, 230, 190]]
  return (
    <div className="dc-masonry" aria-hidden="true">
      {heights.map((col, i) => (
        <div key={i} className="dc-col">
          {col.map((h, j) => <div key={j} className="hd-skel dc-skel" style={{ height: h }} />)}
        </div>
      ))}
    </div>
  )
}
