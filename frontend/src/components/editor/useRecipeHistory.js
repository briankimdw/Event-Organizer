import { useCallback, useEffect, useRef, useState } from 'react'
import { sameRecipe } from '../../lib/editor/recipe.js'

// Live recipe + undo/redo. Changes show immediately; a burst of changes (dragging a slider)
// becomes ONE undo step once it settles (or right away with { commit: true }).
const LIMIT = 100
const SETTLE_MS = 450

export default function useRecipeHistory(initial) {
  const [live, setLive] = useState(initial)
  const [, bump] = useState(0)
  const liveRef = useRef(initial)
  const hist = useRef({ stack: [initial], index: 0 })
  const timer = useRef(null)

  const commit = useCallback(() => {
    clearTimeout(timer.current)
    const h = hist.current
    const r = liveRef.current
    if (sameRecipe(h.stack[h.index], r)) return
    h.stack = h.stack.slice(0, h.index + 1).concat([r]).slice(-LIMIT)
    h.index = h.stack.length - 1
    bump((n) => n + 1)
  }, [])

  const change = useCallback((next, { commit: now = false } = {}) => {
    const r = typeof next === 'function' ? next(liveRef.current) : next
    liveRef.current = r
    setLive(r)
    clearTimeout(timer.current)
    if (now) commit()
    else timer.current = setTimeout(commit, SETTLE_MS)
  }, [commit])

  const jump = (delta) => {
    commit()
    const h = hist.current
    const i = h.index + delta
    if (i < 0 || i >= h.stack.length) return false
    h.index = i
    liveRef.current = h.stack[i]
    setLive(h.stack[i])
    bump((n) => n + 1)
    return true
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const h = hist.current
  const pending = !sameRecipe(h.stack[h.index], live)
  return {
    recipe: live,
    change,
    commit,
    undo: useCallback(() => jump(-1), []), // eslint-disable-line react-hooks/exhaustive-deps
    redo: useCallback(() => jump(1), []), // eslint-disable-line react-hooks/exhaustive-deps
    canUndo: h.index > 0 || pending,
    canRedo: !pending && h.index < h.stack.length - 1,
    current: () => liveRef.current,
  }
}
