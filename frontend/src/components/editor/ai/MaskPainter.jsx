import { useEffect, useRef, useState } from 'react'
import { drawStrokes } from './aiImage.js'

const pct = (v) => `${(v * 100).toFixed(3)}%`
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const MIN_RECT = 0.03

// Paint what to erase, over the whole photo (the editor shows it uncropped while this is open).
// Strokes are in 0..1 of the image (see aiImage.js), so they also make the full-size mask.
//   mode 'brush': drag to paint. mode 'area': drag to draw a rectangle, or use the keyboard on it:
//   arrows move it (Alt: finer), Shift + arrows resize it, Enter adds it to the selection.
export default function MaskPainter({ strokes, onStroke, mode, brushSize, rect, setRect, onAddRect, describedBy }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const drag = useRef(null)
  const [live, setLiveState] = useState(null) // the stroke being drawn
  const liveRef = useRef(null)
  const setLive = (s) => { liveRef.current = s; setLiveState(s) }
  const [hover, setHover] = useState(null) // brush outline position (0..1)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrap.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Draw the selection (red) and the brush outline.
  useEffect(() => {
    const c = canvas.current
    if (!c || !size.w) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    // Paint opaque on a layer, then show it translucent, so overlapping strokes don't get darker.
    const layer = document.createElement('canvas')
    layer.width = c.width; layer.height = c.height
    drawStrokes(layer.getContext('2d'), live ? [...strokes, live] : strokes, c.width, c.height, '#ff4040')
    ctx.globalAlpha = 0.55
    ctx.drawImage(layer, 0, 0)
    ctx.globalAlpha = 1
    if (mode === 'brush' && hover) {
      const r = (brushSize * Math.max(c.width, c.height)) / 2
      ctx.lineWidth = 1.5 * dpr
      ctx.strokeStyle = 'rgba(0,0,0,.6)'
      ctx.beginPath(); ctx.arc(hover[0] * c.width, hover[1] * c.height, r + dpr, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = '#fff'
      ctx.beginPath(); ctx.arc(hover[0] * c.width, hover[1] * c.height, r, 0, Math.PI * 2); ctx.stroke()
    }
  }, [strokes, live, hover, size, mode, brushSize])

  const at = (e) => {
    const r = wrap.current.getBoundingClientRect()
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]
  }

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = at(e)
    if (mode === 'brush') {
      drag.current = { id: e.pointerId }
      setLive({ kind: 'brush', size: brushSize, points: [p] })
    } else {
      drag.current = { id: e.pointerId, from: p }
      setRect({ x: p[0], y: p[1], w: 0, h: 0 })
    }
  }
  const move = (e) => {
    const p = at(e)
    if (mode === 'brush' && e.pointerType !== 'touch') setHover(p)
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (mode === 'brush') { if (liveRef.current) setLive({ ...liveRef.current, points: [...liveRef.current.points, p] }) }
    else {
      const [x0, y0] = d.from
      setRect({ x: Math.min(x0, p[0]), y: Math.min(y0, p[1]), w: Math.abs(p[0] - x0), h: Math.abs(p[1] - y0) })
    }
  }
  const up = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (mode === 'brush') {
      const s = liveRef.current
      setLive(null)
      if (s) onStroke(s)
    } else if (rect && (rect.w < MIN_RECT || rect.h < MIN_RECT)) {
      setRect((r) => (r ? { ...r, w: Math.max(r.w, MIN_RECT * 3), h: Math.max(r.h, MIN_RECT * 3) } : r))
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAddRect(); return }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const d = dirs[e.key]
    if (!d || !rect) return
    e.preventDefault()
    const step = e.altKey ? 0.005 : 0.025
    setRect((r) => {
      if (e.shiftKey) {
        const w = Math.min(1 - r.x, Math.max(MIN_RECT, r.w + d[0] * step))
        const h = Math.min(1 - r.y, Math.max(MIN_RECT, r.h + d[1] * step))
        return { ...r, w, h }
      }
      return { ...r, x: Math.min(1 - r.w, Math.max(0, r.x + d[0] * step)), y: Math.min(1 - r.h, Math.max(0, r.y + d[1] * step)) }
    })
  }

  const wPct = rect ? Math.round(rect.w * 100) : 0
  const hPct = rect ? Math.round(rect.h * 100) : 0
  return (
    <div
      className={`pe-mask ${mode}`} ref={wrap}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvas} className="pe-mask-canvas" aria-hidden="true" />
      {mode === 'area' && rect && (
        <div
          className="pe-mask-rect" style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
          tabIndex={0} role="group" aria-roledescription="selection area"
          aria-label={`Area to erase, ${wPct}% wide and ${hPct}% tall, at ${Math.round(rect.x * 100)}% from the left and ${Math.round(rect.y * 100)}% from the top`}
          aria-describedby={describedBy} onKeyDown={onKey}
        />
      )}
    </div>
  )
}
