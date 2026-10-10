// Full-screen map of photographers: round avatar pins where they're based.
// Tap a pin to see how far they travel (their service radius) and a compact
// card with a link to their profile and to book. Lazy-loaded (see map/LazyMap.jsx).
//
// "Search this area": once the user pans or zooms away from the current area, a
// pill offers to search the visible map. The searched box goes to onAreaChange
// (the screen keeps it in the URL and filters the list by it).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import { Circle, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, MapPinOff, Maximize2, Search, Star, X, ZoomOut } from 'lucide-react'
import { IdVerified, ProBadge } from './Badges.jsx'
import { money, startingPrice } from '../lib/format.js'
import { bboxCenter, distanceKm, fmtKm, parseBbox, fmtBbox, splitByArea } from '../api/locations.js'
import { AutoSize, Tiles, avatarIcon, circleBounds, clusterIcon, meIcon, pointsBounds, radiusStyle } from './map/mapKit.jsx'

const CARD_SPACE = 190 // px kept clear at the bottom for the card when framing a selection
const EDGE = 36
const SETTLE_MS = 250 // debounce for map moves before deciding whether to offer "Search this area"
const CLUSTER_PX = 34 // pins closer than this (centre to centre) are grouped
const CLUSTER_MAX_ZOOM = 15 // street level: never group

const boxBounds = (b) => L.latLngBounds([b.s, b.w], [b.n, b.e])

