import { useEffect, useRef, useState } from 'react'
import './beforeafter.css'

// =====================================================================================
// Before / after: the shared compare component (web). Mobile mirrors this spec natively.
// =====================================================================================
//
// API
//   <BeforeAfter before after alt initial=50 orientation='horizontal' labels=true mode='slider' ... />
//     before, after   image URLs. Without `before` the before side fakes an unedited look
//                     (the after image with a desaturating CSS filter), for old callers / drafts.
//     alt             what the photos show (post title). Images get "<alt>, before" / "<alt>, after".
//     initial         0..100, where the handle starts (slider mode). Toggle mode always starts on "after".
//     orientation     'horizontal' (before on the LEFT) | 'vertical' (before on TOP).
//     labels          true | false | { before: 'Original', after: 'Edited' }.
//     mode            'slider': draggable handle.  'toggle': no handle; the Before button (or a tap,
//                     unless tapToJump=false) wipes between after and before.
//     aspect          '4 / 5' (any CSS ratio: fixed box, both images object-fit: cover) |
//                     'fill' (fills its parent, cover) | 'contain' (fills its parent; the frame takes the
//                     after photo's own shape, letterboxed — the full-screen viewer).
//     ratio           optional width/height of the after photo for 'contain' (else read on load).
//     dragFrom        'anywhere' (drag anywhere on the photo) | 'handle' (only the handle drags; drags
//                     elsewhere are left to the parent: the gallery pages, the deck swipes, a row scrolls).
//     tapToJump       tap/click on the photo animates the handle there (default true). Off in the deck,
//                     where a tap opens the card's details.
//     compareButton   the "Before" button: tap toggles before/after, press-and-hold peeks (default true).
//     demo            false | true | 'once': a one-time sweep when it first scrolls into view ('once':
//                     once per browser session across every instance). Skipped for reduced motion.
//     hint            false | true | 'once': a "Drag to compare" pill until the first interaction
//                     ('once': until the first interaction ever, remembered on this device).
//     compact         smaller knob / labels / button (cards, rows).
//     loading         'lazy' (default) | 'eager'.   onChange(p), onInteract(): optional callbacks.
//     className, style  passed to the root. Safe-area insets for the overlays (labels, button, hint):
//                     style={{ '--ba-inset-top': '64px', '--ba-inset-bottom': '120px' }}.
//   Also exported: <BeforeAfterBadge />, <BeforeAfterThumb before after alt aspect? badge />
//   (grid tiles: badge + hover / press-and-hold preview), and BA (the numbers below).
//
// INTERACTION SPEC (mobile: match these numbers and strings)
//   Model     p = handle position 0..100 from the start edge (left / top). The before photo shows on
//             [0, p], the after photo on [p, 100]. p = 0: after only; p = 100: before only. Both photos
//             share one frame, same object-fit + centre, so they line up pixel for pixel when they are
//             the same size; a mismatched before is cover-cropped to the after's frame.
//   Drag      Handle (40px knob, 32px compact; plus a 44px / 28px-wide invisible grip strip along the
//             line): follows the finger 1:1 from the first move, keeping the grab offset (no jump),
//             no easing. Surface (dragFrom 'anywhere'): becomes a drag after 6px along the slider axis;
//             a press that moves 6px across the axis first is left alone (page scroll, parent swipe).
//   Tap       press < 400ms moving < 6px: the handle eases to the tap point (260ms, ease-out cubic).
//   Keyboard  focus is on the knob (role="slider", aria-valuemin 0, max 100, aria-valuenow = p,
//             aria-valuetext "Showing 60% after, 40% before" / "Showing after only" / "Showing before only",
//             aria-label "Compare before and after: <alt>").  ←/↓ −5, →/↑ +5 (Shift: ±1), PageDown −25,
//             PageUp +25, Home 0, End 100; each step eases over 120ms. Keys are consumed (they don't reach
//             the gallery / deck shortcuts) only while the knob has focus.
//   Compare   "Before" button (aria-pressed = before only showing): tap / Enter / Space toggles to
//             before only (p 100, 180ms) and back to where it was; press-and-hold 250ms peeks at the
//             before photo until release.
//   Labels    "BEFORE" top-left, "AFTER" top-right (pills). Each fades out as its side shrinks from
//             16% to 4% of the frame; both fade out (150ms) while dragging and come back on release.
//   Demo      first time ≥ 60% visible for 400ms and untouched: p 50 → 30 → 70 → 50 over 1800ms
//             (keyframes at 0 / 450 / 1350 / 1800ms, ease-in-out per leg), relative to `initial`.
//             Any press, key or focus cancels it. Skipped with prefers-reduced-motion.
//   Reduced   prefers-reduced-motion: every eased move is instant, no demo, thumbnails don't sway.
//   Hint      "Drag to compare" ("Drag the handle to compare" with dragFrom 'handle'; toggle mode
//             "Hold Before to compare"), bottom centre, until the first interaction.
//   Gestures  the handle stops the press from reaching the parent (no gallery paging, no card swipe);
//             presses elsewhere bubble, so parents keep their swipes.
//   Thumbs    tiles show the after photo + a "Before / After" badge. Hover (mouse) or press-and-hold
//             160ms (touch) wipes the before photo in to 50% (450ms) then sways 30% ↔ 70% (3s loop).
// =====================================================================================

