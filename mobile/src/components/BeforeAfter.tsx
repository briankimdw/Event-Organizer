// Before / after comparison slider: the native twin of the web's
// frontend/src/components/beforeafter/BeforeAfter.jsx, following its INTERACTION SPEC (same
// numbers and strings; BA below mirrors the web's BA).
//
//   <BeforeAfter before={uri} after={uri} accessibilityLabel={title} />   drag, tap to jump
//   <BeforeAfter before after aspectRatio={4 / 5} demo hint />            sweeps once, "Drag to compare"
//   <BeforeAfter before after interactive={false} position={sv} />        driven from outside (Discover cards)
//
// Spec:
// - position = share of the frame showing BEFORE from the left edge (0..1; the web's p / 100).
//   The after photo fills the frame; the before is revealed on [0, p]. Same fit and centre for
//   both, so same-size photos line up pixel for pixel.
// - Drag anywhere (or the 40px knob) along the slider: follows the finger 1:1. The pan only claims
//   horizontal drags (activeOffsetX ±8, failOffsetY ±8), so a vertical pager (AlbumViewer) or a
//   ScrollView keeps its vertical swipes.
// - Tap (< 400ms, < 8px): the handle eases there (260ms, ease-out cubic).
// - Labels "BEFORE" (top left) and "AFTER" (top right) pills; each fades out as its side shrinks
//   from 16% to 4%; both fade out (150ms) while dragging.
// - Screen readers: one element, accessibilityRole="adjustable" with increment / decrement
//   (5% steps, like the web's arrow keys), label "Compare before and after: <alt>", value text
//   "Showing 60% after, 40% before" / "Showing after only" / "Showing before only". On the web
//   target the same element takes arrows ±5 (Shift ±1), Page Up / Down ±25, Home / End.
// - Hold-to-compare alternative (no dragging needed): the "Before" button. Press and hold
//   (250ms) to peek at the before photo until release; a tap toggles before-only (180ms) and back.
// - demo: when first shown and untouched for 400ms: 50 -> 72 -> 28 -> 50 over 1800ms (legs of
//   450 / 900 / 450ms, ease-in-out), relative to `initial`. Any touch cancels it. Skipped with
//   Reduce Motion, which also makes every eased move instant.
// - hint: "Drag to compare" pill (bottom centre) until the first interaction.
// - interactive={false}: no gestures, no button; pass `position` (a shared value) to drive it.
import { Image, type ImageContentFit } from 'expo-image'
import { Eye } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated'

import { useReduceMotion } from '@/lib/a11y'
import { Text } from './Text'

export const BA = { STEP: 0.05, STEP_FINE: 0.01, PAGE: 0.25, SLOP: 8, TAP_MS: 400, HOLD_MS: 250, JUMP_MS: 260, KEY_MS: 120, PEEK_MS: 180, DEMO_DELAY: 400 }

type Props = {
  before?: string | null
  after?: string | null
  /** width / height of the frame. Omit to fill the parent. */
  aspectRatio?: number
  contentFit?: ImageContentFit
  /** 0..1, how much of the width shows "before" at first. */
  initial?: number
  labels?: boolean | { before: string; after: string }
  demo?: boolean
  hint?: boolean
  interactive?: boolean
  /** Drive the divider from outside (0..1). */
  position?: SharedValue<number>
  /** The hold / tap "Before" button (interactive only). */
  toggle?: boolean
  /** What the photos show (the post title), for screen readers. */
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  onInteract?: () => void
  rounded?: number
  /** Keep the labels / button clear of overlays (a viewer's top bar and caption panel). */
  insets?: { top?: number; bottom?: number }
}

const clamp = (v: number) => {
  'worklet'
  return Math.min(1, Math.max(0, v))
}
const HANDLE = 40

export const baValueText = (pct: number) =>
  pct <= 0 ? 'Showing after only' : pct >= 100 ? 'Showing before only' : `Showing ${100 - pct}% after, ${pct}% before`

