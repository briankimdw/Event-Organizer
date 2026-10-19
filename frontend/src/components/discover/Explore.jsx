import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImageOff, Search as SearchIcon, Star } from 'lucide-react'
import ProfileLink, { PersonAvatar } from '../ProfileLink.jsx'
import { EmptyState, ErrorState } from '../States.jsx'
import CatalogIcon from '../home/CatalogIcon.jsx'
import { useAuth } from '../../auth.jsx'
import useQuery from '../../lib/useQuery.js'
import { fromPriceLabel } from '../../lib/format.js'
import {
  buildExploreTiles, exploreFilters, exploreVendorTiles, listBrowseProviders, listExplorePhotos, masonry, mixExploreTiles,
} from '../../api/home.js'
import { vendorFacts } from '../../api/discover.js'
import { getService, verticalMeta } from '../../verticals/index.js'
import './discover.css'

const PAGE = 24

// Discover → "Explore": an Instagram Explore / Pinterest-style masonry of real
// photo & video work. Chips filter by kind of shoot (service); tap a photo to open it in
// its post, tap the name to open the photographer. Photographers who haven't posted yet
// appear as tinted tiles between the photos.
//   tabs: the For you | Explore switch, rendered in the header
export default function Explore({ tabs }) {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const service = params.get('s')
  const setService = (value) => {
    const p = new URLSearchParams(params)
    value ? p.set('s', value) : p.delete('s')
    p.delete('v')
    p.delete('o')
    setParams(p, { replace: true })
    setShown(PAGE)
    document.querySelector('.viewport')?.scrollTo({ top: 0 })
  }

  const photos = useQuery(() => listExplorePhotos({ limit: 200 }), [])
  const providers = useQuery(() => listBrowseProviders(), [user?.id])
  const ready = photos.data && providers.data
  const error = photos.error || providers.error
  const filters = ready ? exploreFilters({ photos: photos.data, providers: providers.data }) : { services: [] }
  // The selected service stays as a chip even when it has no photos yet.
  const serviceChips = service && !filters.services.some((s) => s.slug === service)
    ? [...filters.services, { slug: service, name: getService(service)?.name || service }]
    : filters.services
  const photoTiles = ready ? buildExploreTiles({ photos: photos.data, providers: providers.data, service }) : []
  // Photographers without posts: tiles between the photos.
  const vendorTiles = ready ? exploreVendorTiles({ photos: photos.data, providers: providers.data, service }) : []
  const tiles = mixExploreTiles(photoTiles, vendorTiles, 6)

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

  // Keep the selected chips in view in the sideways-scrolling rows.
  useEffect(() => {
    document.querySelectorAll('.explore .chips.scroll-x .chip.on').forEach((el) => el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }))
  }, [service, ready])

  const columns = masonry(tiles.slice(0, shown), 2)

  return (
    <div className="explore">
      <header className="home-header">
        {tabs}
        <Link to="/search" className="pill-btn dc-icon-pill" aria-label="Search">
          <SearchIcon size={16} />
        </Link>
      </header>

      {ready && (
        <div className="chips scroll-x pad-x dc-filter-row" role="group" aria-label="Filter by kind of shoot">
          <button className={`chip toggle ${!service ? 'on' : ''}`} aria-pressed={!service} onClick={() => setService(null)}>
            All
          </button>
          {serviceChips.map((s) => (
            <button key={s.slug} className={`chip toggle ${service === s.slug ? 'on' : ''}`} aria-pressed={service === s.slug} onClick={() => setService(service === s.slug ? null : s.slug)}>
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
          title="No posts here yet"
          text="New work shows up as soon as photographers post it."
          action={service && <button className="btn ghost" onClick={() => setService(null)}>See everything</button>}
        />
      )}

      {tiles.length > 0 && (
        <div className="dc-masonry">
          {columns.map((col, i) => (
            <div key={i} className="dc-col">
              {col.map((t) => (t.kind === 'vendor' ? <VendorTile key={t.id} t={t} /> : <Tile key={t.id} t={t} />))}
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
      <Link to={`/gallery/${p.id}?post=${t.albumId}&photo=${t.id}`} className="dc-tile-img" style={{ aspectRatio: `1 / ${t.ratio}` }} aria-label={`${t.title || 'Post'} by ${p.name}`}>
        <img src={t.src} alt={t.title ? `${t.title} by ${p.name}` : `Work by ${p.name}`} loading="lazy" draggable={false} />
      </Link>
      <figcaption className="dc-tile-cap">
        <PersonAvatar id={p.id} src={p.avatar} name={p.name} username={p.username} className="avatar dc-tile-avatar" />
        <ProfileLink id={p.id} className="dc-tile-name ellipsis">{p.name}</ProfileLink>
      </figcaption>
    </figure>
  )
}

// A photographer who hasn't posted yet: the brand colour, name, key facts and price.
function VendorTile({ t }) {
  const p = t.provider
  const v = verticalMeta(p.vertical)
  const facts = vendorFacts(p).lines.slice(0, 2)
  const price = fromPriceLabel(p)
  return (
    <figure className="dc-tile">
      <Link to={`/u/${p.id}`} className="dc-tile-img dc-vtile" style={{ aspectRatio: `1 / ${t.ratio}`, '--tint': v.tint }} aria-label={`${p.name}, ${v.noun}${price ? `, ${price}` : ''}`}>
        <span className="dc-vtile-art" aria-hidden="true"><CatalogIcon name={v.icon} size={84} strokeWidth={1.3} /></span>
        <span className="dc-vtile-body">
          <span className="dc-vtile-kind"><CatalogIcon name={v.icon} size={12} /> {v.noun}</span>
          <b className="dc-vtile-name">{p.name}</b>
          {facts.map((f) => <span key={f} className="dc-vtile-fact">{f}</span>)}
          <span className="dc-vtile-meta">
            {p.rating != null ? <><Star size={11} fill="currentColor" aria-hidden="true" /> {p.rating.toFixed(1)}</> : 'New'}
            {price ? ` · ${price}` : ''}
          </span>
        </span>
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
