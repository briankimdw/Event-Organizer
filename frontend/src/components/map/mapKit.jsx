// Shared Leaflet bits for the map components (only imported by lazy-loaded
// files, so the rest of the app never pays for Leaflet).
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect } from 'react'
import { AttributionControl, TileLayer, useMap } from 'react-leaflet'

// Standard OpenStreetMap tiles (free, no key), softened with CSS (.pm-map
// .leaflet-tile-pane) so pins and the service radius stand out.
export function Tiles() {
  return (
    <>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
        maxZoom={19}
      />
      <AttributionControl position="bottomright" prefix={false} />
    </>
  )
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// Round avatar pin. Icons are cached so markers don't re-render their DOM.
const icons = new Map()
// dim: faded (e.g. outside the searched map area).
export function avatarIcon(avatar, { selected = false, size = 40, dim = false } = {}) {
  const key = `${avatar}|${selected}|${size}|${dim}`
  if (!icons.has(key)) {
    const box = selected ? size + 8 : size
    icons.set(
      key,
      L.divIcon({
        className: 'pm-pin-wrap',
        html: `<div class="pm-pin${selected ? ' on' : ''}${dim ? ' dim' : ''}" style="width:${box}px;height:${box}px"><img src="${esc(avatar)}" alt="" draggable="false"/></div>`,
        iconSize: [box, box],
        iconAnchor: [box / 2, box / 2],
      }),
    )
  }
  return icons.get(key)
}

// A group of pins too close to tell apart: the first avatar with a count badge.
export function clusterIcon(avatar, count, { size = 40, dim = false } = {}) {
  const key = `cluster|${avatar}|${count}|${size}|${dim}`
  if (!icons.has(key)) {
    icons.set(
      key,
      L.divIcon({
        className: 'pm-pin-wrap',
        html: `<div class="pm-cluster${dim ? ' dim' : ''}" style="width:${size}px;height:${size}px"><div class="pm-pin pm-stack"></div><div class="pm-pin"><img src="${esc(avatar)}" alt="" draggable="false"/></div><span class="pm-count">${count}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    )
  }
  return icons.get(key)
}

// The user's location: a blue dot with a soft halo.
export const meIcon = L.divIcon({ className: 'pm-me-wrap', html: '<div class="pm-me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] })

// Bounds of a service-radius circle.
export const circleBounds = ({ lat, lng }, radiusKm) => L.latLng(lat, lng).toBounds(Math.max(radiusKm, 0.5) * 2000)

// Bounds that contain every point (null for none).
export function pointsBounds(points) {
  const valid = points.filter(Boolean)
  if (!valid.length) return null
  return L.latLngBounds(valid.map((p) => [p.lat, p.lng]))
}

// Keeps Leaflet's idea of its size in sync with its box (it renders inside a
// fixed phone frame, sheets and tabs that change size or appear later).
// fit: optional { bounds, options } to re-frame after a resize (static previews).
export function AutoSize({ fit }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    let last = `${el.clientWidth}x${el.clientHeight}`
    const sync = () => {
      const size = `${el.clientWidth}x${el.clientHeight}`
      if (size === last) return
      last = size
      map.invalidateSize({ pan: false })
      if (fit) map.fitBounds(fit.bounds, { ...fit.options, animate: false })
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    const t = setTimeout(() => { last = ''; sync() }, 250) // after sheet/tab animations
    return () => {
      ro.disconnect()
      clearTimeout(t)
    }
  }, [map, fit])
  return null
}

// Service-radius circle options, spread as <Circle {...radiusStyle} /> props (react-leaflet only
// applies className/interactive at creation, not via pathOptions). Colors come from CSS: .pm-radius.
export const radiusStyle = { className: 'pm-radius', weight: 1.5, fillOpacity: 0.1, interactive: false }
