import { Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'

// The one way the app opens Studio (docs/STUDIO.md). Tiny on purpose: Studio.jsx is its own chunk,
// and the miniPaint bundle (frontend/public/studio/minipaint.js, ~1 MB) only loads inside Studio's
// iframe, so nothing here grows the main bundle or the photo editor's chunk.
const LazyStudio = lazy(() => import('./Studio.jsx'))

// Pixel edits replace a photo's edit recipe; say so wherever Studio saves a posted photo.
export const STUDIO_RECIPE_NOTE = 'Studio edits are pixel edits: saving replaces this photo’s slider edits. Your original stays safe, and Revert still works.'

function Opening() {
  return (
    <div className="st-loading" role="status" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: '#0d0d0d', color: '#a8a8a8', font: '600 14px Inter, sans-serif' }}>
      Opening Studio…
    </div>
  )
}

/**
 * <StudioLayer source name onDone onCancel doneLabel note maxEdge quality />
 * Props: as Studio.jsx. Rendered into document.body, over the whole window (also on desktop, where
 * the app sits in a phone frame: a layers editor needs the room).
 */
export function StudioLayer(props) {
  return createPortal(
    <Suspense fallback={<Opening />}>
      <LazyStudio {...props} />
    </Suspense>,
    document.body,
  )
}

export default StudioLayer
