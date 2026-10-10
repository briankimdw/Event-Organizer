// Map geometry for react-native-maps (regions are center + span in degrees),
// the native counterpart of the web's components/map/mapKit.jsx bounds helpers.
// The "area" boxes ({ w, s, e, n }) are the shared api/locations.js shape.

export type LatLng = { lat: number; lng: number }
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }
export type Box = { w: number; s: number; e: number; n: number }

const KM_PER_DEG = 111.32
const MIN_DELTA = 0.02

/** The region that shows a service-radius circle (with a little margin). */
export function circleRegion({ lat, lng }: LatLng, radiusKm: number, margin = 1.25): Region {
  const r = Math.max(radiusKm, 0.5) * margin
  const latDelta = (2 * r) / KM_PER_DEG
  const lngDelta = (2 * r) / (KM_PER_DEG * Math.max(0.1, Math.cos((lat * Math.PI) / 180)))
  return { latitude: lat, longitude: lng, latitudeDelta: Math.max(latDelta, MIN_DELTA), longitudeDelta: Math.max(lngDelta, MIN_DELTA) }
}

/** The region that contains every point (null for none). pad: extra span, as a fraction. */
export function pointsRegion(points: (LatLng | null | undefined)[], pad = 0.35, minKm = 12): Region | null {
  const valid = points.filter(Boolean) as LatLng[]
  if (!valid.length) return null
  const lats = valid.map((p) => p.lat)
  const lngs = valid.map((p) => p.lng)
  const s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs)
  const minDelta = minKm / KM_PER_DEG
  return {
    latitude: (s + n) / 2,
    longitude: (w + e) / 2,
    latitudeDelta: Math.max((n - s) * (1 + pad), minDelta),
    longitudeDelta: Math.max((e - w) * (1 + pad), minDelta),
  }
}

export const boxRegion = (b: Box): Region => ({
  latitude: (b.s + b.n) / 2,
  longitude: (((((b.w + b.e) / 2 + 180) % 360) + 360) % 360) - 180,
  latitudeDelta: b.n - b.s,
  longitudeDelta: b.e - b.w,
})

export const regionBox = (r: Region): Box => ({
  w: r.longitude - r.longitudeDelta / 2,
  e: r.longitude + r.longitudeDelta / 2,
  s: Math.max(-89.9, r.latitude - r.latitudeDelta / 2),
  n: Math.min(89.9, r.latitude + r.latitudeDelta / 2),
})

/** Has the map moved far enough from `ref` to offer "Search this area"? */
export function movedFrom(ref: Region | null, now: Region): boolean {
  if (!ref) return false
  const zoomChange = Math.abs(Math.log2(now.longitudeDelta / ref.longitudeDelta))
  const shift = Math.max(Math.abs(now.latitude - ref.latitude) / ref.latitudeDelta, Math.abs(now.longitude - ref.longitude) / ref.longitudeDelta)
  return zoomChange >= 0.8 || shift > 0.18
}

/** A region grown to also include `point`. */
export function includePoint(r: Region, p: LatLng, pad = 1.3): Region {
  const s = Math.min(r.latitude - r.latitudeDelta / 2, p.lat)
  const n = Math.max(r.latitude + r.latitudeDelta / 2, p.lat)
  const w = Math.min(r.longitude - r.longitudeDelta / 2, p.lng)
  const e = Math.max(r.longitude + r.longitudeDelta / 2, p.lng)
  return { latitude: (s + n) / 2, longitude: (w + e) / 2, latitudeDelta: (n - s) * pad, longitudeDelta: (e - w) * pad }
}
