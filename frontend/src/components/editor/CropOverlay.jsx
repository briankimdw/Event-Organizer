import { useRef } from 'react'
import { moveCrop, resizeCrop } from '../../lib/editor/geometry.js'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const pct = (v) => `${(v * 100).toFixed(3)}%`

// The crop box over the whole straightened frame (the canvas shows the frame in 'crop' mode,
// so frame-normalized units = fractions of this overlay's size).
// Drag inside to move, drag a handle to resize (keeps the aspect unless it's free).
// Keyboard: arrows move the box by 1% (Alt: 0.2%); Shift + arrows resize it from the bottom-right corner.
export default function CropOverlay({ crop, ratio, frameW, frameH, straighten, onChange, onCommit, describedBy }) {
  const box = useRef(null)
  const drag = useRef(null)

  const start = (e, handle) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = box.current.getBoundingClientRect()
    drag.current = { handle, x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, crop, id: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = (e.clientX - d.x) / d.w
    const dy = (e.clientY - d.y) / d.h
    onChange(d.handle === 'move'
      ? moveCrop(d.crop, dx, dy, frameW, frameH, straighten)
      : resizeCrop(d.crop, d.handle, dx, dy, ratio, frameW, frameH, straighten))
  }
  const end = (e) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    onCommit()
  }

  const onKey = (e) => {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const d = dirs[e.key]
    if (!d) return
    e.preventDefault()
    const step = e.altKey ? 0.002 : 0.01
    const next = e.shiftKey
      ? resizeCrop(crop, ratio ? 'se' : d[0] ? 'e' : 's', d[0] * step, d[1] * step, ratio, frameW, frameH, straighten)
      : moveCrop(crop, d[0] * step, d[1] * step, frameW, frameH, straighten)
    onChange(next)
    onCommit()
  }

  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end }
  const wPct = Math.round(crop.w * 100), hPct = Math.round(crop.h * 100)
  return (
    <div className="pe-crop" ref={box}>
      <div
        className="pe-crop-box" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
        tabIndex={0} role="group" aria-roledescription="crop area"
        aria-label={`Crop area, ${wPct}% wide and ${hPct}% tall`} aria-describedby={describedBy}
        onKeyDown={onKey} onPointerDown={(e) => start(e, 'move')} {...handlers}
      >
        <span className="pe-crop-grid" aria-hidden="true" />
        {HANDLES.map((h) => (
          <span key={h} className={`pe-crop-h pe-crop-h-${h}`} aria-hidden="true" onPointerDown={(e) => start(e, h)} {...handlers} />
        ))}
      </div>
    </div>
  )
}
