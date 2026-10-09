// Lazy entry points for the map components, so Leaflet only loads when a map
// is actually on screen. Screens import from here, never from the map files.
import { lazy, Suspense } from 'react'

const ProviderMapImpl = lazy(() => import('../ProviderMap.jsx'))
const MapPreviewImpl = lazy(() => import('./MapPreview.jsx'))
const ServiceAreaEditorImpl = lazy(() => import('./ServiceAreaEditor.jsx'))

// A soft placeholder the same size as the map while Leaflet loads.
const Placeholder = ({ height, className = '' }) => (
  <div className={`pm-loading ${className}`} style={{ height }} role="status" aria-label="Loading map">
    <span className="spinner" />
  </div>
)

export function ProviderMap(props) {
  return (
    <Suspense fallback={<Placeholder height={420} />}>
      <ProviderMapImpl {...props} />
    </Suspense>
  )
}

export function MapPreview(props) {
  return (
    <Suspense fallback={<Placeholder height={props.height ?? 150} className="pm-preview" />}>
      <MapPreviewImpl {...props} />
    </Suspense>
  )
}

export function ServiceAreaEditor(props) {
  return (
    <Suspense fallback={<Placeholder height={360} />}>
      <ServiceAreaEditorImpl {...props} />
    </Suspense>
  )
}
