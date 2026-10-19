// Undo / redo for the edit recipe.
//   const h = useHistory(initial)
//   h.value            what's on screen (may include an uncommitted live slider drag)
//   h.preview(next)    live change (slider dragging): shown, not yet an undo step
//   h.commit(next)     one undo step (gesture ended, preset tapped, crop done...)
//   h.undo() / h.redo() / h.canUndo / h.canRedo / h.reset(to)
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

const LIMIT = 100

type State<T> = { past: T[]; present: T; future: T[]; live: T | null }

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

export function useHistory<T>(initial: T) {
  const [st, setSt] = useState<State<T>>({ past: [], present: initial, future: [], live: null })
  const ref = useRef(st)
  useLayoutEffect(() => {
    ref.current = st
  })

  const preview = useCallback((next: T) => setSt((s) => ({ ...s, live: next })), [])

  const commit = useCallback((next: T) => setSt((s) => {
    if (same(next, s.present)) return s.live ? { ...s, live: null } : s
    return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [], live: null }
  }), [])

  const undo = useCallback(() => setSt((s) => {
    if (!s.past.length) return s
    return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], live: null }
  }), [])

  const redo = useCallback(() => setSt((s) => {
    if (!s.future.length) return s
    return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), live: null }
  }), [])

  /** Replace everything (new photo loaded); no undo step. */
  const reset = useCallback((to: T) => setSt({ past: [], present: to, future: [], live: null }), [])

  return useMemo(() => ({
    value: st.live ?? st.present,
    committed: st.present,
    /** Latest value without waiting for a render (for gesture callbacks). */
    current: () => ref.current.live ?? ref.current.present,
    preview, commit, undo, redo, reset,
    canUndo: st.past.length > 0,
    canRedo: st.future.length > 0,
  }), [st, preview, commit, undo, redo, reset])
}
