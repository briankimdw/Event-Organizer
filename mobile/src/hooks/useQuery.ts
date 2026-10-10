// Typed wrapper around the web's shared useQuery (frontend/src/lib/useQuery.js):
// same behavior, plus TypeScript types for `data`.
//   const { data, loading, error, reload } = useQuery(() => getPerson(id), [id])
// Pass null as the loader to skip (e.g. while signed out).
import sharedUseQuery from '@shared/lib/useQuery.js'

export type QueryState<T> = {
  data: T | undefined
  loading: boolean
  error: (Error & { status?: number }) | null
  reload: () => void
  setData: (next: T | undefined | ((prev: T | undefined) => T | undefined)) => void
}

export default function useQuery<T>(loader: (() => T | Promise<T>) | null, deps: unknown[] = []): QueryState<T> {
  return (sharedUseQuery as any)(loader, deps)
}