export function BeforeAfter({
  before, after, aspectRatio, contentFit = 'cover', initial = 0.5, labels = true, demo, hint, interactive = true, position, toggle = true,
  accessibilityLabel, style, onInteract, rounded, insets,
}: Props) {
  const reduceMotion = useReduceMotion()
  const own = useSharedValue(clamp(initial))
  const pos = position ?? own
  const width = useSharedValue(0)
  const dragging = useSharedValue(0)
  const touched = useSharedValue(false)
  const [w, setW] = useState(0)
  const [pct, setPct] = useState(Math.round(clamp(initial) * 100))
  const [shown, setShown] = useState(false) // the button keeps "before only" shown
  const [hinted, setHinted] = useState(false)
  const resting = useRef(clamp(initial))
  const pressedAt = useRef(0)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const top = { top: 10 + (insets?.top ?? 0) }
  const bottom = 12 + (insets?.bottom ?? 0)

  // The screen-reader value follows in 1% steps (not every frame).
  useAnimatedReaction(
    () => Math.round(pos.value * 100),
    (now, prev) => {
      if (now !== prev) runOnJS(setPct)(now)
    },
  )

  const animateTo = (v: number, ms: number = BA.JUMP_MS) => {
    'worklet'
    pos.value = reduceMotion ? clamp(v) : withTiming(clamp(v), { duration: ms, easing: Easing.out(Easing.cubic) })
  }

  // One demo sweep once it has a size; any touch cancels it.
  useEffect(() => {
    if (!demo || !interactive || reduceMotion || !w) return
    const t = setTimeout(() => {
      if (touched.value) return
      const start = pos.value
      const io = { easing: Easing.inOut(Easing.cubic) }
      pos.value = withSequence(
        withTiming(clamp(start + 0.22), { duration: 450, ...io }),
        withTiming(clamp(start - 0.22), { duration: 900, ...io }),
        withTiming(start, { duration: 450, ...io }),
      )
    }, BA.DEMO_DELAY)
    return () => clearTimeout(t)
  }, [demo, interactive, reduceMotion, w]) // eslint-disable-line react-hooks/exhaustive-deps

  const notify = () => {
    onInteract?.()
    setHinted(true)
    if (shown) setShown(false)
  }

  const pan = Gesture.Pan()
    .enabled(interactive)
    .activeOffsetX([-BA.SLOP, BA.SLOP])
    .failOffsetY([-BA.SLOP, BA.SLOP])
    .onBegin(() => {
      touched.value = true
      cancelAnimation(pos)
    })
    .onStart(() => {
      dragging.value = withTiming(1, { duration: 150 })
    })
    .onUpdate((e) => {
      if (width.value > 0) pos.value = clamp(e.x / width.value)
    })
    .onEnd(() => {
      runOnJS(notify)()
    })
    .onFinalize(() => {
      dragging.value = withTiming(0, { duration: 150 })
    })
  const tap = Gesture.Tap()
    .enabled(interactive)
    .maxDistance(BA.SLOP)
    .maxDuration(BA.TAP_MS)
    .onEnd((e) => {
      touched.value = true
      if (width.value > 0) animateTo(e.x / width.value)
      runOnJS(notify)()
    })
  const gesture = Gesture.Exclusive(pan, tap)

  const beforeClip = useAnimatedStyle(() => ({ width: pos.value * width.value }))
  const divider = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * width.value }],
    opacity: interactive || (pos.value > 0.001 && pos.value < 0.999) ? 1 : 0,
  }))
  const beforeLabel = useAnimatedStyle(() => ({ opacity: interpolate(pos.value, [0.04, 0.16], [0, 1], 'clamp') * (1 - dragging.value) }))
  const afterLabel = useAnimatedStyle(() => ({ opacity: interpolate(pos.value, [0.84, 0.96], [1, 0], 'clamp') * (1 - dragging.value) }))

  const names = typeof labels === 'object' ? labels : { before: 'BEFORE', after: 'AFTER' }
  const step = (delta: number, ms: number = BA.KEY_MS) => {
    touched.value = true
    animateTo(pos.value + delta, ms)
    notify()
  }

  // The "Before" button: a tap toggles before-only and back; holding peeks until release.
  const pressIn = () => {
    touched.value = true
    cancelAnimation(pos)
    pressedAt.current = Date.now()
    if (!shown) resting.current = pos.value
    holdTimer.current = setTimeout(() => animateTo(1, BA.PEEK_MS), BA.HOLD_MS)
  }
  const pressOut = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    const quick = Date.now() - pressedAt.current < BA.HOLD_MS
    if (quick) {
      const next = !shown
      setShown(next)
      animateTo(next ? 1 : resting.current, BA.PEEK_MS)
    } else {
      setShown(false)
      animateTo(resting.current, BA.PEEK_MS)
    }
    onInteract?.()
    setHinted(true)
  }

  const onKeyDown = (e: any) => {
    const k = e?.nativeEvent?.key ?? e?.key
    const st = e?.nativeEvent?.shiftKey || e?.shiftKey ? BA.STEP_FINE : BA.STEP
    const map: Record<string, number> = { ArrowLeft: -st, ArrowDown: -st, ArrowRight: st, ArrowUp: st, PageDown: -BA.PAGE, PageUp: BA.PAGE }
    if (k in map) step(map[k])
    else if (k === 'Home') step(-1)
    else if (k === 'End') step(1)
    else return
    e.preventDefault?.()
    e.stopPropagation?.()
  }

  const valueText = baValueText(pct)
  const a11yLabel = `Compare before and after${accessibilityLabel ? `: ${accessibilityLabel}` : ''}`
  const frame = [s.frame, aspectRatio ? { aspectRatio } : s.fill, rounded ? { borderRadius: rounded } : null, style]

  const body = (
    <Animated.View
      style={frame}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width
        setW(e.nativeEvent.layout.width)
      }}
      accessible
      accessibilityRole={interactive ? 'adjustable' : 'image'}
      accessibilityLabel={interactive ? a11yLabel : `${accessibilityLabel ? `${accessibilityLabel}, ` : ''}before and after`}
      accessibilityValue={interactive ? { min: 0, max: 100, now: pct, text: valueText } : undefined}
      accessibilityActions={interactive ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') step(BA.STEP)
        else if (e.nativeEvent.actionName === 'decrement') step(-BA.STEP)
      }}
      {...(Platform.OS === 'web' && interactive ? ({ focusable: true, onKeyDown, 'aria-valuetext': valueText, 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 } as object) : null)}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image source={after ? { uri: after } : undefined} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={120} cachePolicy="memory-disk" />
      </View>
      <Animated.View style={[s.clip, beforeClip]} pointerEvents="none">
        <Image source={before ? { uri: before } : undefined} style={[s.beforeImg, { width: w || '100%' }]} contentFit={contentFit} transition={120} cachePolicy="memory-disk" />
      </Animated.View>
      <Animated.View style={[s.divider, divider]} pointerEvents="none">
        <View style={s.line} />
        {interactive && (
          <View style={s.handle}>
            <Text style={s.handleText} maxFontSizeMultiplier={1}>‹ ›</Text>
          </View>
        )}
      </Animated.View>
      {!!labels && (
        <>
          <Animated.View style={[s.label, s.labelLeft, top, beforeLabel]} pointerEvents="none">
            <Text variant="caption" weight="700" style={s.labelText} maxFontSizeMultiplier={1.3}>{names.before}</Text>
          </Animated.View>
          <Animated.View style={[s.label, s.labelRight, top, afterLabel]} pointerEvents="none">
            <Text variant="caption" weight="700" style={s.labelText} maxFontSizeMultiplier={1.3}>{names.after}</Text>
          </Animated.View>
        </>
      )}
    </Animated.View>
  )

  return (
    <View style={aspectRatio ? undefined : s.fill}>
      {interactive ? <GestureDetector gesture={gesture}>{body}</GestureDetector> : body}
      {interactive && hint && !hinted && (
        <View style={[s.hintPill, { bottom: bottom + (toggle ? 46 : 0) }]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text variant="tiny" weight="600" style={s.labelText} maxFontSizeMultiplier={1.3}>Drag to compare</Text>
        </View>
      )}
      {interactive && toggle && (
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={({ pressed }) => [s.toggle, { bottom }, (pressed || shown) && s.toggleOn]}
          hitSlop={8}
          accessibilityRole="togglebutton"
          accessibilityLabel="Before"
          accessibilityHint="Shows the before photo only. Press and hold to peek."
          accessibilityState={{ checked: shown }}
        >
          <Eye size={14} color={shown ? '#111' : '#fff'} />
          <Text variant="tiny" weight="700" style={{ color: shown ? '#111' : '#fff' }} maxFontSizeMultiplier={1.3}>Before</Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * A grid tile / card photo of a before & after: the after photo + the badge. While `peek` is on
 * (the tile is pressed and held: 160ms, see BA_THUMB_PRESS_MS), the before photo wipes in to 50%
 * (450ms), then sways 30% <-> 70% (3s loop); Reduce Motion: straight to 50%, no sway.
 */
export const BA_THUMB_PRESS_MS = 160
export function BeforeAfterThumb({ before, after, peek, style, badge = true, compact }: {
  before?: string | null; after?: string | null; peek?: boolean; style?: StyleProp<ViewStyle>; badge?: boolean; compact?: boolean
}) {
  const reduceMotion = useReduceMotion()
  const p = useSharedValue(0)
  useEffect(() => {
    if (!peek) {
      p.value = reduceMotion ? 0 : withTiming(0, { duration: 250 })
      return
    }
    if (reduceMotion) {
      p.value = 0.5
      return
    }
    const io = { easing: Easing.inOut(Easing.sin) }
    p.value = withSequence(
      withTiming(0.5, { duration: 450, easing: Easing.out(Easing.cubic) }),
      withRepeat(withSequence(withTiming(0.3, { duration: 750, ...io }), withTiming(0.7, { duration: 1500, ...io }), withTiming(0.5, { duration: 750, ...io })), -1),
    )
  }, [peek, reduceMotion]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={style}>
      <BeforeAfter before={before} after={after} interactive={false} position={p} labels={false} />
      {badge && <BeforeAfterBadge compact={compact} style={s.thumbBadge} />}
    </View>
  )
}

/** "Before / After" badge for grid tiles and cards. */
export function BeforeAfterBadge({ style, compact }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  return (
    <View style={[s.badge, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.badgeSplit}><View style={s.badgeHalf} /><View style={[s.badgeHalf, s.badgeHalfOn]} /></View>
      <Text variant="caption" weight="700" style={s.labelText} maxFontSizeMultiplier={1.2}>{compact ? 'B/A' : 'Before / After'}</Text>
    </View>
  )
}

// Fixed colors on purpose: everything sits on top of a photo, in light and dark themes alike.
const s = StyleSheet.create({
  fill: { flex: 1, alignSelf: 'stretch' },
  frame: { width: '100%', overflow: 'hidden', backgroundColor: '#1a1a1a' },
  clip: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  beforeImg: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  divider: { position: 'absolute', top: 0, bottom: 0, left: -HANDLE / 2, width: HANDLE, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, left: HANDLE / 2 - 1, width: 2, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3 },
  handle: {
    width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  handleText: { color: '#111', fontSize: 16, fontWeight: '800', marginTop: -2, letterSpacing: 2 },
  label: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  labelLeft: { left: 10 },
  labelRight: { right: 10 },
  labelText: { color: '#fff', letterSpacing: 0.5 },
  toggle: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  toggleOn: { backgroundColor: '#fff' },
  hintPill: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(17,17,17,0.75)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  thumbBadge: { position: 'absolute', top: 6, right: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  badgeSplit: { flexDirection: 'row', width: 12, height: 10, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: '#fff' },
  badgeHalf: { flex: 1 },
  badgeHalfOn: { backgroundColor: '#fff' },
})
