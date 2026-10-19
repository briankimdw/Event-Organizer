// The "before" photo of before & after posts, for data that says a post is a before & after but
// doesn't carry its before photo: shared chat cards (api/messages.js gives `beforeAfter` and the
// cover only). Deck cards and Explore tiles don't need this: getDeck / listExplorePhotos return
// `beforeSrc` themselves.
//
//   const before = useBeforePhotos(albumIds)   Map<albumId, beforeUrl> (only before & after posts)
//
// One small query per new batch of album ids, cached for the session.
// TODO(shared): drop this if messages.js toShared() grows `beforeSrc` too.
import { useEffect, useState } from 'react'

import { publicUrl } from '@shared/api/portfolio.js'
import { supabase } from '@/lib/supabase'

const cache = new Map<string, string | null>() // albumId -> before url (null = not a before & after)
const inflight = new Map<string, Promise<void>>()

async function load(ids: string[]) {
  const todo = ids.filter((id) => !cache.has(id) && !inflight.has(id))
  if (!todo.length) {
    await Promise.all(ids.map((id) => inflight.get(id)).filter(Boolean))
    return
  }
  const p = (async () => {
    try {
      const { data, error } = await supabase.from('photos').select('album_id, display_path').in('album_id', todo).eq('pair_role', 'before')
      if (error) throw error
      for (const id of todo) cache.set(id, null)
      for (const r of (data || []) as { album_id: string; display_path: string }[]) {
        if (r.display_path) cache.set(r.album_id, publicUrl('portfolio', r.display_path))
      }
    } catch (e) {
      console.warn('beforePhotos', e) // leave them uncached: tried again next time
    } finally {
      for (const id of todo) inflight.delete(id)
    }
  })()
  for (const id of todo) inflight.set(id, p)
  await p
}

const pick = (ids: string[]) => {
  const m = new Map<string, string>()
  for (const id of ids) {
    const v = cache.get(id)
    if (v) m.set(id, v)
  }
  return m
}

export async function beforePhotosOf(albumIds: (string | null | undefined)[]) {
  const ids = [...new Set(albumIds.filter(Boolean) as string[])]
  if (ids.length) await load(ids)
  return pick(ids)
}

/** The before photo of each before & after post among `albumIds`. */
export function useBeforePhotos(albumIds: (string | null | undefined)[]) {
  const ids = [...new Set(albumIds.filter(Boolean) as string[])]
  const key = ids.join(',')
  const [map, setMap] = useState(() => pick(ids))
  useEffect(() => {
    let live = true
    if (!ids.length) return
    setMap(pick(ids))
    beforePhotosOf(ids).then((m) => live && setMap(m)).catch(() => {})
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return map
}

/** Forget a post (after it was edited or deleted). */
export const forgetBeforePhoto = (albumId: string) => cache.delete(albumId)
