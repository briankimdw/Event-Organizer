// A grid of square tiles you can put in order: press and hold a tile, then drag it to its new
// place (the others slide out of the way). Tap a tile to select it. Built on gesture-handler +
// reanimated. The drag starts only after a hold, so a quick swipe still scrolls the page;
// onDragging(true) fires when a tile is picked up, so the parent can stop scrolling meanwhile.
//
// Screen readers (and anyone who'd rather not drag): every tile has actions, "Move earlier",
// "Move later", "Make cover" plus whatever `actions` adds; the photo toolbar has the same as buttons.
import { useEffect, type ReactNode } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

import { useReduceMotion } from '@/lib/a11y'

type Action = { name: string; label: string }
type Props = {
  ids: string[]
  columns: number
  size: number
  gap: number
  renderItem: (id: string, index: number, dragging: boolean) => ReactNode
  onReorder: (ids: string[]) => void
  onPress?: (id: string) => void
  onDragging?: (on: boolean) => void
  /** Appended after the tiles, not draggable (the "+" tile). */
  trailing?: ReactNode
  a11yLabel: (id: string, index: number) => string
  actions?: (id: string, index: number) => Action[]
  onAction?: (id: string, index: number, name: string) => void
}

export function SortableGrid({ ids, columns, size, gap, renderItem, onReorder, onPress, onDragging, trailing, a11yLabel, actions, onAction }: Props) {
  const order = useSharedValue(ids)
  const active = useSharedValue<string | null>(null)
  useEffect(() => {
    order.value = ids
  }, [ids.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const count = ids.length + (trailing ? 1 : 0)
  const rows = Math.max(1, Math.ceil(count / columns))
  const step = size + gap
  const tx = (ids.length % columns) * step
  const ty = Math.floor(ids.length / columns) * step

  const move = (id: string, by: number) => {
    const i = ids.indexOf(id)
    const to = i + by
    if (to < 0 || to >= ids.length) return
    const next = [...ids]
    next.splice(i, 1)
    next.splice(to, 0, id)
    onReorder(next)
  }

  return (
    <View style={{ height: rows * step - gap, width: columns * step - gap }}>
      {ids.map((id, index) => (
        <Tile
          key={id}
          id={id}
          index={index}
          order={order}
          active={active}
          columns={columns}
          size={size}
          gap={gap}
          onCommit={onReorder}
          onPress={onPress}
          onDragging={onDragging}
          label={a11yLabel(id, index)}
          actions={[
            ...(index > 0 ? [{ name: 'earlier', label: 'Move earlier' }, { name: 'cover', label: 'Make cover' }] : []),
            ...(index < ids.length - 1 ? [{ name: 'later', label: 'Move later' }] : []),
            ...(actions?.(id, index) || []),
          ]}
          onAction={(name) => {
            if (name === 'earlier') move(id, -1)
            else if (name === 'later') move(id, 1)
            else if (name === 'cover') move(id, -index)
            else onAction?.(id, index, name)
          }}
        >
          {renderItem(id, index, false)}
        </Tile>
      ))}
      {!!trailing && <View style={{ position: 'absolute', width: size, height: size, left: tx, top: ty }}>{trailing}</View>}
    </View>
  )
}

function Tile({ id, index, order, active, columns, size, gap, onCommit, onPress, onDragging, label, actions, onAction, children }: {
  id: string; index: number; order: SharedValue<string[]>; active: SharedValue<string | null>; columns: number; size: number; gap: number
  onCommit: (ids: string[]) => void; onPress?: (id: string) => void; onDragging?: (on: boolean) => void
  label: string; actions: Action[]; onAction: (name: string) => void; children: ReactNode
}) {
  const reduceMotion = useReduceMotion()
  const step = size + gap
  const slot = (i: number) => {
    'worklet'
    return { x: (i % columns) * step, y: Math.floor(i / columns) * step }
  }
  const start = slot(Math.max(0, index))
  const x = useSharedValue(start.x)
  const y = useSharedValue(start.y)
  const ox = useSharedValue(0)
  const oy = useSharedValue(0)
  const lifted = useSharedValue(0)

  // Follow the order (when another tile is dragged past this one, or the list changes).
  useAnimatedReaction(
    () => order.value.indexOf(id),
    (i) => {
      if (i < 0 || active.value === id) return
      const p = slot(i)
      x.value = reduceMotion ? p.x : withTiming(p.x, { duration: 180 })
      y.value = reduceMotion ? p.y : withTiming(p.y, { duration: 180 })
    },
  )

  const report = (on: boolean) => onDragging?.(on)
  const arm = Gesture.LongPress()
    .minDuration(220)
    .maxDistance(12)
    .onStart(() => {
      'worklet'
      active.value = id
      lifted.value = withTiming(1, { duration: 120 })
      ox.value = x.value
      oy.value = y.value
      runOnJS(report)(true)
    })
  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onUpdate((e) => {
      'worklet'
      if (active.value !== id) return
      x.value = ox.value + e.translationX
      y.value = oy.value + e.translationY
      const n = order.value.length
      const col = Math.min(columns - 1, Math.max(0, Math.round(x.value / step)))
      const row = Math.max(0, Math.round(y.value / step))
      const to = Math.min(n - 1, row * columns + col)
      const from = order.value.indexOf(id)
      if (to !== from && from >= 0) {
        const next = order.value.slice()
        next.splice(from, 1)
        next.splice(to, 0, id)
        order.value = next
      }
    })
    .onFinalize(() => {
      'worklet'
      if (active.value !== id) return
      const p = slot(order.value.indexOf(id))
      x.value = withSpring(p.x, { damping: 20, stiffness: 260 })
      y.value = withSpring(p.y, { damping: 20, stiffness: 260 })
      lifted.value = withTiming(0, { duration: 150 })
      active.value = null
      runOnJS(onCommit)(order.value.slice())
      runOnJS(report)(false)
    })
  const release = () => {
    // A hold without a drag: put it down again.
    if (active.value === id) {
      const p = slot(order.value.indexOf(id))
      x.value = withSpring(p.x)
      y.value = withSpring(p.y)
      lifted.value = withTiming(0, { duration: 150 })
      active.value = null
      report(false)
    }
  }
  const armDone = arm.onEnd((_e, success) => {
    'worklet'
    if (success) runOnJS(release)()
  })
  const press = (tid: string) => onPress?.(tid)
  const tap = Gesture.Tap().maxDistance(10).onEnd((_e, ok) => {
    'worklet'
    if (ok) runOnJS(press)(id)
  })
  const gesture = Gesture.Exclusive(Gesture.Simultaneous(armDone, pan), tap)

  const style = useAnimatedStyle(() => ({
    zIndex: active.value === id ? 10 : 1,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1 + lifted.value * 0.08 }],
    shadowOpacity: lifted.value * 0.3,
  }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, style]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Double-tap to select. Swipe up or down for move, cover, edit and remove."
        accessibilityActions={[{ name: 'activate' }, ...actions]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onPress?.(id)
          else onAction(e.nativeEvent.actionName)
        }}
      >
        {/* pointerEvents none: the tile's gestures get every touch (on the web target an <img> would start a native image drag) */}
        <View style={{ flex: 1 }} pointerEvents="none">{children}</View>
      </Animated.View>
    </GestureDetector>
  )
}
