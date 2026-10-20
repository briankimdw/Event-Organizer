// Painting the Erase mask over the photo.
//   brush: drag a finger (Skia paths, react-native-gesture-handler Pan), shown in translucent red
//   areas: a 3×3 grid of buttons over the photo; tap to mark / unmark a region. This is the
//          alternative for VoiceOver / TalkBack users (each cell is a labelled toggle) and for
//          anyone who finds painting fiddly.
// Lives inside the photo area (absolute fill), so gesture coordinates are area coordinates.
import { Canvas, Group, Paint, Path, Rect } from '@shopify/react-native-skia'
import { memo, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

import { Text } from '@/components'
import type { Frame } from '../pipeline'
import { AREAS, brushPath, type Stroke } from './mask'

export const MASK_COLOR = '#ff3b30'

type Props = {
  frame: Frame
  strokes: Stroke[]
  mode: 'brush' | 'area'
  /** Brush diameter in points on screen. */
  brushSize: number
  onStroke: (s: Stroke) => void
  onToggleArea: (id: string) => void
  disabled?: boolean
}

export const MaskLayer = memo(function MaskLayer({ frame, strokes, mode, brushSize, onStroke, onToggleArea, disabled }: Props) {
  const [live, setLive] = useState<number[] | null>(null)
  const liveRef = useRef<number[] | null>(null)
  const r = brushSize / 2 / frame.w

  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .enabled(mode === 'brush' && !disabled)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      const pts = [(e.x - frame.x) / frame.w, (e.y - frame.y) / frame.h]
      liveRef.current = pts
      setLive(pts)
    })
    .onUpdate((e) => {
      const pts = liveRef.current
      if (!pts) return
      const x = (e.x - frame.x) / frame.w, y = (e.y - frame.y) / frame.h
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1]
      // Skip points closer than ~1.5pt: smaller paths, same look.
      if (Math.hypot((x - lx) * frame.w, (y - ly) * frame.h) < 1.5) return
      const next = [...pts, x, y]
      liveRef.current = next
      setLive(next)
    })
    .onFinalize(() => {
      const pts = liveRef.current
      liveRef.current = null
      setLive(null)
      if (pts && pts.length >= 2) onStroke({ kind: 'brush', pts, r })
    }), [mode, disabled, frame, r, onStroke])

  // Paths of the finished strokes are built once; only the stroke being drawn changes per move.
  const drawn = useMemo(() => strokes.map((s, i) => draw(s, i, frame)), [strokes, frame])
  const current = live ? draw({ kind: 'brush', pts: live, r }, -1, frame) : null
  const selected = new Set(strokes.filter((s) => s.kind === 'area').map((s) => (s as { id: string }).id))

  return (
    <GestureDetector gesture={pan}>
      <View style={StyleSheet.absoluteFill} testID="ai-mask-layer">
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Group transform={[{ translateX: frame.x }, { translateY: frame.y }]} clip={{ x: 0, y: 0, width: frame.w, height: frame.h }}
            layer={<Paint opacity={0.5} />}>
            {drawn}
            {current}
          </Group>
        </Canvas>
        {mode === 'area' ? (
          <View style={[s.grid, { left: frame.x, top: frame.y, width: frame.w, height: frame.h }]} accessibilityLabel="Areas of the photo to erase">
            {AREAS.map((a) => {
              const on = selected.has(a.id)
              return (
                <Pressable
                  key={a.id}
                  disabled={disabled}
                  onPress={() => onToggleArea(a.id)}
                  style={[s.cell, { width: frame.w / 3, height: frame.h / 3 }, on && s.cellOn]}
                  accessibilityRole="togglebutton"
                  accessibilityLabel={`${a.label} area`}
                  accessibilityState={{ checked: on, disabled: !!disabled }}
                  accessibilityHint={on ? 'Marked to erase. Double-tap to unmark.' : 'Double-tap to mark this area to erase.'}
                >
                  {on ? <Text variant="tiny" weight="700" style={s.cellText}>Erase</Text> : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
})

function draw(st: Stroke, i: number, frame: Frame) {
  return st.kind === 'area'
    ? <Rect key={i} x={st.x * frame.w} y={st.y * frame.h} width={st.w * frame.w} height={st.h * frame.h} color={MASK_COLOR} />
    : <Path key={i} path={brushPath(st, frame.w, frame.h)} style="stroke" strokeWidth={Math.max(1, st.r * 2 * frame.w)} strokeCap="round" strokeJoin="round" color={MASK_COLOR} />
}

const s = StyleSheet.create({
  grid: { position: 'absolute', flexDirection: 'row', flexWrap: 'wrap' },
  cell: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderColor: '#fff', borderWidth: 2 },
  cellText: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
})
