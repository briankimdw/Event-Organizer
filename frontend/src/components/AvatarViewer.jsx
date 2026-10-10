import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'

// Instagram-style profile photo viewer.
//
//   const viewAvatar = useAvatarViewer()
//   viewAvatar({ src, name, username, to?, from? })
//
// to:   a profile link to offer ("View profile"); leave it out on the person's own page.
// from: the element that was tapped, so the photo grows out of it (and shrinks back on close).
//
// Close: tap anywhere, swipe down, Esc, or the ✕.

const Ctx = createContext({ open: () => {}, close: () => {} })

export function AvatarViewerProvider({ children }) {
  const [person, setPerson] = useState(null)
  const { pathname } = useLocation()
  const open = useCallback((p) => {
    if (!p?.src) return
    const from = p.from?.getBoundingClientRect ? p.from.getBoundingClientRect() : null
    setPerson({ ...p, from })
  }, [])
  const close = useCallback(() => setPerson(null), [])
  // Navigating away (e.g. "View profile") closes it.
  useEffect(() => setPerson(null), [pathname])
  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      {person && <AvatarViewer person={person} onClose={close} />}
    </Ctx.Provider>
  )
}

export const useAvatarViewer = () => useContext(Ctx).open

const DISMISS = 90 // px of downward drag that closes it

function AvatarViewer({ person, onClose }) {
  const navigate = useNavigate()
  const wrap = useRef()
  const closeBtn = useRef()
  const start = useRef(null)
  const [origin, setOrigin] = useState(null) // CSS vars for the grow-from-avatar animation
  const [ready, setReady] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dy, setDy] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Measure where the photo will sit and where the tapped avatar was, before the first paint.
  useLayoutEffect(() => {
    const to = wrap.current?.getBoundingClientRect()
    const from = person.from
    if (to && from && from.width > 0) {
      setOrigin({
        '--av-x': `${from.left + from.width / 2 - (to.left + to.width / 2)}px`,
        '--av-y': `${from.top + from.height / 2 - (to.top + to.height / 2)}px`,
        '--av-s': from.width / to.width,
      })
    }
    setReady(true)
  }, [person])

  const dismiss = useCallback(() => {
    setClosing(true)
    setDy(0)
    setTimeout(onClose, 200)
  }, [onClose])

  // Esc closes; focus moves into the dialog and back to the avatar afterwards.
  useEffect(() => {
    const before = document.activeElement
    closeBtn.current?.focus({ preventScroll: true })
    // Capture phase, so Esc closes only this (not a gallery or sheet underneath).
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      dismiss()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (before?.focus && document.contains(before)) before.focus({ preventScroll: true })
    }
  }, [dismiss])

  const onDown = (e) => {
    if (closing || e.target.closest('button, a')) return
    start.current = { y: e.clientY, x: e.clientX, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    const s = start.current
    if (!s) return
    const d = e.clientY - s.y
    if (!s.moved && Math.hypot(e.clientX - s.x, d) > 6) {
      s.moved = true
      setDragging(true)
    }
    if (s.moved) setDy(d > 0 ? d : d * 0.2)
  }
  const onUp = () => {
    const s = start.current
    start.current = null
    if (!s) return
    setDragging(false)
    if (!s.moved || dy > DISMISS) return dismiss()
    setDy(0)
  }

  const pull = Math.max(0, Math.min(dy, 300))
  const name = person.name || ''
  return createPortal(
    <div
      className={`av-backdrop ${ready ? 'in' : ''} ${closing ? 'closing' : ''}`}
      style={{ '--av-fade': 1 - pull / 380 }}
      role="dialog"
      aria-modal="true"
      aria-label={name ? `${name}’s profile photo` : 'Profile photo'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button ref={closeBtn} className="av-close" onClick={dismiss} aria-label="Close">
        <X size={22} />
      </button>
      <div
        className="av-stage"
        style={{
          transform: `translateY(${dy}px) scale(${1 - pull / 1400})`,
          transition: dragging ? 'none' : 'transform .25s cubic-bezier(.2, .8, .2, 1)',
        }}
      >
        <div className="av-photo-wrap" ref={wrap}>
          <img className={`av-photo ${origin ? 'from-origin' : ''}`} style={origin || undefined} src={person.src} alt="" draggable={false} />
        </div>
        <div className="av-text">
          {name && <div className="av-name">{name}</div>}
          {person.username && <div className="av-handle">@{person.username}</div>}
          {person.to && (
            <button className="av-visit" onClick={() => navigate(person.to)}>
              View profile
            </button>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('phone') || document.body,
  )
}

// Press and hold for `ms`, without moving, calls onLong(element).
// `consumed()` is true right after a long press, so the click that follows can be ignored.
export function useLongPress(onLong, ms = 450) {
  const timer = useRef()
  const startAt = useRef(null)
  const fired = useRef(false)
  const cancel = () => {
    clearTimeout(timer.current)
    startAt.current = null
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const handlers = {
    onPointerDown: (e) => {
      if (!onLong || (e.pointerType === 'mouse' && e.button !== 0)) return
      fired.current = false
      startAt.current = { x: e.clientX, y: e.clientY }
      const el = e.currentTarget
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        fired.current = true
        startAt.current = null
        onLong(el)
      }, ms)
    },
    onPointerMove: (e) => {
      if (startAt.current && Math.hypot(e.clientX - startAt.current.x, e.clientY - startAt.current.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: onLong ? (e) => e.preventDefault() : undefined,
  }
  const consumed = () => {
    const was = fired.current
    fired.current = false
    return was
  }
  return { handlers, consumed }
}

// A big avatar that opens the viewer when tapped (on a person's own profile, or your own).
export function ViewableAvatar({ src, name, username, className = 'avatar xl' }) {
  const view = useAvatarViewer()
  const ref = useRef()
  return (
    <button
      type="button"
      className="avatar-view-btn"
      onClick={() => view({ src, name, username, from: ref.current })}
      aria-label={name ? `View ${name}’s profile photo` : 'View profile photo'}
    >
      <img ref={ref} className={className} src={src} alt="" draggable={false} />
    </button>
  )
}
