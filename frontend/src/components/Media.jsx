import { useState } from 'react'
import { RealPhoto } from './Badges.jsx'

const srcOf = (p) => (typeof p === 'string' ? p : p?.src)

// photos: image URLs (or { src } objects).
export function Carousel({ photos = [], aspect = '4 / 5' }) {
  const seeds = photos.map(srcOf).filter(Boolean)
  const [index, setIndex] = useState(0)
  const onScroll = (e) => setIndex(Math.round(e.target.scrollLeft / e.target.clientWidth))
  return (
    <div className="carousel" style={{ aspectRatio: aspect }}>
      <div className="carousel-track" onScroll={onScroll}>
        {seeds.map((s) => (
          <img key={s} src={s} alt="" loading="lazy" draggable={false} />
        ))}
      </div>
      {seeds.length > 1 && (
        <>
          <div className="carousel-count">
            {index + 1}/{seeds.length}
          </div>
          <div className="carousel-dots">
            {seeds.map((s, i) => (
              <span key={s} className={i === index ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Paired before/after viewer: src is the edited photo, beforeSrc the original.
// Without a beforeSrc the "before" side fakes an unedited look with a CSS filter.
export function BeforeAfter({ src, beforeSrc, aspect = '4 / 5' }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="before-after" style={{ aspectRatio: aspect }}>
      <img src={src} alt="After" draggable={false} />
      <div className={`ba-before ${beforeSrc ? 'real' : ''}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={beforeSrc || src} alt="Before" draggable={false} />
      </div>
      <div className="ba-divider" style={{ left: `${pos}%` }}>
        <span className="ba-knob">⇆</span>
      </div>
      <span className="ba-label left">Before</span>
      <span className="ba-label right">After</span>
      <input
        type="range"
        min="0"
        max="100"
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        aria-label="Before/after slider"
      />
    </div>
  )
}

// An album (from toViewerAlbum) as a carousel or before/after slider.
export function PostMedia({ post }) {
  return (
    <div className="post-media">
      {post.type === 'beforeafter' ? <BeforeAfter src={post.photos[0]?.src} beforeSrc={post.photos[0]?.beforeSrc} /> : <Carousel photos={post.photos} />}
      {post.realPhoto && <RealPhoto overlay />}
    </div>
  )
}
