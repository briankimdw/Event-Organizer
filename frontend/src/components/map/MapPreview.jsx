// Small, non-interactive map: one photographer's base and service radius.
// Lazy-loaded (see LazyMap.jsx). Wrap it in something tappable to open the full map.
import { useMemo } from 'react'
import { Circle, MapContainer, Marker } from 'react-leaflet'
import { AutoSize, Tiles, avatarIcon, circleBounds, radiusStyle } from './mapKit.jsx'

export default function MapPreview({ location, radiusKm, avatar, height = 150 }) {
  const fit = useMemo(
    () => ({ bounds: circleBounds(location, radiusKm ?? 0), options: { padding: [14, 14] } }),
    [location.lat, location.lng, radiusKm], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <div className="pm-preview" style={{ height }}>
      <MapContainer
        // Remount when the area changes so the view refits.
        key={`${location.lat},${location.lng},${radiusKm}`}
        className="pm-map"
        bounds={fit.bounds}
        boundsOptions={fit.options}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <Tiles />
        <AutoSize fit={fit} />
        {radiusKm != null && <Circle center={[location.lat, location.lng]} radius={radiusKm * 1000} {...radiusStyle} />}
        <Marker position={[location.lat, location.lng]} icon={avatarIcon(avatar, { size: 32 })} interactive={false} keyboard={false} />
      </MapContainer>
    </div>
  )
}
