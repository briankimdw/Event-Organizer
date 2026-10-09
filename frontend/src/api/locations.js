// Locations: where photographers are based, how far they travel, and where the
// user is. No map code here (see components/ProviderMap.jsx), just data.
//
// providers.base_location / profiles.location are PostGIS geography points.
// PostgREST returns them as EWKB hex ("0101000020E6100000..."); we write them
// back as EWKT ("SRID=4326;POINT(lng lat)").
import { supabase } from '../lib/supabase.js'
import { invalidate } from './catalog.js'

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

// A geography point from PostgREST (EWKB/WKB hex, GeoJSON, or WKT) as
// { lat, lng }, or null when missing or unreadable.
export function parsePoint(value) {
  if (!value) return null
  if (typeof value === 'object') {
    const [lng, lat] = value.coordinates || []
    return valid(lat, lng)
  }
  if (typeof value !== 'string') return null
  const wkt = value.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i)
  if (wkt) return valid(Number(wkt[2]), Number(wkt[1]))
  if (!/^[0-9a-f]+$/i.test(value) || value.length < 42) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.substr(i * 2, 2), 16)
  const view = new DataView(bytes.buffer)
  const little = bytes[0] === 1
  const type = view.getUint32(1, little)
  if ((type & 0xff) !== 1) return null // not a point
  const offset = type & 0x20000000 ? 9 : 5 // skip the SRID when present
  if (bytes.length < offset + 16) return null
  return valid(view.getFloat64(offset + 8, little), view.getFloat64(offset, little))
}

const valid = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null

// { lat, lng } -> 'SRID=4326;POINT(lng lat)' for inserts/updates.
export const toEWKT = ({ lat, lng }) => `SRID=4326;POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`

// Great-circle distance in km between two { lat, lng } (null if either is missing).
export function distanceKm(a, b) {
  if (!a || !b) return null
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

// 0.4 -> "Under 1 km", 7.6 -> "8 km", 1234 -> "1,234 km"
export const fmtKm = (km) => (km == null ? '' : km < 1 ? 'Under 1 km' : `${Math.round(km).toLocaleString('en-US')} km`)

// Does this photographer travel to `point`? null when unknown.
export const travelsTo = (provider, point) => {
  const d = distanceKm(provider?.location, point)
  return d == null || provider.radiusKm == null ? null : d <= provider.radiusKm
}

// ---------------------------------------------------------------------------
// Photographers
// ---------------------------------------------------------------------------

// Map(providerId -> { lat, lng, radiusKm }) for every active photographer with a location.
export async function providerLocations() {
  const { data, error } = await supabase.from('providers').select('id, base_location, service_radius_km').eq('status', 'active')
  if (error) throw error
  const map = new Map()
  for (const r of data) {
    const p = parsePoint(r.base_location)
    if (p) map.set(r.id, { ...p, radiusKm: r.service_radius_km })
  }
  return map
}

// Save a photographer's base location and service radius (owner only).
// city: optional label shown on their profile ("Pasadena, CA").
export async function updateServiceArea(providerId, { lat, lng, radiusKm, city }) {
  const patch = {
    base_location: toEWKT({ lat, lng }),
    service_radius_km: Math.max(0, Math.min(1000, Math.round(radiusKm))),
  }
  if (city != null && city.trim()) patch.city = city.trim().slice(0, 80)
  const { data, error } = await supabase.from('providers').update(patch).eq('id', providerId).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('You can only change your own service area.')
  invalidate('providers') // listProviders cache
}

// ---------------------------------------------------------------------------
// Geocoding (OpenStreetMap Nominatim: at most one request per second)
// ---------------------------------------------------------------------------

const NOMINATIM = 'https://nominatim.openstreetmap.org'
let nextSlot = 0
async function nominatim(path, signal) {
  const wait = nextSlot - Date.now()
  nextSlot = Math.max(Date.now(), nextSlot) + 1100
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const res = await fetch(`${NOMINATIM}${path}&accept-language=en`, { signal })
  if (!res.ok) throw new Error('Place search is busy. Try again in a moment.')
  return res.json()
}

// Short label for a place: "Pasadena, CA" / "Shoreditch, London".
function placeLabel(r) {
  const a = r.address || {}
  const local = a.city || a.town || a.village || a.suburb || a.hamlet || a.municipality || a.county || r.name
  const region = a.country_code === 'us' ? US_STATES[a.state] || a.state : a.state || a.country
  return [local, region].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(', ') || r.display_name?.split(',')[0] || ''
}

// Search for a city or address: [{ id, label, detail, lat, lng }].
export async function geocode(q, { signal } = {}) {
  const query = q.trim()
  if (query.length < 2) return []
  const rows = await nominatim(`/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`, signal)
  return rows.map((r) => ({
    id: r.place_id,
    label: placeLabel(r),
    detail: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }))
}

// The town/city at a point ("Pasadena, CA"), or '' if unknown.
export async function reverseGeocode({ lat, lng }, { signal } = {}) {
  const r = await nominatim(`/reverse?format=json&addressdetails=1&zoom=12&lat=${lat}&lon=${lng}`, signal)
  return r && !r.error ? placeLabel(r) : ''
}

const US_STATES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

// ---------------------------------------------------------------------------
// The user's location (browser geolocation; optional)
// ---------------------------------------------------------------------------

const KEY = 'pm:myLocation'
const HOUR = 3_600_000

// Last known location from this device (kept for a few hours), or null.
export function lastKnownLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    return saved && Date.now() - saved.at < 6 * HOUR ? valid(saved.lat, saved.lng) : null
  } catch {
    return null
  }
}

// Ask the browser where the user is. Resolves { lat, lng }; rejects with a
// readable message if they say no or it can't be found.
export function getMyLocation({ timeout = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location isn’t available in this browser.'))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...point, at: Date.now() }))
        } catch {
          /* private mode: fine */
        }
        resolve(point)
      },
      (err) =>
        reject(new Error(err.code === 1 ? 'Location is turned off for this site. You can allow it in your browser settings.' : 'Couldn’t find your location. Try again.')),
      { enableHighAccuracy: false, timeout, maximumAge: 10 * 60_000 },
    )
  })
}
