// Geography points from PostgREST. Kept apart from api/locations.js so the
// catalog can parse points without importing locations (which imports the catalog).

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

// { lat, lng } when both are real coordinates, else null.
export const valid = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
