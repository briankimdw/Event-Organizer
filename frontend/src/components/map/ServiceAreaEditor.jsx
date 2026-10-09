// Photographer's own service area: where they're based (search a place, drag
// the pin or tap the map) and how far they travel. Lazy-loaded (LazyMap.jsx).
import { useEffect, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { LocateFixed, MapPin, Search as SearchIcon, X } from 'lucide-react'
import { geocode, getMyLocation, lastKnownLocation, reverseGeocode } from '../../api/locations.js'
import { AutoSize, Tiles, avatarIcon, circleBounds, radiusStyle } from './mapKit.jsx'

// Slider stops (km): fine steps nearby, bigger ones for photographers who travel far.
const STOPS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]
const nearestStop = (km) => STOPS.reduce((best, s, i) => (Math.abs(s - km) < Math.abs(STOPS[best] - km) ? i : best), 0)

// initial: { location {lat,lng}|null, radiusKm, city }. onSave({ lat, lng, radiusKm, city }) -> Promise.
export default function ServiceAreaEditor({ initial, avatar, onSave, saving = false }) {
  const [point, setPoint] = useState(initial.location)
  const [stop, setStop] = useState(nearestStop(initial.radiusKm ?? 40))
  const [city, setCity] = useState(initial.city || '')
  const [cityTouched, setCityTouched] = useState(false)
  const [q, setQ] = useState(initial.location ? '' : initial.city || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState(null) // { text, error }
  const [locating, setLocating] = useState(false)
  const skipSearch = useRef(false)
  const radiusKm = STOPS[stop]

  // Debounced place search (Nominatim allows one request a second; locations.js queues them).
  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    const query = q.trim()
    if (query.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    const t = setTimeout(() => {
      geocode(query, { signal: ctrl.signal })
        .then((rows) => {
          setResults(rows)
          setMessage(rows.length ? null : { text: 'No places found. Try a city name or a fuller address.' })
        })
        .catch((e) => e.name !== 'AbortError' && setMessage({ text: e.message || 'Place search failed. Try again.', error: true }))
        .finally(() => !ctrl.signal.aborted && setSearching(false))
    }, 600)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  // After the pin moves by hand, name the area after the town it's in (unless they typed a name).
  const [movedAt, setMovedAt] = useState(null)
  useEffect(() => {
    if (!movedAt || !point || cityTouched) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      reverseGeocode(point, { signal: ctrl.signal })
        .then((label) => label && setCity(label))
        .catch(() => {})
    }, 900)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [movedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const movePin = (p) => {
    setPoint({ lat: p.lat, lng: ((((p.lng + 180) % 360) + 360) % 360) - 180 })
    setMessage(null)
    setMovedAt(Date.now())
  }

  const pick = (r) => {
    skipSearch.current = true
    setQ(r.label)
    setResults([])
    setPoint({ lat: r.lat, lng: r.lng })
    setCity(r.label)
    setCityTouched(false)
    setMessage(null)
  }

  const useMine = async () => {
    setLocating(true)
    try {
      movePin(await getMyLocation())
    } catch (e) {
      setMessage({ text: e.message, error: true })
    } finally {
      setLocating(false)
    }
  }

  const dirty =
    !!point &&
    (!initial.location ||
      point.lat !== initial.location.lat ||
      point.lng !== initial.location.lng ||
      radiusKm !== initial.radiusKm ||
      city.trim() !== (initial.city || '').trim())

  const start = point || lastKnownLocation()

  return (
    <div className="sa-editor">
      <div className="search">
        <SearchIcon size={16} />
        <input
          placeholder="Search a city or address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          aria-label="Search a city or address"
        />
        {searching ? <span className="spinner sa-spin" /> : q && (
          <button className="icon-btn" onClick={() => { setQ(''); setResults([]) }} aria-label="Clear"><X size={14} /></button>
        )}
      </div>
      {results.length > 0 && (
        <div className="sa-results">
          {results.map((r) => (
            <button key={r.id} className="sa-result" onClick={() => pick(r)}>
              <MapPin size={16} className="muted" />
              <span className="grow">
                <span className="small sa-result-label">{r.label}</span>
                <span className="muted tiny ellipsis sa-result-detail">{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {message && <div className={`tiny mt-xs ${message.error ? 'sa-error' : 'muted'}`}>{message.text}</div>}

      <div className="sa-map mt-sm">
        <MapContainer
          className="pm-map"
          center={start ? [start.lat, start.lng] : [39.5, -98.35]}
          zoom={start ? 10 : 3}
          zoomControl={false}
          attributionControl={false}
          worldCopyJump
        >
          <Tiles />
          <AutoSize />
          <Frame point={point} radiusKm={radiusKm} />
          <TapToMove onTap={movePin} />
          {point && (
            <>
              <Circle center={[point.lat, point.lng]} radius={radiusKm * 1000} {...radiusStyle} />
              <Marker
                position={[point.lat, point.lng]}
                icon={avatarIcon(avatar, { selected: true, size: 36 })}
                draggable
                autoPan
                title="Your base. Drag to move."
                eventHandlers={{ dragend: (e) => movePin(e.target.getLatLng()) }}
              />
            </>
          )}
        </MapContainer>
        <button className="pm-ctl sa-locate" onClick={useMine} disabled={locating} aria-label="Use my current location">
          {locating ? <span className="spinner pm-spin" /> : <LocateFixed size={18} />}
        </button>
        <div className="sa-map-hint">{point ? 'Drag the pin or tap the map to move it' : 'Search above or tap the map'}</div>
      </div>

      <div className="row between mt">
        <span className="small"><b>How far you travel</b></span>
        <b className="sa-km">{radiusKm.toLocaleString('en-US')} km</b>
      </div>
      <input
        type="range"
        className="pm-range"
        min={0}
        max={STOPS.length - 1}
        step={1}
        value={stop}
        onChange={(e) => setStop(Number(e.target.value))}
        aria-label="Service radius"
        aria-valuetext={`${radiusKm} km`}
        style={{ '--fill': `${(stop / (STOPS.length - 1)) * 100}%` }}
      />
      <div className="muted tiny">Clients within {radiusKm} km of your base see that you travel to them. You can still accept bookings further out.</div>

      <label className="field mt">
        <span>Area name on your profile</span>
        <input
          className="input"
          maxLength={80}
          placeholder="e.g. Pasadena, CA"
          value={city}
          onChange={(e) => { setCity(e.target.value); setCityTouched(true) }}
        />
      </label>

      <button className="btn block mt" disabled={!dirty || saving} onClick={() => onSave({ ...point, radiusKm, city })}>
        {saving ? 'Saving…' : point ? 'Save service area' : 'Choose your base to continue'}
      </button>
    </div>
  )
}

// Keep the pin and its whole radius in view as they change.
function Frame({ point, radiusKm }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (!point) return
    const t = setTimeout(() => {
      map.flyToBounds(circleBounds(point, radiusKm), { padding: [20, 20], duration: first.current ? 0 : 0.45, animate: !first.current })
      first.current = false
    }, first.current ? 0 : 200)
    return () => clearTimeout(t)
  }, [map, point?.lat, point?.lng, radiusKm]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function TapToMove({ onTap }) {
  useMapEvents({ click: (e) => onTap(e.latlng) })
  return null
}