export const BA = {
  STEP: 5,
  STEP_FINE: 1,
  PAGE: 25,
  SLOP: 6, // px before a press becomes a drag
  TAP_MS: 400,
  HOLD_MS: 250, // Before button: press this long to peek
  JUMP_MS: 260,
  KEY_MS: 120,
  PEEK_MS: 180,
  DEMO_DELAY: 400,
  DEMO_VISIBLE: 0.6,
  DEMO: [[0, 0], [-20, 450], [20, 1350], [0, 1800]], // [offset from initial, ms]
  THUMB_PRESS_MS: 160,
}

const clamp = (v) => Math.min(100, Math.max(0, v))
const easeOut = (t) => 1 - (1 - t) ** 3
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const storage = (kind) => {
  try {
    return window[kind]
  } catch {
    return null
  }
}
const DEMO_KEY = 'ba:demo-seen'
const HINT_KEY = 'ba:hint-seen'
const seen = (kind, key) => {
  try {
    return storage(kind)?.getItem(key) === '1'
  } catch {
    return false
  }
}
const markSeen = (kind, key) => {
  try {
    storage(kind)?.setItem(key, '1')
  } catch { /* private mode */ }
}

/** aria-valuetext for a handle position (0..100, % of the frame showing the before photo). */
export const valueText = (p) => {
  const b = Math.round(p)
  if (b <= 0) return 'Showing after only'
  if (b >= 100) return 'Showing before only'
  return `Showing ${100 - b}% after, ${b}% before`
}

const Chevrons = ({ vertical }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" style={vertical ? { transform: 'rotate(90deg)' } : undefined}>
    <path d="M9.5 7 4.5 12l5 5M14.5 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Eye = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M12 5C6.5 5 2.7 9.4 1.6 12c1.1 2.6 4.9 7 10.4 7s9.3-4.4 10.4-7C21.3 9.4 17.5 5 12 5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
)

