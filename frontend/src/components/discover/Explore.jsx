import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImageOff, Search as SearchIcon, Send, Star, Store, Upload } from 'lucide-react'
import ProfileLink, { PersonAvatar } from '../ProfileLink.jsx'
import { EmptyState, ErrorState } from '../States.jsx'
import CatalogIcon, { TintIcon } from '../home/CatalogIcon.jsx'
import { useInvite } from '../home/Browse.jsx'
import { useAuth } from '../../auth.jsx'
import { useStore } from '../../store.jsx'
import useQuery from '../../lib/useQuery.js'
import { fromPriceLabel } from '../../lib/format.js'
import {
  buildExploreTiles, exploreFilters, exploreVendorTiles, listBrowseProviders, listExplorePhotos, masonry, mixExploreTiles,
} from '../../api/home.js'
import { vendorFacts } from '../../api/discover.js'
import { nounFor, verticalMeta } from '../../verticals/index.js'
import './discover.css'

const PAGE = 24

// Discover → "Explore": an Instagram Explore / Pinterest-style masonry of real
// portfolio posts across every vertical. Chips filter by vertical, service and occasion;
// tap a photo to open it in its post, tap the name to open the vendor. Vendors who
// haven't posted yet appear as tinted vendor tiles between the photos, and a vertical
// with no posts shows its vendors plus a "be the first" invite.
//   tabs: the For you | Explore switch, rendered in the header
export default function Explore({ tabs }) {
  const { user } = useAuth()
  const { myProviders = [] } = useStore()
  const invite = useInvite()
  const [params, setParams] = useSearchParams()
  const v = params.get('v')
  const vertical = v && v !== 'all' ? v : null
  const service = params.get('s')
  const occasion = params.get('o')
  const setFilter = (key, value) => {
    const p = new URLSearchParams(params)
    value ? p.set(key, value) : p.delete(key)
    if (key === 'v') { p.delete('s'); p.delete('o') }
    if (key === 's') p.delete('o')
    setParams(p, { replace: true })
    setShown(PAGE)
    document.querySelector('.viewport')?.scrollTo({ top: 0 })
  }
  const clearAll = () => {
    const p = new URLSearchParams(params)
    for (const k of ['v', 's', 'o']) p.delete(k)
    setParams(p, { replace: true })
    setShown(PAGE)
  }

  const photos = useQuery(() => listExplorePhotos({ limit: 200 }), [])
  const providers = useQuery(() => listBrowseProviders(), [user?.id])
  const ready = photos.data && providers.data
  const error = photos.error || providers.error
  const filters = ready ? exploreFilters({ photos: photos.data, providers: providers.data, vertical, service }) : { verticals: [], allVerticals: [], services: [], occasions: [] }
  const photoTiles = ready ? buildExploreTiles({ photos: photos.data, providers: providers.data, vertical, service, occasion }) : []
  // Vendors without posts: tiles between the photos (not when narrowing to an occasion).
  const vendorTiles = ready && !occasion ? exploreVendorTiles({ photos: photos.data, providers: providers.data, vertical, service }) : []
  const tiles = mixExploreTiles(photoTiles, vendorTiles, vertical ? 4 : 6)
  const meta = vertical ? verticalMeta(vertical) : null

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
  }, [vertical, service, occasion, ready])

  const columns = masonry(tiles.slice(0, shown), 2)
  const noPosts = ready && photoTiles.length === 0
  const mine = vertical ? myProviders.find((p) => p.vertical === vertical) : null

  return (
    <div className="explore">
      <header className="home-header">
        {tabs}
        <Link to="/search" className="pill-btn dc-icon-pill" aria-label="Search">
          <SearchIcon size={16} />
        </Link>
      </header>

      {ready && (
        <div className="chips scroll-x pad-x dc-filter-row" role="group" aria-label="Filter posts">
          <button className={`chip toggle ${!vertical && !service && !occasion ? 'on' : ''}`} aria-pressed={!vertical && !service && !occasion} onClick={clearAll}>
            All
          </button>
          {filters.allVerticals.map((x) => (
            <button
              key={x.slug}
              className={`chip toggle dc-vfilter ${vertical === x.slug ? 'on' : ''}`}
              style={{ '--tint': x.tint }}
              aria-pressed={vertical === x.slug}
              onClick={() => setFilter('v', vertical === x.slug ? null : x.slug)}
            >
              <CatalogIcon name={x.icon} size={13} /> {x.name}
            </button>
          ))}
        </div>
      )}
      {ready && (filters.services.length > 0 || filters.occasions.length > 0) && (
        <div className="chips scroll-x pad-x dc-filter-row dc-subfilters" role="group" aria-label={vertical ? `Filter ${meta.name}` : 'Filter by service or occasion'}>
          {vertical && filters.services.map((s) => (
            <button key={s.slug} className={`chip toggle ${service === s.slug ? 'on' : ''}`} aria-pressed={service === s.slug} onClick={() => setFilter('s', service === s.slug ? null : s.slug)}>
              {s.name}
            </button>
          ))}
          {vertical && filters.services.length > 0 && filters.occasions.length > 0 && <span className="dc-chip-divider" aria-hidden="true" />}
          {filters.occasions.map((o) => (
            <button key={o.slug} className={`chip toggle dc-ochip ${occasion === o.slug ? 'on' : ''}`} style={{ '--tint': o.tint }} aria-pressed={occasion === o.slug} onClick={() => setFilter('o', occasion === o.slug ? null : o.slug)}>
              <CatalogIcon name={o.icon} size={13} /> {o.name}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorState error={error} onRetry={() => { photos.reload(); providers.reload() }} />}
      {!ready && !error && <GridSkeleton />}

      {/* A vertical nobody has posted in yet: say so, and invite. */}
      {noPosts && vertical && !service && !occasion && (
        <div className="dc-be-first" style={{ '--tint': meta.tint }}>
          <TintIcon item={meta} size={48} />
          <div className="grow">
            <b className="block">{vendorTiles.length ? `No posts from ${nounFor(vertical, 2)} yet` : `No ${nounFor(vertical, 2)} yet`}</b>
            <p className="muted small mt-xs">
              {mine
                ? `Be the first ${meta.noun} to post your work here.`
                : vendorTiles.length
                  ? `Here are the ${nounFor(vertical, 2)} on photomatch. Know another great ${meta.noun}? Invite them.`
                  : `Be the first ${meta.noun} on photomatch, or invite one you love.`}
            </p>
            <div className="row gap-xs wrap mt-sm">
              {mine ? (
                <Link className="btn sm" to="/upload"><Upload size={14} aria-hidden="true" /> Post your work</Link>
              ) : (
                <Link className="btn sm" to={`/new-listing?v=${vertical}`}><Store size={14} aria-hidden="true" /> List your services</Link>
              )}
              <button className="btn sm ghost" onClick={() => invite(meta)}><Send size={14} aria-hidden="true" /> Invite {withArticle(meta.noun)}</button>
            </div>
          </div>
        </div>
      )}
      {ready && tiles.length === 0 && !(vertical && !service && !occasion) && (
        <EmptyState
          icon={ImageOff}
          title="No posts here yet"
          text="New work shows up as soon as vendors post it."
          action={(vertical || service || occasion) && <button className="btn ghost" onClick={clearAll}>See everything</button>}
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

const withArticle = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`

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

// A vendor who hasn't posted yet: their vertical's colour, name, key facts and price.
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
