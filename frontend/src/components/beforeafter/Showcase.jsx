import { Link } from 'react-router-dom'
import BeforeAfter from './BeforeAfter.jsx'

// "Before & after" row on a photographer's profile: their before/after posts as live sliders.
// albums: viewer albums (toViewerAlbum); only type 'beforeafter' ones with both photos are shown.
// galleryTo(album) -> link to open the post in the full-screen viewer.
// Swipes on the photos scroll the row; the handle (and taps) compare.
export default function BeforeAfterShowcase({ albums = [], galleryTo, title = 'Before & after' }) {
  const pairs = albums.filter((a) => a.type === 'beforeafter' && a.photos[0]?.src && a.photos[0]?.beforeSrc && (!a.status || a.status === 'published'))
  if (!pairs.length) return null
  const solo = pairs.length === 1
  return (
    <section className="ba-showcase" aria-labelledby="ba-showcase-title">
      <div className="ba-showcase-head">
        <h2 id="ba-showcase-title">{title}</h2>
        {!solo && <span className="muted tiny">{pairs.length} edits · swipe for more</span>}
      </div>
      <div className="ba-showcase-row" role="list">
        {pairs.map((a, i) => (
          <div key={a.id} className={`ba-showcase-item ${solo ? 'solo' : ''}`} role="listitem">
            <BeforeAfter
              before={a.photos[0].beforeSrc}
              after={a.photos[0].src}
              alt={a.title || 'Edit'}
              aspect="4 / 5"
              dragFrom={solo ? 'anywhere' : 'handle'}
              compact
              demo={i === 0 ? 'once' : false}
            />
            <div className="ba-showcase-cap">
              <b>{a.title || 'Untitled edit'}</b>
              <Link to={galleryTo(a)} aria-label={`Open ${a.title || 'this edit'} full screen`}>Open</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
