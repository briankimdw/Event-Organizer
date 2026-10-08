import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bookmark, Flag, Info, MapPin, Camera, Sparkles, X } from 'lucide-react'
import Sheet from '../components/Sheet.jsx'
import ExifPanel from '../components/Exif.jsx'
import ProfileLink from '../components/ProfileLink.jsx'
import { BeforeAfter } from '../components/Media.jsx'
import { SaveSheet, ModerationSheet } from '../components/PostSheets.jsx'
import { money, startingPrice } from '../components/Booking.jsx'
import { IdVerified, ProBadge } from '../components/Badges.jsx'
import { useStore } from '../store.jsx'
import { galleryFor, getPerson, img, posts } from '../data/mock.js'

const shortExif = (e) => [e.focal, e.aperture, e.shutter, `ISO ${e.iso}`].join('  ·  ')
const PAGE = 70 // px of drag needed to change album (vertical) or photo (horizontal)
const EXIT = 90 // px of drag needed to close
const HOLD_MS = 220 // press this long to hide the overlays
const MAX_ZOOM = 4
const DOUBLE_TAP_MS = 280
const NO_ZOOM = { s: 1, x: 0, y: 0 }

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Full-screen viewer for a photographer's portfolio, one album (shoot) at a time.
// Swipe left/right through an album's photos, up/down between albums. To close: the ✕,
// swipe right on an album's first photo, or pull down on the first album.
// Pinch / double-tap / ctrl+wheel to zoom; press and hold to see just the photo.
export default function Gallery() {
  const { personId } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { saved } = useStore()
  const person = getPerson(personId)
  const albums = galleryFor(personId)
  const isProvider = !!person.packages
  const first = person.name.split(' ')[0]

  // Open at ?post=<album id>, or ?photo=<seed> for older links.
  const [index, setIndex] = useState(() => {
    const byPost = albums.findIndex((a) => a.id === params.get('post'))
    const byPhoto = albums.findIndex((a) => a.photos.some((p) => p.seed === params.get('photo')))
    return Math.max(0, byPost >= 0 ? byPost : byPhoto)
  })
  const [photoOf, setPhotoOf] = useState({}) // album id → photo index, so each album remembers its place
  const [drag, setDrag] = useState({ x: 0, y: 0, exit: 0 })
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(NO_ZOOM)
  const [zooming, setZooming] = useState(false)
  const [holding, setHolding] = useState(false)
  const [exiting, setExiting] = useState(null) // right | left | down | up
  const [info, setInfo] = useState(false)
  const [saveFor, setSaveFor] = useState(null)
  const [reporting, setReporting] = useState(false)
  const [hintSeen, setHintSeen] = useState(false)

  const viewerRef = useRef()
  const panelRef = useRef()
  const pointers = useRef(new Map())
  const gesture = useRef(null) // { mode: swipe | pan | pinch, ... }
  const lastTap = useRef({ t: 0, x: 0, y: 0 })
  const holdTimer = useRef()
  const wheelLock = useRef(false)

  const album = albums[index]
  const photoIndex = photoOf[album.id] ?? 0
  const photo = album.photos[photoIndex]
  const lastAlbum = albums.length - 1
  const lastPhoto = album.photos.length - 1
  const zoomed = zoom.s > 1.01

  const close = (direction) => {
    setExiting(direction)
    setTimeout(() => {
      // Opened from a shared link with no history: fall back to the profile.
      if (location.key === 'default') navigate(`/u/${personId}`, { replace: true })
      else navigate(-1)
    }, 220)
  }
  const goAlbum = (next) => {
    if (next < 0 || next > lastAlbum) return
    setIndex(next)
    setHintSeen(true)
  }
  const goPhoto = (next) => {
    if (next < 0 || next > lastPhoto) return
    setPhotoOf((m) => ({ ...m, [album.id]: next }))
    setHintSeen(true)
  }

  // Keep photos clear of the bottom panel: expose its height to CSS as --panel-h.
  useEffect(() => {
    const panel = panelRef.current
    const ro = new ResizeObserver(() => viewerRef.current?.style.setProperty('--panel-h', `${panel.offsetHeight}px`))
    ro.observe(panel)
    return () => ro.disconnect()
  }, [])

  // Each photo starts un-zoomed.
  useEffect(() => {
    setZoom(NO_ZOOM)
    setDrag({ x: 0, y: 0, exit: 0 })
  }, [index, photoIndex])

  // ---- zoom helpers (positions are relative to the center of the photo area) ----
  // The photo area is the current slide minus its padding (top bar / bottom panel), unaffected by zoom.
  const viewerBox = () => {
    const photoEl = viewerRef.current.querySelector('.reel-zoom.current')?.parentElement
    if (!photoEl) return viewerRef.current.getBoundingClientRect()
    const r = photoEl.getBoundingClientRect()
    const cs = getComputedStyle(photoEl)
    const top = r.top + parseFloat(cs.paddingTop)
    const height = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    return { left: r.left, top, width: r.width, height }
  }
  const fromCenter = (clientX, clientY) => {
    const r = viewerBox()
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) }
  }
  const clampZoom = ({ s, x, y }) => {
    const r = viewerBox()
    const scale = clamp(s, 1, MAX_ZOOM)
    const maxX = ((scale - 1) * r.width) / 2
    const maxY = ((scale - 1) * r.height) / 2
    return scale <= 1.01 ? NO_ZOOM : { s: scale, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
  }
  // Zoom to `nextScale` while keeping the point `p` (relative to center) under the finger/cursor.
  const zoomAround = (z, nextScale, p) => {
    const ratio = nextScale / z.s
    return clampZoom({ s: nextScale, x: p.x - ratio * (p.x - z.x), y: p.y - ratio * (p.y - z.y) })
  }

  // ---- keyboard and wheel ----
  useEffect(() => {
    const onKey = (e) => {
      if (info || saveFor || reporting) return
      if (!zoomed) {
        if (e.key === 'ArrowDown') goAlbum(index + 1)
        if (e.key === 'ArrowUp') goAlbum(index - 1)
        if (e.key === 'ArrowRight') goPhoto(photoIndex + 1)
        if (e.key === 'ArrowLeft') goPhoto(photoIndex - 1)
      }
      if (e.key === '+' || e.key === '=') setZoom((z) => zoomAround(z, z.s * 1.5, { x: 0, y: 0 }))
      if (e.key === '-') setZoom((z) => zoomAround(z, z.s / 1.5, { x: 0, y: 0 }))
      if (e.key === 'Escape') (zoomed ? setZoom(NO_ZOOM) : close('right'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // React's onWheel is passive, so ctrl+wheel (trackpad pinch) needs a native listener to stop page zoom.
  useEffect(() => {
    const el = viewerRef.current
    const onWheel = (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const p = fromCenter(e.clientX, e.clientY)
        setZoom((z) => zoomAround(z, z.s * Math.exp(-e.deltaY * 0.01), p))
        return
      }
      if (zoom.s > 1.01) {
        setZoom((z) => clampZoom({ ...z, x: z.x - e.deltaX, y: z.y - e.deltaY }))
        return
      }
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      const delta = horizontal ? e.deltaX : e.deltaY
      if (wheelLock.current || Math.abs(delta) < 20) return
      wheelLock.current = true
      setTimeout(() => (wheelLock.current = false), 450)
      if (horizontal) goPhoto(photoIndex + (delta > 0 ? 1 : -1))
      else goAlbum(index + (delta > 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // ---- pointer gestures ----
  const onDown = (e) => {
    if (exiting || e.target.closest('button, a, [role=link]')) return
    const onSlider = e.target.matches('input[type=range]') // before/after slider owns horizontal drags
    if (!onSlider) e.currentTarget.setPointerCapture(e.pointerId)
    // A primary pointer starts a fresh interaction: forget any finger whose "up" we never saw.
    if (e.isPrimary) pointers.current.clear()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    clearTimeout(holdTimer.current)

    if (pointers.current.size === 2) {
      // Second finger down: switch to pinch-zoom.
      const [a, b] = [...pointers.current.values()]
      gesture.current = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2), start: zoom }
      setHolding(false)
      setDragging(false)
      setDrag({ x: 0, y: 0, exit: 0 })
      setZooming(true)
      return
    }
    if (pointers.current.size > 2) return

    // On the photo, drags flip photos/albums. Anywhere else (dark background, text), drags pull the
    // whole viewer away to close it, in any direction.
    const onPicture = !!e.target.closest('.reel-zoom img, .reel-ba')
    gesture.current = zoomed
      ? { mode: 'pan', x: e.clientX, y: e.clientY, start: zoom, moved: false }
      : onPicture
        ? { mode: 'swipe', x: e.clientX, y: e.clientY, axis: null, onSlider }
        : { mode: 'dismiss', x: e.clientX, y: e.clientY, moved: false }
    if (zoomed) setZooming(true)
    holdTimer.current = setTimeout(() => setHolding(true), HOLD_MS)
  }

  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return

    if (g.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2)
      const scaled = zoomAround(g.start, g.start.s * (dist / g.dist), g.mid)
      setZoom(clampZoom({ ...scaled, x: scaled.x + mid.x - g.mid.x, y: scaled.y + mid.y - g.mid.y }))
      return
    }

    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.hypot(dx, dy) > 8) {
      clearTimeout(holdTimer.current)
      setHolding(false)
    }

    if (g.mode === 'pan') {
      if (Math.hypot(dx, dy) > 4) g.moved = true
      setZoom(clampZoom({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy }))
      return
    }

    if (g.mode === 'dismiss') {
      if (!g.moved && Math.hypot(dx, dy) > 8) { g.moved = true; setDragging(true) }
      if (g.moved) setDrag({ x: 0, y: 0, exit: 0, fx: dx, fy: dy })
      return
    }

    if (!g.axis && Math.hypot(dx, dy) > 8) {
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.onSlider && g.axis === 'x') { gesture.current = null; return }
      setDragging(true)
    }
    if (g.axis === 'y') {
      // Rubber-band past the last album; past the first album, pulling down closes.
      setDrag({ x: 0, y: index === lastAlbum && dy < 0 ? dy * 0.3 : dy, exit: 0 })
    } else if (g.axis === 'x') {
      if (photoIndex === 0 && dx > 0) {
        // Swiping right on the first photo pulls the whole viewer away (Instagram-style back).
        setDrag({ x: 0, y: 0, exit: dx })
      } else {
        const atEnd = photoIndex === lastPhoto && dx < 0
        setDrag({ x: atEnd ? dx * 0.3 : dx, y: 0, exit: 0 })
      }
    }
  }

  const onUp = (e) => {
    pointers.current.delete(e.pointerId)
    clearTimeout(holdTimer.current)
    setHolding(false)
    const g = gesture.current

    if (g?.mode === 'pinch') {
      // Lifting one finger ends the pinch; the other finger doesn't start a new gesture.
      if (pointers.current.size < 2) { gesture.current = null; setZooming(false) }
      return
    }
    gesture.current = null
    setDragging(false)
    setZooming(false)
    if (!g) return

    if (g.mode === 'dismiss') {
      const fx = drag.fx || 0
      const fy = drag.fy || 0
      if (Math.hypot(fx, fy) > EXIT) {
        return close(Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : fy > 0 ? 'down' : 'up')
      }
      setDrag({ x: 0, y: 0, exit: 0 })
      return
    }

    const isTap = g.mode === 'pan' ? !g.moved : !g.axis
    if (isTap) {
      // Double-tap: zoom in where you tapped, or back out if already zoomed.
      const now = Date.now()
      const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 30
      if (now - lastTap.current.t < DOUBLE_TAP_MS && near) {
        setZoom((z) => (z.s > 1.01 ? NO_ZOOM : zoomAround(z, 2.5, fromCenter(e.clientX, e.clientY))))
        lastTap.current = { t: 0, x: 0, y: 0 }
        setHintSeen(true)
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
      }
      return
    }
    if (g.mode !== 'swipe') return
    if (drag.exit > EXIT) return close('right')
    if (g.axis === 'y') {
      if (drag.y < -PAGE) goAlbum(index + 1)
      else if (drag.y > EXIT && index === 0) return close('down')
      else if (drag.y > PAGE) goAlbum(index - 1)
    } else if (g.axis === 'x') {
      if (drag.x < -PAGE) goPhoto(photoIndex + 1)
      else if (drag.x > PAGE) goPhoto(photoIndex - 1)
    }
    setDrag({ x: 0, y: 0, exit: 0 })
  }

  // Close gestures move the whole viewer; paging gestures move the album / photo tracks.
  const pullingDown = index === 0 && drag.y > 0
  const free = Math.hypot(drag.fx || 0, drag.fy || 0) // off-picture drag distance
  const EXIT_TRANSFORMS = { right: 'translateX(100%)', left: 'translateX(-100%)', down: 'translateY(100%)', up: 'translateY(-100%)' }
  const viewerTransform = exiting ? EXIT_TRANSFORMS[exiting]
    : free ? `translate(${drag.fx}px, ${drag.fy}px) scale(${1 - Math.min(free, 300) / 1500})`
    : drag.exit ? `translateX(${drag.exit}px)`
    : pullingDown ? `translateY(${drag.y}px) scale(${1 - Math.min(drag.y, 300) / 1500})`
    : 'none'
  const albumTransform = `translateY(calc(${-index * 100}% + ${pullingDown ? 0 : drag.y}px))`
  const anim = dragging ? 'none' : 'transform .3s cubic-bezier(.2, .8, .2, 1)'
  const fade = Math.min(1, (drag.exit + free + (pullingDown ? drag.y : 0)) / 300)

  return (
    <div className="reel" style={{ background: `rgba(8, 8, 8, ${1 - fade * 0.7})` }}>
      <div
        ref={viewerRef}
        className={`reel-viewer ${holding ? 'holding' : ''} ${zoomed ? 'zoomed' : ''}`}
        style={{ transform: viewerTransform, transition: anim }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={(e) => pointers.current.has(e.pointerId) && onUp(e)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Albums stack vertically; each album's photos sit side by side. */}
        <div className="reel-track" style={{ transform: albumTransform, transition: anim }}>
          {albums.map((a, i) => {
            const current = i === index
            const at = photoOf[a.id] ?? 0
            return (
              <div key={a.id} className="reel-slide">
                {Math.abs(i - index) <= 1 && (
                  <div
                    className="reel-photos"
                    style={{
                      transform: `translateX(calc(${-at * 100}% + ${current ? drag.x : 0}px))`,
                      transition: current ? anim : 'none',
                    }}
                  >
                    {a.photos.map((p, j) => (
                      <div key={p.seed} className="reel-photo">
                        {Math.abs(j - at) <= 1 && (
                          <div
                            className={`reel-zoom ${current && j === at ? 'current' : ''}`}
                            style={current && j === at ? {
                              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`,
                              transition: zooming ? 'none' : 'transform .25s ease',
                            } : undefined}
                          >
                            {a.type === 'beforeafter' ? (
                              <div className="reel-ba"><BeforeAfter seed={p.seed} /></div>
                            ) : (
                              <img src={img(p.seed, 1200, 1500)} alt="" draggable={false} />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Everything below fades out while you press and hold (and steps aside while zoomed). */}
        <header className="reel-top reel-ui">
          <button className="icon-btn" onClick={() => close('right')} aria-label="Close"><X size={24} /></button>
          {zoomed ? (
            <button className="reel-zoom-pill" onClick={() => setZoom(NO_ZOOM)}>{zoom.s.toFixed(1)}× · reset</button>
          ) : (
            album.photos.length > 1 && <span className="reel-count">{photoIndex + 1} / {album.photos.length}</span>
          )}
        </header>

        <div className="reel-bottom reel-ui reel-hide-zoomed" ref={panelRef}>
          {album.photos.length > 1 && (
            <div className="reel-dots">
              {album.photos.map((p, j) => <span key={p.seed} className={j === photoIndex ? 'on' : ''} />)}
            </div>
          )}
          <div className="reel-title-row">
            <div className="grow">
              <div className="reel-title">{album.title}</div>
              <div className="reel-meta">
                Album {index + 1} of {albums.length}{album.location && ` · ${album.location}`} · {album.date}
              </div>
            </div>
            <div className="reel-icons">
              <button className="icon-btn" onClick={() => setSaveFor(photo.seed)} aria-label="Save">
                <Bookmark size={22} fill={saved.has(photo.seed) ? 'currentColor' : 'none'} />
              </button>
              <button className="icon-btn" onClick={() => setInfo(true)} aria-label="Album details">
                <Info size={22} />
              </button>
            </div>
          </div>
          <ProfileLink id={personId} className="reel-who">
            <img className="avatar" src={person.avatar} alt="" />
            <span>{person.name}</span>
            {person.idVerified && <IdVerified />}
            {person.pro && <ProBadge />}
          </ProfileLink>
          <div className="reel-exif">{shortExif(photo.exif)}</div>
          {isProvider && (
            <div className="reel-book">
              <span className="small">from {money(startingPrice(person))} · ★ {person.rating}</span>
              <Link to={`/book/${personId}`} className="btn sm accent">Book {first}</Link>
            </div>
          )}
        </div>

        {!hintSeen && (
          <div className="reel-hint reel-ui">
            {album.photos.length > 1 ? 'Swipe ← for more of this shoot · ' : ''}↑ next album
            <br />
            Double-tap to zoom · drag off the photo to close
          </div>
        )}
      </div>

      <Sheet open={info} onClose={() => setInfo(false)} title={album.title}>
        {album.caption && <p className="small">{album.caption}</p>}
        <div className="gallery-meta">
          {album.location && <span><MapPin size={13} /> {album.location} · {album.date}</span>}
          {album.realPhoto && <span className="ok"><Camera size={13} /> Real Photo · verified with the RAW file</span>}
        </div>
        <h4 className="section-title">Gear & settings{album.photos.length > 1 ? ` · photo ${photoIndex + 1}` : ''}</h4>
        <ExifPanel exif={photo.exif} />
        <h4 className="section-title">Tags</h4>
        <div className="chips">
          <span className="chip solid">{album.genre}</span>
          {album.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
          {album.autoTags.map((t) => (
            <span key={t} className="chip auto"><Sparkles size={11} /> {t}</span>
          ))}
        </div>
        <button className="list-row danger mt" onClick={() => { setInfo(false); setReporting(true) }}>
          <span className="round-icon"><Flag size={16} /></span>
          <div className="grow small">Report this album</div>
        </button>
      </Sheet>

      <SaveSheet open={!!saveFor} onClose={() => setSaveFor(null)} postId={saveFor} />
      <ModerationSheet open={reporting} onClose={() => setReporting(false)} what="album" username={person.username} />
    </div>
  )
}

// Old /post/:id links (e.g. posts shared in chat) open the viewer at that album.
export function PostRedirect() {
  const { id } = useParams()
  const post = posts.find((p) => p.id === id)
  if (!post) return <Navigate to="/" replace />
  return <Navigate to={`/gallery/${post.authorId}?post=${post.id}`} replace />
}