export default function BeforeAfter({
  before,
  after,
  alt = '',
  initial = 50,
  orientation = 'horizontal',
  labels = true,
  mode = 'slider',
  aspect = '4 / 5',
  ratio: ratioProp = null,
  dragFrom = 'anywhere',
  tapToJump = true,
  compareButton = true,
  demo = false,
  hint = false,
  compact = false,
  loading = 'lazy',
  onChange,
  onInteract,
  className = '',
  style,
}) {
  const vertical = orientation === 'vertical'
  const toggle = mode === 'toggle'
  const start = toggle ? 0 : clamp(initial)

  const rootRef = useRef(null)
  const frameRef = useRef(null)
  const knobRef = useRef(null)
  const pos = useRef(start) // live position (also in the --ba-pos CSS variable)
  const goal = useRef(start) // where the current animation is heading
  const rest = useRef(toggle ? 0 : start) // where "Before" returns to
  const raf = useRef(0)
  const touched = useRef(false)
  const pointer = useRef(null) // surface press: { id, x, y, t, mode: pending | drag | ignore }
  const grab = useRef(null) // handle drag: { id, offset }
  const press = useRef(null) // Before button: { timer, held }
  const beforeOnly = useRef(start >= 99.5)
  const cb = useRef({})
  cb.current = { onChange, onInteract }

  const [showingBefore, setShowingBefore] = useState(start >= 99.5)
  const [ratio, setRatio] = useState(ratioProp)
  const [loaded, setLoaded] = useState(false)
  const [hintOn, setHintOn] = useState(() => !!hint && !(hint === 'once' && seen('localStorage', HINT_KEY)))

  useEffect(() => { if (ratioProp) setRatio(ratioProp) }, [ratioProp])

  // ---- position ------------------------------------------------------------------
  const apply = (value) => {
    const p = clamp(value)
    pos.current = p
    rootRef.current?.style.setProperty('--ba-pos', p.toFixed(2))
    const k = knobRef.current
    if (k) {
      k.setAttribute('aria-valuenow', String(Math.round(p)))
      k.setAttribute('aria-valuetext', valueText(p))
    }
    const b = p >= 99.5
    if (b !== beforeOnly.current) {
      beforeOnly.current = b
      setShowingBefore(b)
    }
    cb.current.onChange?.(p)
  }
  const stop = () => cancelAnimationFrame(raf.current)
  // frames: [[value, ms], ...] starting at ms 0; each leg eased.
  const play = (frames, ease) => {
    stop()
    const t0 = performance.now()
    const total = frames[frames.length - 1][1]
    const tick = (now) => {
      const t = Math.min(total, now - t0)
      let i = 1
      while (i < frames.length - 1 && frames[i][1] < t) i++
      const [a, ta] = frames[i - 1]
      const [b, tb] = frames[i]
      apply(a + (b - a) * ease(tb > ta ? (t - ta) / (tb - ta) : 1))
      if (t < total) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const animateTo = (target, ms = BA.JUMP_MS) => {
    const to = clamp(target)
    goal.current = to
    if (ms <= 0 || reducedMotion()) {
      stop()
      return apply(to)
    }
    play([[pos.current, 0], [to, ms]], easeOut)
  }
  const setDragging = (on) => rootRef.current?.classList.toggle('ba-dragging', on)

  const interact = () => {
    stop()
    if (touched.current) return
    touched.current = true
    if (hintOn) setHintOn(false)
    if (hint === 'once') markSeen('localStorage', HINT_KEY)
    cb.current.onInteract?.()
  }

  // ---- the one-time demo sweep -----------------------------------------------------
  useEffect(() => {
    if (!demo || toggle || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    if (demo === 'once' && seen('sessionStorage', DEMO_KEY)) return
    const el = rootRef.current
    let timer
    const io = new IntersectionObserver(([entry]) => {
      clearTimeout(timer)
      if (!entry.isIntersecting || entry.intersectionRatio < BA.DEMO_VISIBLE || touched.current) return
      timer = setTimeout(() => {
        if (touched.current) return
        if (demo === 'once') {
          if (seen('sessionStorage', DEMO_KEY)) return io.disconnect()
          markSeen('sessionStorage', DEMO_KEY)
        }
        io.disconnect()
        const base = pos.current
        play(BA.DEMO.map(([d, ms]) => [clamp(base + d), ms]), easeInOut)
      }, BA.DEMO_DELAY)
    }, { threshold: [0, BA.DEMO_VISIBLE, 1] })
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, toggle])

  useEffect(() => () => {
    stop()
    clearTimeout(press.current?.timer)
  }, [])

  // ---- pointer: geometry -------------------------------------------------------------
  const pctAt = (e) => {
    const r = frameRef.current.getBoundingClientRect()
    return vertical ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100
  }

  // ---- handle (knob + grip strip): always a drag, never reaches the parent -------------
  const onGrabDown = (e) => {
    if (e.button > 0) return
    e.stopPropagation()
    interact()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
    grab.current = { id: e.pointerId, offset: pctAt(e) - pos.current }
    setDragging(true)
  }
  const onGrabMove = (e) => {
    const g = grab.current
    if (!g || g.id !== e.pointerId) return
    e.stopPropagation()
    apply(pctAt(e) - g.offset)
  }
  const onGrabUp = (e) => {
    const g = grab.current
    if (!g || g.id !== e.pointerId) return
    e.stopPropagation()
    grab.current = null
    setDragging(false)
    goal.current = pos.current
    if (pos.current < 99.5) rest.current = pos.current
  }

  // ---- surface: tap to jump; drag when dragFrom === 'anywhere' --------------------------
  const onSurfaceDown = (e) => {
    if (e.button > 0 || grab.current) return
    stop() // a press cancels the demo
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), mode: 'pending' }
    if (dragFrom === 'anywhere') {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }
    // The parent may capture the pointer (the gallery does), so listen for the release on window.
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      const p = pointer.current
      pointer.current = null
      if (!p) return
      if (p.mode === 'drag') {
        setDragging(false)
        goal.current = pos.current
        if (pos.current < 99.5) rest.current = pos.current
        return
      }
      const moved = Math.hypot(ev.clientX - p.x, ev.clientY - p.y)
      if (ev.type !== 'pointerup' || p.mode !== 'pending' || moved >= BA.SLOP || performance.now() - p.t > BA.TAP_MS || !tapToJump) return
      if (!frameRef.current) return
      if (toggle) return toggleBefore()
      interact()
      const to = pctAt(ev)
      if (to < 99.5) rest.current = to
      animateTo(to)
    }
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
  }
  const onSurfaceMove = (e) => {
    const p = pointer.current
    if (!p || p.id !== e.pointerId || dragFrom !== 'anywhere' || toggle) return
    if (p.mode === 'pending') {
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      if (Math.hypot(dx, dy) < BA.SLOP) return
      const along = vertical ? Math.abs(dy) > Math.abs(dx) : Math.abs(dx) > Math.abs(dy)
      if (!along) {
        p.mode = 'ignore'
        return
      }
      p.mode = 'drag'
      interact()
      setDragging(true)
    }
    if (p.mode === 'drag') apply(pctAt(e))
  }

  // ---- the Before button: tap toggles, press-and-hold peeks ------------------------------
  const toggleBefore = () => {
    interact()
    if (pos.current >= 99.5) animateTo(rest.current >= 99.5 ? (toggle ? 0 : 50) : rest.current, BA.PEEK_MS)
    else {
      rest.current = pos.current
      animateTo(100, BA.PEEK_MS)
    }
  }
  const onCompareDown = (e) => {
    e.stopPropagation()
    if (e.button > 0) return
    interact()
    clearTimeout(press.current?.timer)
    const pr = { held: false, suppress: false }
    pr.timer = setTimeout(() => {
      pr.held = true
      if (pos.current < 99.5) rest.current = pos.current
      animateTo(100, BA.PEEK_MS)
    }, BA.HOLD_MS)
    press.current = pr
  }
  const onCompareUp = () => {
    const pr = press.current
    if (!pr) return
    clearTimeout(pr.timer)
    if (pr.held && !pr.suppress) {
      pr.suppress = true // the click that follows a hold doesn't toggle
      animateTo(rest.current, BA.PEEK_MS)
    }
  }
  const onCompareClick = (e) => {
    e.stopPropagation()
    const pr = press.current
    press.current = null
    if (pr?.held) return
    toggleBefore()
  }

  // ---- keyboard on the knob -----------------------------------------------------------------
  const onKey = (e) => {
    const step = e.shiftKey ? BA.STEP_FINE : BA.STEP
    const from = goal.current
    const next = {
      ArrowRight: from + step, ArrowUp: vertical ? from - step : from + step,
      ArrowLeft: from - step, ArrowDown: vertical ? from + step : from - step,
      PageUp: from + BA.PAGE, PageDown: from - BA.PAGE, Home: 0, End: 100,
    }[e.key]
    if (next === undefined) return
    e.preventDefault()
    e.stopPropagation()
    interact()
    const to = clamp(next)
    if (to < 99.5) rest.current = to
    animateTo(to, BA.KEY_MS)
  }

  // ---- render ---------------------------------------------------------------------------------
  const fit = aspect === 'fill' || aspect === 'contain' ? aspect : 'box'
  const names = typeof labels === 'object' && labels ? { before: labels.before || 'Before', after: labels.after || 'After' } : { before: 'Before', after: 'After' }
  const hintText = toggle ? `Hold ${names.before} to compare` : dragFrom === 'handle' ? 'Drag the handle to compare' : 'Drag to compare'
  const rootStyle = {
    '--ba-pos': start,
    ...(fit === 'box' ? { aspectRatio: aspect } : null),
    ...(fit === 'contain' ? { '--ba-ratio': ratio || 0.8 } : null),
    ...style,
  }
  const onAfterLoad = (e) => {
    setLoaded(true)
    const img = e.currentTarget
    if (!ratioProp && img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight)
  }

  return (
    <div
      ref={rootRef}
      className={`ba ${className}`}
      data-fit={fit}
      data-mode={toggle ? 'toggle' : 'slider'}
      data-orientation={vertical ? 'vertical' : 'horizontal'}
      data-drag={dragFrom}
      data-compact={compact ? '' : undefined}
      data-loaded={loaded ? '' : undefined}
      style={rootStyle}
    >
      <div
        ref={frameRef}
        className="ba-frame"
        onPointerDown={onSurfaceDown}
        onPointerMove={onSurfaceMove}
        onDragStart={(e) => e.preventDefault()}
      >
        <img className="ba-img ba-after" src={after} alt={alt ? `${alt}, after` : ''} loading={loading} decoding="async" draggable={false} onLoad={onAfterLoad} onError={onAfterLoad} />
        <div className="ba-before">
          <img className={`ba-img ${before ? '' : 'ba-fake'}`} src={before || after} alt={alt ? `${alt}, before` : ''} loading={loading} decoding="async" draggable={false} />
        </div>

        {labels && (
          <>
            <span className="ba-label ba-label-before" aria-hidden="true"><span>{names.before}</span></span>
            <span className="ba-label ba-label-after" aria-hidden="true"><span>{names.after}</span></span>
          </>
        )}

        {!toggle && (
          <div className="ba-handle">
            <div className="ba-line" aria-hidden="true" />
            <div className="ba-grip" aria-hidden="true" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp} />
            <div
              ref={knobRef}
              className="ba-knob"
              role="slider"
              tabIndex={0}
              aria-label={`Compare ${names.before.toLowerCase()} and ${names.after.toLowerCase()}${alt ? `: ${alt}` : ''}`}
              aria-orientation={vertical ? 'vertical' : 'horizontal'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(start)}
              aria-valuetext={valueText(start)}
              onKeyDown={onKey}
              onFocus={stop}
              onPointerDown={onGrabDown}
              onPointerMove={onGrabMove}
              onPointerUp={onGrabUp}
              onPointerCancel={onGrabUp}
            >
              <Chevrons vertical={vertical} />
            </div>
          </div>
        )}

        {compareButton && (
          <button
            type="button"
            className="ba-compare"
            aria-pressed={showingBefore}
            aria-label={`Show ${names.before.toLowerCase()}`}
            title={`Tap to toggle, hold to peek at the ${names.before.toLowerCase()} photo`}
            onPointerDown={onCompareDown}
            onPointerUp={onCompareUp}
            onPointerCancel={onCompareUp}
            onPointerLeave={onCompareUp}
            onClick={onCompareClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Eye /> <span>{names.before}</span>
          </button>
        )}

        {hintOn && <div className="ba-hint" aria-hidden="true">{hintText}</div>}
      </div>
    </div>
  )
}