// providers: with .location { lat, lng }, .radiusKm and (optional) .distanceKm.
// userLocation: { lat, lng } | null. onLocate(): asks for the user's location, resolves { lat, lng } or null.
// focusId: provider to open on load. linkQuery: e.g. "dates=2026-10-21" carried to profile/book links.
// fitUser: also keep the user's own location in frame (e.g. while filtering by distance).
// onSelect(id | null): the open photographer changed (e.g. to keep it in the URL for Back).
// area: the searched map area { w, s, e, n } or null; onAreaChange(area | null) searches/clears it.
// Pins outside the area are faded; providers should be every result, not just the area's.
export default function ProviderMap({ providers, userLocation, onLocate, focusId, linkQuery = '', fitUser = false, onSelect, area = null, onAreaChange }) {
  const wrapRef = useRef()
  const height = useFillHeight(wrapRef)
  const [selectedId, setSelectedId] = useState(() => (providers.some((p) => p.id === focusId) ? focusId : null))
  const [touched, setTouched] = useState(!!focusId) // hide the hint once they've tapped a pin
  const [locating, setLocating] = useState(false)
  const [moved, setMoved] = useState(false) // panned/zoomed away from the current search area
  const mapRef = useRef(null)
  const selected = providers.find((p) => p.id === selectedId) || null
  const reported = useRef(selectedId)
  useEffect(() => {
    if (reported.current === selectedId) return
    reported.current = selectedId
    onSelect?.(selectedId)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps
  const framePoints = () => [...providers.map((p) => p.location), fitUser ? userLocation : null]

  const { inside, travels } = useMemo(() => splitByArea(providers, area), [providers, area])
  const inArea = useMemo(() => (area ? new Set([...inside, ...travels].map((p) => p.id)) : null), [area, inside, travels])

  const initialBounds = useMemo(() => {
    const focus = providers.find((p) => p.id === focusId)
    if (focus) return circleBounds(focus.location, focus.radiusKm ?? 0)
    return area ? boxBounds(area) : pointsBounds(framePoints())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const initialOptions = useMemo(
    () =>
      area && !focusId
        ? { padding: [0, 0] }
        : { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, paddingBottomRight: focusId ? [EDGE, CARD_SPACE] : undefined },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Moving away from the search area. `reference` is the view the current results belong to
  // ({ center, zoom }); `auto` marks a move we started ourselves:
  //   rebase: the view it lands on becomes the reference (show all, refit after filters)
  //   search: search the area it lands on (Zoom out)
  //   neither: judged like a user move (e.g. framing a tapped pin; the pill waits until the card closes)
  const reference = useRef(null)
  const auto = useRef(null)
  const programmatic = (kind = {}, ms = 700) => {
    auto.current = { ...kind, until: Date.now() + ms + SETTLE_MS + 400 }
  }
  const snapshot = (map) => ({ center: map.getCenter(), zoom: map.getZoom() })
  const areaReference = (map, box) => ({ center: L.latLng(bboxCenter(box)), zoom: map.getBoundsZoom(boxBounds(box)) })

  const searchHere = () => {
    const map = mapRef.current
    if (!map) return
    const box = parseBbox(fmtBbox(map.getBounds()))
    if (!box) return
    reference.current = snapshot(map)
    setMoved(false)
    onAreaChange?.(box)
  }

  // After a move settles (debounced): decide whether the map is somewhere new.
  const settle = (map) => {
    const a = auto.current && Date.now() < auto.current.until ? auto.current : null
    auto.current = null
    if (a?.search) return searchHere()
    if (a?.rebase) {
      reference.current = snapshot(map)
      setMoved(false)
      return
    }
    const ref = reference.current
    if (!ref) return
    const size = map.getSize()
    const shift = map.latLngToContainerPoint(ref.center).distanceTo(map.latLngToContainerPoint(map.getCenter()))
    setMoved(Math.abs(map.getZoom() - ref.zoom) >= 1 || shift > 0.18 * Math.min(size.x, size.y))
  }

  const select = (id) => {
    setSelectedId(id)
    setTouched(true)
  }

  const fitAll = () => {
    const b = pointsBounds(framePoints())
    if (!b || !mapRef.current) return
    programmatic({ rebase: true }, 600)
    mapRef.current.flyToBounds(b, { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, duration: 0.6 })
  }

  const showAll = () => {
    setSelectedId(null)
    if (area) onAreaChange?.(null) // clearing the area refits (see Behaviour)
    else fitAll()
  }

  // Nobody in the area: zoom out just far enough to include the nearest photographer, then search there.
  const zoomOut = () => {
    const map = mapRef.current
    if (!map || !area) return
    const center = bboxCenter(area)
    const nearest = [...providers].sort((a, b) => distanceKm(center, a.location) - distanceKm(center, b.location))[0]
    if (!nearest) return
    const b = boxBounds(area).extend([nearest.location.lat, nearest.location.lng])
    programmatic({ search: true }, 700)
    map.flyToBounds(b, { padding: [EDGE + 24, EDGE + 24], duration: 0.7 })
  }

  // Nobody based in the area, but some travel here: bring their pins into view.
  const showTravellers = () => {
    const map = mapRef.current
    if (!map || !area) return
    const b = boxBounds(area)
    travels.forEach((p) => b.extend([p.location.lat, p.location.lng]))
    setDismissed(areaKey)
    programmatic({}, 700)
    map.flyToBounds(b, { padding: [EDGE + 24, EDGE + 24], duration: 0.7 })
  }

  const areaKey = area ? fmtBbox(area) : ''
  const [dismissed, setDismissed] = useState('') // area whose "nobody here" note was dismissed
  const areaEmpty = !!area && !moved && !selected && inside.length === 0 && dismissed !== areaKey

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
          boundsOptions={initialOptions}
          zoomControl={false}
          attributionControl={false}
          ref={mapRef}
          worldCopyJump
        >
          <Tiles />
          <AutoSize />
          <Behaviour
            providers={providers}
            framePoints={framePoints}
            selected={selected}
            area={area}
            onBackgroundTap={() => setSelectedId(null)}
            onLostSelection={() => setSelectedId(null)}
            onAreaCleared={fitAll}
            programmatic={programmatic}
          />
          <AreaWatch
            onSettle={settle}
            onUserGesture={() => { auto.current = null }}
            onReady={(map) => {
              // Restore a searched area (from the URL) once the map has its final size.
              if (area && !focusId) {
                programmatic({}, 0)
                map.fitBounds(boxBounds(area), { padding: [0, 0], animate: false })
              }
              reference.current = area ? areaReference(map, area) : snapshot(map)
            }}
          />
          {selected?.radiusKm != null && <Circle center={[selected.location.lat, selected.location.lng]} radius={selected.radiusKm * 1000} {...radiusStyle} />}
          {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={meIcon} interactive={false} zIndexOffset={-100} />}
          <Pins
            providers={providers}
            selectedId={selectedId}
            inArea={inArea}
            onSelect={select}
            onOpenCluster={(points) => {
              programmatic({}, 600)
              mapRef.current?.flyToBounds(pointsBounds(points), { padding: [EDGE + 40, EDGE + 40], maxZoom: CLUSTER_MAX_ZOOM, duration: 0.6 })
            }}
          />
        </MapContainer>
      )}

      {moved && !selected && (
        <button className="pm-area-btn" onClick={searchHere}>
          <Search size={15} strokeWidth={2.4} /> Search this area
        </button>
      )}

      {areaEmpty && (
        <div className="pm-empty" role="status">
          <div className="pm-empty-card">
            <MapPinOff size={22} className="muted" />
            {travels.length ? (
              <>
                <div className="pm-empty-title">Nobody’s based here yet</div>
                <div className="muted small">
                  {travels.length === 1 ? '1 photographer travels' : `${travels.length} photographers travel`} to this area.
                </div>
                <button className="btn sm" onClick={showTravellers}>Show on map</button>
              </>
            ) : (
              <>
                <div className="pm-empty-title">No photographers here yet</div>
                <div className="muted small">Zoom out or search a different area.</div>
                <button className="btn sm" onClick={zoomOut}><ZoomOut size={15} /> Zoom out</button>
              </>
            )}
          </div>
        </div>
      )}

      {!touched && !selected && !areaEmpty && <div className="pm-hint">Tap a photographer to see how far they travel</div>}

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

// Watches map moves: onSettle(map) once a pan/zoom has stopped for SETTLE_MS (so the
// "Search this area" check doesn't run on every frame), onUserGesture() when the user
// touches the map (cancelling our own animations' bookkeeping), onReady(map) once sized.
function AreaWatch({ onSettle, onUserGesture, onReady }) {
  const map = useMap()
  const cb = useRef({})
  cb.current = { onSettle, onUserGesture, onReady }
  const timer = useRef(null)
  useMapEvents({
    movestart: () => clearTimeout(timer.current),
    moveend: () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => cb.current.onSettle(map), SETTLE_MS)
    },
  })
  useEffect(() => {
    if (import.meta.env.DEV) window.__pmMap = map // lets the headless test driver pan/zoom
    const el = map.getContainer()
    const gesture = () => cb.current.onUserGesture()
    el.addEventListener('pointerdown', gesture)
    el.addEventListener('wheel', gesture, { passive: true })
    const ready = setTimeout(() => cb.current.onReady(map), 320) // after AutoSize's resize pass
    return () => {
      el.removeEventListener('pointerdown', gesture)
      el.removeEventListener('wheel', gesture)
      clearTimeout(ready)
      clearTimeout(timer.current)
    }
  }, [map])
  return null
}

// Avatar pins. Pins that would overlap at this zoom are grouped into one pin with a
// count; tapping it zooms in to separate them. The open photographer is never grouped.
function Pins({ providers, selectedId, inArea, onSelect, onOpenCluster }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const groups = useMemo(() => {
    const out = []
    for (const p of providers) {
      const dim = !!inArea && !inArea.has(p.id)
      const pt = map.project([p.location.lat, p.location.lng], zoom)
      const join =
        p.id !== selectedId && zoom < CLUSTER_MAX_ZOOM
          ? out.find((g) => !g.selected && g.dim === dim && g.pt.distanceTo(pt) < CLUSTER_PX)
          : null
      if (join) join.members.push(p)
      else out.push({ pt, dim, selected: p.id === selectedId, members: [p] })
    }
    return out
  }, [providers, selectedId, inArea, zoom, map])

  return groups.map((g) => {
    const [p] = g.members
    if (g.members.length === 1) {
      return (
        <Marker
          key={p.id}
          position={[p.location.lat, p.location.lng]}
          icon={avatarIcon(p.avatar, { selected: g.selected, dim: g.dim && !g.selected })}
          zIndexOffset={g.selected ? 1000 : g.dim ? -50 : 0}
          title={p.name}
          alt={p.name}
          eventHandlers={{ click: () => onSelect(p.id) }}
        />
      )
    }
    const points = g.members.map((m) => m.location)
    const lat = points.reduce((s, q) => s + q.lat, 0) / points.length
    const lng = points.reduce((s, q) => s + q.lng, 0) / points.length
    const names = g.members.map((m) => m.name)
    return (
      <Marker
        key={g.members.map((m) => m.id).join('+')}
        position={[lat, lng]}
        icon={clusterIcon(p.avatar, g.members.length, { dim: g.dim })}
        zIndexOffset={g.dim ? -40 : 10}
        title={`${names.slice(0, -1).join(', ')} and ${names.at(-1)}`}
        alt={`${g.members.length} photographers`}
        eventHandlers={{ click: () => onOpenCluster(points) }}
      />
    )
  })
}

// Map-side effects: frame a selection, refit when the result set changes, tap to dismiss.
function Behaviour({ providers, framePoints, selected, area, onBackgroundTap, onLostSelection, onAreaCleared, programmatic }) {
  const map = useMap()
  useMapEvents({ click: onBackgroundTap })

  // Frame the tapped photographer's whole service area above the card. (Refs hold the
  // last framed value rather than a "first run" flag, so StrictMode's double effects are harmless.)
  const selectedKey = selected ? `${selected.id}:${selected.radiusKm}` : null
  const framed = useRef(selectedKey) // a focus on load is already framed by the initial bounds
  useEffect(() => {
    if (!selected || framed.current === selectedKey) return
    framed.current = selectedKey
    programmatic({}, 600) // framing a pin doesn't count as moving away from the search area
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
    if (area) return // a searched area stays put; its results update in place
    const b = pointsBounds(framePoints())
    if (!b) return
    programmatic({ rebase: true }, 500)
    map.flyToBounds(b, { padding: [EDGE + 12, EDGE + 12], maxZoom: 12, duration: 0.5 })
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // The area filter was cleared (chip, Show all): back to everyone.
  const areaKey = area ? fmtBbox(area) : ''
  const lastArea = useRef(areaKey)
  useEffect(() => {
    if (lastArea.current === areaKey) return
    const wasSet = !!lastArea.current
    lastArea.current = areaKey
    if (!areaKey && wasSet) onAreaCleared()
  }, [areaKey]) // eslint-disable-line react-hooks/exhaustive-deps
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
