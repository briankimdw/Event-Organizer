// One adjustment slider (Lightroom-style): label + value on top, a thin track under it.
//   <EditSlider label="Exposure" min={-100} max={100} value={v} defaultValue={0}
//     onChange={(v) => preview(v)} onCommit={(v) => commit(v)} />
// - Dragging is relative (the thumb follows the finger's movement, not its position), so
//   small changes are easy; it runs on the UI thread (gesture-handler + reanimated).
// - A light haptic tick and a small detent when the value passes its default (zero / center).
// - Double-tap the slider to reset it to the default.
// - Screen readers: an "adjustable" element (swipe up / down = +/- one step), with the value
//   read out, plus a "Reset" custom action.
import * as Haptics from 'expo-haptics'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Platform, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'

import { Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'

export type EditSliderProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue?: number
  /** Live value while dragging (throttle / preview in the parent). */
  onChange: (v: number) => void
  /** The gesture ended (or a step / reset happened): push it to history. */
  onCommit: (v: number) => void
  /** How the value is shown and read (default: signed integer, "+12"). */
  format?: (v: number) => string
  disabled?: boolean
  /** Track gradient hint (e.g. temperature blue -> yellow); two colors. */
  gradient?: [string, string]
}

const TRACK_H = 3
const THUMB = 22
const ROW_H = 54 // whole slider row is the touch target

const defaultFormat = (v: number) => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)

function tick() {
  if (Platform.OS === 'web') return
  Haptics.selectionAsync().catch(() => {})
}

export const EditSlider = memo(function EditSlider({
  label, value, min, max, step = 1, defaultValue = 0, onChange, onCommit, format = defaultFormat, disabled, gradient,
}: EditSliderProps) {
  const s = useStyles()
  const { c } = useTheme()
  const width = useSharedValue(0)
  const v = useSharedValue(value)
  const start = useSharedValue(value)
  const range = max - min

  // External changes (undo, preset, reset all) move the thumb.
  useEffect(() => {
    v.value = value
  }, [value, v])

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width
  }, [width])

  // Stable callbacks (the gesture objects must not be re-created mid-drag when the parent re-renders).
  const cb = useRef({ onChange, onCommit })
  cb.current = { onChange, onCommit }
  const emit = useCallback((n: number) => cb.current.onChange(n), [])
  const commit = useCallback((n: number) => cb.current.onCommit(n), [])

  const pan = useMemo(() => Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.value = v.value
    })
    .onUpdate((e) => {
      'worklet'
      const w = Math.max(1, width.value - THUMB)
      // Full track width = the full range; precise enough on a phone, and relative.
      let n = start.value + (e.translationX / w) * range
      n = Math.min(max, Math.max(min, n))
      n = Math.round(n / step) * step
      // Detent: within ~1.5% of the range around the default it sticks to the default.
      if (Math.abs(n - defaultValue) < range * 0.015) n = defaultValue
      const prev = v.value
      if (n === prev) return
      // Tick when landing on the default or jumping across it (not when leaving it).
      const crossed = n === defaultValue || (prev !== defaultValue && Math.sign(prev - defaultValue) !== Math.sign(n - defaultValue))
      v.value = n
      if (crossed) runOnJS(tick)()
      runOnJS(emit)(n)
    })
    .onEnd(() => {
      runOnJS(commit)(v.value)
    }), [disabled, start, v, width, range, max, min, step, defaultValue, emit, commit])

  const reset = useCallback(() => {
    tick()
    v.value = defaultValue
    cb.current.onChange(defaultValue)
    cb.current.onCommit(defaultValue)
  }, [defaultValue, v])

  const doubleTap = useMemo(() => Gesture.Tap().enabled(!disabled).numberOfTaps(2).onEnd(() => runOnJS(reset)()), [disabled, reset])
  const gesture = useMemo(() => Gesture.Race(pan, doubleTap), [pan, doubleTap])

  const thumbStyle = useAnimatedStyle(() => {
    const w = Math.max(0, width.value - THUMB)
    return { transform: [{ translateX: ((v.value - min) / range) * w }] }
  })
  // The filled part runs from the default (center for -100..100) to the value.
  const fillStyle = useAnimatedStyle(() => {
    const w = Math.max(0, width.value - THUMB)
    const a = ((defaultValue - min) / range) * w
    const b = ((v.value - min) / range) * w
    return { left: THUMB / 2 + Math.min(a, b), width: Math.abs(b - a) }
  })

  const onA11y = useCallback((e: AccessibilityActionEvent) => {
    const big = Math.max(step, Math.round(range / 40 / step) * step) // 5 per swipe on -100..100
    let n = value
    if (e.nativeEvent.actionName === 'increment') n = Math.min(max, value + big)
    else if (e.nativeEvent.actionName === 'decrement') n = Math.max(min, value - big)
    else if (e.nativeEvent.actionName === 'reset' || e.nativeEvent.actionName === 'activate') n = defaultValue
    if (n === value) return
    onChange(n)
    onCommit(n)
  }, [value, step, range, max, min, defaultValue, onChange, onCommit])

  const changed = value !== defaultValue
  const shown = format(value)

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[s.row, disabled && { opacity: 0.4 }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: Math.round(value), text: shown }}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuetext={shown}
        accessibilityHint="Swipe up or down to adjust. Double-tap to reset."
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate', label: 'Reset' }, { name: 'reset', label: 'Reset to default' }]}
        onAccessibilityAction={onA11y}
        accessibilityState={{ disabled: !!disabled }}
      >
        <View style={s.head} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text variant="small" weight={changed ? '700' : '500'} style={{ color: c.ink }} maxFontSizeMultiplier={1.4}>{label}</Text>
          <Text variant="small" weight="600" style={[s.value, { color: changed ? c.ink : c.faint }]} maxFontSizeMultiplier={1.4}>{shown}</Text>
        </View>
        <View style={s.trackWrap} onLayout={onLayout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {gradient ? (
            <View style={[s.track, { flexDirection: 'row', overflow: 'hidden' }]}>
              <View style={{ flex: 1, backgroundColor: gradient[0] }} />
              <View style={{ flex: 1, backgroundColor: gradient[1] }} />
            </View>
          ) : <View style={s.track} />}
          <Animated.View style={[s.fill, fillStyle]} />
          <View style={s.zeroLane} pointerEvents="none">
            <View style={[s.zero, { left: `${((defaultValue - min) / range) * 100}%` }]} />
          </View>
          <Animated.View style={[s.thumb, thumbStyle]} />
        </View>
      </View>
    </GestureDetector>
  )
})

const useStyles = makeStyles((t) => ({
  row: { height: ROW_H, justifyContent: 'center', paddingHorizontal: t.space.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  value: { fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
  trackWrap: { height: THUMB, justifyContent: 'center' },
  track: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: TRACK_H, borderRadius: TRACK_H, backgroundColor: t.c.line },
  fill: { position: 'absolute', height: TRACK_H, borderRadius: TRACK_H, backgroundColor: t.c.ink },
  zeroLane: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 9 },
  zero: { position: 'absolute', width: 2, height: 9, marginLeft: -1, borderRadius: 1, backgroundColor: t.c.faint },
  thumb: {
    position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: t.c.bg,
    borderWidth: 2, borderColor: t.c.ink,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
}))
