// The crop box drawn over the whole (straightened) photo in the Crop tool.
//   - drag a corner / edge handle to resize (keeps the aspect when one is chosen)
//   - drag inside the box to move it
//   - pinch anywhere on the photo to make the box smaller / bigger
// Every change goes through the shared geometry.js (resizeCrop / moveCrop / constrain), so the
// box can never leave the picture or show an empty corner of a straightened photo. Gesture
// callbacks run on the JS thread (runOnJS(true)): the math is shared plain JS, and only the
// box moves while dragging (the photo underneath doesn't re-render).
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import { constrain, moveCrop, resizeCrop, type Crop } from './contract'
import type { Frame } from './pipeline'

type Props = {
  /** Where the whole straightened frame is drawn, in the overlay's coordinates. */
  frame: Frame
  crop: Crop
  /** Oriented frame size in pixels (for the shared constraints). */
  frameW: number
  frameH: number
  straighten: number
  /** Locked aspect (pixel width / height) or null for free. */
  ratio: number | null
  onChange: (c: Crop) => void
  onCommit: (c: Crop) => void
  children?: ReactNode
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]
const TOUCH = 44
const MIN_SCREEN = 48 // the box never gets smaller than this on screen (handles stay usable)

const scaleAbout = (c: Crop, s: number): Crop => {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2
  return { x: cx - (c.w * s) / 2, y: cy - (c.h * s) / 2, w: c.w * s, h: c.h * s }
}

export function CropOverlay({ frame, crop, frameW, frameH, straighten, ratio, onChange, onCommit, children }: Props) {
  const [active, setActive] = useState(false)
  // Latest values for the gesture callbacks (created once per frame/geometry change).
  const live = useRef({ crop, base: crop, onChange, onCommit })
  useLayoutEffect(() => {
    live.current.crop = crop
    live.current.onChange = onChange
    live.current.onCommit = onCommit
  })

  const minW = MIN_SCREEN / Math.max(1, frame.w)
  const minH = MIN_SCREEN / Math.max(1, frame.h)
  const tooSmall = (c: Crop) => c.w < minW || c.h < minH

  const begin = () => {
    live.current.base = live.current.crop
    setActive(true)
  }
  const end = () => {
    setActive(false)
    live.current.onCommit(live.current.crop)
  }
  const emit = (c: Crop) => {
    if (tooSmall(c) && !tooSmall(live.current.base)) return
    live.current.crop = c
    live.current.onChange(c)
  }

  const handleGesture = (h: Handle) => Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(begin)
    .onUpdate((e) => emit(resizeCrop(live.current.base, h, e.translationX / frame.w, e.translationY / frame.h, ratio, frameW, frameH, straighten)))
    .onFinalize(end)

  // The ref reads below happen in gesture callbacks (on touch events), not during render.
  /* eslint-disable react-hooks/refs */
  const gestures = useMemo(() => {
    const handles = Object.fromEntries(HANDLES.map((h) => [h, handleGesture(h)])) as Record<Handle, ReturnType<typeof handleGesture>>
    const move = Gesture.Pan()
      .runOnJS(true)
      .onBegin(begin)
      .onUpdate((e) => emit(moveCrop(live.current.base, e.translationX / frame.w, e.translationY / frame.h, frameW, frameH, straighten)))
      .onFinalize(end)
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(begin)
      .onUpdate((e) => {
        const base = live.current.base
        const target = 1 / Math.max(0.2, e.scale) // fingers apart = tighter crop
        emit(constrain(base, (t) => scaleAbout(base, 1 + (target - 1) * t), frameW, frameH, straighten))
      })
      .onFinalize(end)
    return { handles, move, pinch }
  }, [frame.w, frame.h, frameW, frameH, straighten, ratio]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/refs */

  const box = { left: frame.x + crop.x * frame.w, top: frame.y + crop.y * frame.h, width: crop.w * frame.w, height: crop.h * frame.h }

  return (
    <GestureDetector gesture={gestures.pinch}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {children}
        {/* Dim everything outside the box. */}
        <View pointerEvents="none" style={[st.shade, { left: 0, right: 0, top: 0, height: Math.max(0, box.top) }]} />
        <View pointerEvents="none" style={[st.shade, { left: 0, right: 0, top: box.top + box.height, bottom: 0 }]} />
        <View pointerEvents="none" style={[st.shade, { left: 0, width: Math.max(0, box.left), top: box.top, height: box.height }]} />
        <View pointerEvents="none" style={[st.shade, { left: box.left + box.width, right: 0, top: box.top, height: box.height }]} />

        <GestureDetector gesture={gestures.move}>
          <View
            style={[st.box, box]}
            accessible
            accessibilityLabel="Crop area"
            accessibilityHint="Drag to move. Use the aspect buttons below to change its shape."
          >
            {/* Rule of thirds while adjusting; a faint frame otherwise. */}
            {active ? (
              <>
                <View pointerEvents="none" style={[st.gridV, { left: '33.33%' }]} />
                <View pointerEvents="none" style={[st.gridV, { left: '66.66%' }]} />
                <View pointerEvents="none" style={[st.gridH, { top: '33.33%' }]} />
                <View pointerEvents="none" style={[st.gridH, { top: '66.66%' }]} />
              </>
            ) : null}
          </View>
        </GestureDetector>

        {HANDLES.map((h) => {
          const x = box.left + (h.includes('w') ? 0 : h.includes('e') ? box.width : box.width / 2)
          const y = box.top + (h.includes('n') ? 0 : h.includes('s') ? box.height : box.height / 2)
          const corner = h.length === 2
          return (
            <GestureDetector key={h} gesture={gestures.handles[h]}>
              <View
                style={[st.touch, { left: x - TOUCH / 2, top: y - TOUCH / 2 }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                hitSlop={4}
              >
                {corner ? <CornerMark h={h} /> : <EdgeMark vertical={h === 'e' || h === 'w'} />}
              </View>
            </GestureDetector>
          )
        })}
      </View>
    </GestureDetector>
  )
}

const ARM = 18
const THICK = 3
function CornerMark({ h }: { h: string }) {
  // An L just outside the box corner (the touch area is centred on the corner).
  const top = h.includes('n'), left = h.includes('w')
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: left ? TOUCH / 2 - THICK : TOUCH / 2 - ARM + THICK, top: top ? TOUCH / 2 - THICK : TOUCH / 2 - ARM + THICK, width: ARM, height: ARM }}>
      <View style={[st.mark, { left: 0, width: ARM, height: THICK, top: top ? 0 : ARM - THICK }]} />
      <View style={[st.mark, { top: 0, height: ARM, width: THICK, left: left ? 0 : ARM - THICK }]} />
    </View>
  )
}
function EdgeMark({ vertical }: { vertical: boolean }) {
  return <View pointerEvents="none" style={[st.mark, vertical ? { width: THICK, height: 20, left: TOUCH / 2 - THICK / 2, top: TOUCH / 2 - 10 } : { height: THICK, width: 20, top: TOUCH / 2 - THICK / 2, left: TOUCH / 2 - 10 }]} />
}

const st = StyleSheet.create({
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  box: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.6)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.6)' },
  touch: { position: 'absolute', width: TOUCH, height: TOUCH },
  mark: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 1 },
})
