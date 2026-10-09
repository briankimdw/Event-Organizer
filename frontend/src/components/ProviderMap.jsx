// Full-screen map of photographers: round avatar pins where they're based.
// Tap a pin to see how far they travel (their service radius) and a compact
// card with a link to their profile and to book. Lazy-loaded (see map/LazyMap.jsx).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, Maximize2, Star, X } from 'lucide-react'
import { IdVerified, ProBadge } from './Badges.jsx'
import { money, startingPrice } from '../lib/format.js'
import { fmtKm } from '../api/locations.js'
import { AutoSize, Tiles, avatarIcon, circleBounds, meIcon, pointsBounds, radiusStyle } from './map/mapKit.jsx'

const CARD_SPACE = 190 // px kept clear at the bottom for the card when framing a selection
const EDGE = 36

// providers: with .location { lat, lng }, .radiusKm and (optional) .distanceKm.
// userLocation: { lat, lng } | null. onLocate(): asks for the user's location, resolves { lat, lng } or null.
// focusId: provider to open on load. linkQuery: e.g. "dates=2026-10-21" carried to profile/book links.
// fitUser: also keep the user's own location in frame (e.g. while filtering by distance).
// onSelect(id | null): the open photographer changed (e.g. to keep it in the URL for Back).
export default function ProviderMap({ providers, userLocation, onLocate, focusId, linkQuery = '', fitUser = false, onSelect }) {
  const wrapRef = useRef()
  const height = useFillHeight(wrapRef)
  const [selectedId, setSelectedId] = useState(() => (providers.some((p) => p.id === focusId) ? focusId : null))
  const [touched, setTouched] = useState(!!focusId) // hide the hint once they've tapped a pin
  const [locating, setLocating] = useState(false)
  const mapRef = useRef(null)
  const selected = providers.find((p) => p.id === selectedId) || null
  const reported = useRef(selectedId)
  useEffect(() => {
    if (reported.current === selectedId) return
    reported.current = selectedId
    onSelect?.(selectedId)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
  const framePoints = () => [...providers.map((p) => p.location), fitUser ? userLocation : null]

  const initialBounds = useMemo(() => {
    const focus = providers.find((p) => p.id === focusId)
    return focus ? circleBounds(focus.location, focus.radiusKm ?? 0) : pointsBounds(framePoints())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id) => {
    setSelectedId(id)
    setTouched(true)
  }

  const showAll = () => {
    setSelectedId(null)
    const b = pointsBounds(framePoints())
    if (b) mapRef.current?.flyToBounds(b, { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, duration: 0.6 })
  }

  const locate = async () => {
    if (locating) return
    setLocating(true)
    const me = await onLocate?.().catch(() => null)
    setLocating(false)
    const map = mapRef.current
    if (!me || !map) return
    setSelectedId(null)
    // Frame the user with the photographers who travel to them (or just the user).
    const near = providers.filter((p) => p.distanceKm != null && p.distanceKm <= Math.max(p.radiusKm ?? 0, 25)).map((p) => p.location)
    if (near.length) map.flyToBounds(pointsBounds([me, ...near]), { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, duration: 0.7 })
    else map.flyTo([me.lat, me.lng], 11, { duration: 0.7 })
  }

  return (
    <div className="pm-wrap" ref={wrapRef} style={{ height }}>
      {initialBounds && (
        <MapContainer
          className="pm-map"
          bounds={initialBounds}
          boundsOptions={{ padding: [EDGE + 12, EDGE + 12], maxZoom: 12, paddingBottomRight: focusId ? [EDGE, CARD_SPACE] : undefined }}
          zoomControl={false}
          attributionControl={false}
          ref={mapRef}
          worldCopyJump
        >
          <Tiles />
          <AutoSize />
          <Behaviour providers={providers} framePoints={framePoints} selected={selected} onBackgroundTap={() => setSelectedId(null)} onLostSelection={() => setSelectedId(null)} />
          {selected?.radiusKm != null && <Circle center={[selected.location.lat, selected.location.lng]} radius={selected.radiusKm * 1000} {...radiusStyle} />}
          {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={meIcon} interactive={false} zIndexOffset={-100} />}
          {providers.map((p) => (
            <Marker
              key={p.id}
              position={[p.location.lat, p.location.lng]}
              icon={avatarIcon(p.avatar, { selected: p.id === selectedId })}
              zIndexOffset={p.id === selectedId ? 1000 : 0}
              title={p.name}
              alt={p.name}
              eventHandlers={{ click: () => select(p.id) }}
            />
          ))}
        </MapContainer>
      )}

      {!touched && !selected && <div className="pm-hint">Tap a photographer to see how far they travel</div>}

      <div className="pm-controls">
        <button className="pm-ctl" onClick={locate} aria-label="Show photographers near me" disabled={locating}>
          {locating ? <span className="spinner pm-spin" /> : <LocateFixed size={19} className={userLocation ? 'pm-located' : ''} />}
        </button>
        <button className="pm-ctl" onClick={showAll} aria-label="Show all photographers">
          <Maximize2 size={17} />
        </button>
      </div>

      {selected && <ProviderCard key={selected.id} provider={selected} linkQuery={linkQuery} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

// Map-side effects: frame a selection, refit when the result set changes, tap to dismiss.
function Behaviour({ providers, framePoints, selected, onBackgroundTap, onLostSelection }) {
  const map = useMap()
  useMapEvents({ click: onBackgroundTap })

  // Frame the tapped photographer's whole service area above the card. (Refs hold the
  // last framed value rather than a "first run" flag, so StrictMode's double effects are harmless.)
  const selectedKey = selected ? `${selected.id}:${selected.radiusKm}` : null
  const framed = useRef(selectedKey) // a focus on load is already framed by the initial bounds
  useEffect(() => {
    if (!selected || framed.current === selectedKey) return
    framed.current = selectedKey
    map.flyToBounds(circleBounds(selected.location, selected.radiusKm ?? 0), {
      paddingTopLeft: [EDGE, EDGE + 8],
      paddingBottomRight: [EDGE, CARD_SPACE],
      maxZoom: 13,
      duration: 0.6,
    })
  }, [selectedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) framed.current = null
  }, [selected])

  // Filters changed: refit to the results (dropping a selection that's no longer in them).
  const idsKey = providers.map((p) => p.id).join(',')
  const fittedIds = useRef(idsKey)
  useEffect(() => {
    if (fittedIds.current === idsKey) return
    fittedIds.current = idsKey
    if (selected && providers.some((p) => p.id === selected.id)) return // keep the open card framed
    if (selected) onLostSelection()
    const b = pointsBounds(framePoints())
    if (b) map.flyToBounds(b, { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, duration: 0.5 })
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function ProviderCard({ provider: p, linkQuery, onClose }) {
  const price = startingPrice(p)
  const q = linkQuery ? `?${linkQuery}` : ''
  const inside = p.distanceKm != null && p.radiusKm != null ? p.distanceKm <= p.radiusKm : null
  return (
    <div className="pm-card" role="dialog" aria-label={p.name}>
      <button className="icon-btn pm-card-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <Link to={`/u/${p.id}${q}`} className="pm-card-top">
        <img className="avatar pm-card-avatar" src={p.avatar} alt="" />
        <div className="grow">
          <div className="person-name pm-card-name">
            <span className="ellipsis">{p.name}</span> {p.idVerified && <IdVerified />} {p.pro && <ProBadge />}
          </div>
          <div className="small row gap-xs pm-card-meta">
            {p.rating != null ? (
              <span className="inline-icon">
                <Star size={12} className="star-on" fill="currentColor" /> <b>{p.rating.toFixed(1)}</b>
                <span className="muted">({p.reviewCount})</span>
              </span>
            ) : (
              <span className="new-tag">New</span>
            )}
            {price != null && <span className="muted">· from <b className="pm-ink">{money(price)}</b></span>}
          </div>
          {p.specialties.length > 0 && <div className="muted tiny ellipsis mt-xs">{p.specialties.join(' · ')}</div>}
        </div>
      </Link>
      <div className="pm-card-area tiny">
        <span className="pm-dot" />
        <span className="grow">
          <span className="pm-area-line">
            {p.city ? `${p.city.split(',')[0]} · ` : ''}travels up to {p.radiusKm ?? 0} km
          </span>
          {p.distanceKm != null && (
            <span className="pm-area-line muted">
              {fmtKm(p.distanceKm)} from you
              {inside != null && <b className={`pm-reach ${inside ? 'on' : ''}`}> · {inside ? 'Travels to you' : 'Outside their area'}</b>}
            </span>
          )}
        </span>
      </div>
      <div className="row gap-xs pm-card-actions">
        <Link to={`/u/${p.id}${q}`} className="btn ghost grow">View profile</Link>
        <Link to={`/book/${p.id}${q}`} className="btn accent grow">Book</Link>
      </div>
    </div>
  )
}

// Height that fills the scrolling viewport from this element down to the tab bar.
function useFillHeight(ref, min = 320) {
  const [height, setHeight] = useState(480)
  useLayoutEffect(() => {
    const el = ref.current
    const viewport = el?.closest('.viewport')
    if (!viewport) return
    const measure = () => {
      const pad = parseFloat(getComputedStyle(viewport).paddingBottom) || 0
      const top = el.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
      setHeight(Math.max(min, Math.round(viewport.clientHeight - pad - top)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    if (el.parentElement) ro.observe(el.parentElement.parentElement || el.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref, min])
  return height
}
