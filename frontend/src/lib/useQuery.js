import { useCallback, useEffect, useRef, useState } from 'react'

// Load async data into a component.
//   const { data, loading, error, reload, setData } = useQuery(() => getProvider(id), [id])
// Pass null as the loader to skip (e.g. while signed out): data stays undefined, loading false.
export default function useQuery(loader, deps = []) {
  const [state, setState] = useState({ data: undefined, loading: !!loader, error: null })
  const [tick, setTick] = useState(0)
  const live = useRef(0)

  useEffect(() => {
    const run = ++live.current
    if (!loader) {
      setState({ data: undefined, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve()
      .then(loader)
      .then(
        (data) => run === live.current && setState({ data, loading: false, error: null }),
        (error) => {
          if (run !== live.current) return
          console.warn(error)
          setState({ data: undefined, loading: false, error })
        },
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, !!loader])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])
  return { ...state, reload, setData }
}