export { BeforeAfter }

// "Before / After" pill for tiles, cards and chat shares.
export function BeforeAfterBadge({ className = '', label = 'Before / After' }) {
  return (
    <span className={`ba-badge ${className}`}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 2.5h4.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8z" fill="currentColor" />
      </svg>
      {label}
    </span>
  )
}

// A grid tile's picture for a before/after post: the after photo with a badge; hover (mouse) or
// press-and-hold (touch) wipes the before photo in. Not interactive itself: wrap it in the tile's link.
// aspect: optional CSS ratio; without it the thumb fills its parent.
export function BeforeAfterThumb({ before, after, alt = '', aspect = null, badge = true, loading = 'lazy', className = '' }) {
  const [peek, setPeek] = useState(false)
  const timer = useRef()
  const startPeek = (e) => {
    if (e.pointerType === 'mouse' || !before) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setPeek(true), BA.THUMB_PRESS_MS)
  }
  const endPeek = () => {
    clearTimeout(timer.current)
    setPeek(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <span
      className={`ba-thumb ${peek ? 'peek' : ''} ${className}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
      onPointerDown={startPeek}
      onPointerUp={endPeek}
      onPointerCancel={endPeek}
      onPointerLeave={endPeek}
      onContextMenu={(e) => { if (peek) e.preventDefault() }}
    >
      <img className="ba-img" src={after} alt={alt} loading={loading} decoding="async" draggable={false} />
      {before && (
        <>
          <span className="ba-thumb-before" aria-hidden="true"><img className="ba-img" src={before} alt="" loading={loading} decoding="async" draggable={false} /></span>
          <span className="ba-thumb-line" aria-hidden="true"><span /></span>
        </>
      )}
      {badge && <BeforeAfterBadge />}
    </span>
  )
}
