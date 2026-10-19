import { useState } from 'react'
import { RealPhoto } from './Badges.jsx'
import BeforeAfterSlider from './beforeafter/BeforeAfter.jsx'

const srcOf = (p) => (typeof p === 'string' ? p : p?.src)

// photos: image URLs (or { src } objects).
// label: what the photos show (e.g. the post title), used for their alt text.
export function Carousel({ photos = [], aspect = '4 / 5', label = '' }) {
  const seeds = photos.map(srcOf).filter(Boolean)
  const [index, setIndex] = useState(0)
  const onScroll = (e) => setIndex(Math.round(e.target.scrollLeft / e.target.clientWidth))
  const many = seeds.length > 1
  return (
    <div className="carousel" style={{ aspectRatio: aspect }}>
      {/* Focusable when it scrolls, so arrow keys can page through the photos. */}
      <div className="carousel-track" onScroll={onScroll} tabIndex={many ? 0 : undefined}
        role={many ? 'group' : undefined} aria-roledescription={many ? 'carousel' : undefined}
        aria-label={many ? `${label || 'Photos'}, ${seeds.length} photos` : undefined}>
        {seeds.map((s, i) => (
          <img key={s} src={s} alt={label ? (many ? `${label}, photo ${i + 1} of ${seeds.length}` : label) : ''} loading="lazy" draggable={false} />
        ))}
      </div>
      {many && (
        <>
          <div className="carousel-count" aria-hidden="true">
            {index + 1}/{seeds.length}
          </div>
          <div className="carousel-dots" aria-hidden="true">
            {seeds.map((s, i) => (
              <span key={s} className={i === index ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Back-compat wrapper (old props): src is the edited photo, beforeSrc the original; without a
// beforeSrc the "before" side fakes an unedited look with a CSS filter. New code: import
// components/beforeafter/BeforeAfter.jsx directly ({ before, after, alt, ... }; spec at its top).
export function BeforeAfter({ src, beforeSrc, aspect = '4 / 5', ...rest }) {
  return <BeforeAfterSlider before={beforeSrc} after={src} aspect={aspect} {...rest} />
}

// An album (from toViewerAlbum) as a carousel or before/after slider.
export function PostMedia({ post }) {
  return (
    <div className="post-media">
      {post.type === 'beforeafter' ? <BeforeAfter src={post.photos[0]?.src} beforeSrc={post.photos[0]?.beforeSrc} alt={post.title} /> : <Carousel photos={post.photos} label={post.title} />}
      {post.realPhoto && <RealPhoto overlay />}
    </div>
  )
}
