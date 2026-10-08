import { useState } from 'react'
import { img } from '../data/mock.js'
import { RealPhoto } from './Badges.jsx'

export function Carousel({ seeds, aspect = '4 / 5' }) {
  const [index, setIndex] = useState(0)
  const onScroll = (e) => setIndex(Math.round(e.target.scrollLeft / e.target.clientWidth))
  return (
    <div className="carousel" style={{ aspectRatio: aspect }}>
      <div className="carousel-track" onScroll={onScroll}>
        {seeds.map((s) => (
          <img key={s} src={img(s)} alt="" loading="lazy" draggable={false} />
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

// Paired before/after viewer. The "before" is the same frame with an unedited look.
export function BeforeAfter({ seed, aspect = '4 / 5' }) {
  const [pos, setPos] = useState(50)
  return (
    <div className="before-after" style={{ aspectRatio: aspect }}>
      <img src={img(seed)} alt="After" draggable={false} />
      <div className="ba-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={img(seed)} alt="Before" draggable={false} />
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

export function PostMedia({ post }) {
  return (
    <div className="post-media">
      {post.type === 'beforeafter' ? <BeforeAfter seed={post.photos[0]} /> : <Carousel seeds={post.photos} />}
      {post.realPhoto && <RealPhoto overlay />}
    </div>
  )
}
