import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createPostDraft, discardPostDraft, getAlbum, getPostPhotos, isCancelled, originalOwners, publishPost, uploadPostPhoto,
} from '../../api/portfolio.js'
import { clearQueue, patchQueue, saveQueue } from './uploadQueue.js'

export const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/failed to fetch|networkerror|load failed|network/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/jwt|not authenticated|row-level security|session expired|signed out/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  return msg || 'Something went wrong.'
}

// Posting a post, photo by photo: per-photo progress, automatic retries, "retry this photo",
// cancel, and resuming after the tab was closed (the queue is saved in IndexedDB).
//
// job: { phase: 'creating' | 'posting' | 'partial' | 'publishing' | 'done' | 'failed' | 'cancelling',
//        albumId, kind, providerId, title, error,
//        list: [{ key, name, thumbUrl, size, state: 'waiting' | 'uploading' | 'done' | 'failed', fraction, attempt, error }] }
export default function usePostQueue(userId) {
  const [job, setJob] = useState(null)
  const rec = useRef(null)      // the saved record (items with their blobs)
  const results = useRef(new Map()) // key -> { photoId, originalPath }
  const control = useRef(null)  // AbortController of the current run
  const running = useRef(null)  // Promise of the current run
  const persist = useRef(Promise.resolve()) // IndexedDB writes, in order
  const ownUrls = useRef([])
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      control.current?.abort()
      ownUrls.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const set = (fn) => alive.current && setJob((j) => (j ? { ...j, ...fn(j) } : j))
  const setItem = (key, fields) => set((j) => ({ list: j.list.map((x) => (x.key === key ? { ...x, ...fields } : x)) }))
  const save = (fn) => { persist.current = persist.current.then(fn).catch(() => {}) }

  const publish = useCallback(async ({ partial = false } = {}) => {
    const r = rec.current
    const done = r.items.filter((it) => results.current.has(it.key))
    if (!done.length) return
    set(() => ({ phase: 'publishing', error: '' }))
    try {
      const cover = r.kind === 'before_after'
        ? done.find((it) => it.pairRole === 'after') || done[0]
        : [...done].sort((a, b) => a.position - b.position)[0]
      await publishPost(r.albumId, { coverPhotoId: results.current.get(cover.key).photoId })
      save(() => clearQueue(userId))
      set(() => ({ phase: 'done', partial }))
    } catch (err) {
      set(() => ({ phase: 'partial', error: `Couldn’t publish: ${friendlyError(err)}` }))
    }
  }, [userId])

  // Upload the given items (keys), 2 at a time.
  const run = useCallback((keys) => {
    const r = rec.current
    const controller = new AbortController()
    control.current = controller
    const todo = r.items.filter((it) => keys.includes(it.key))
    const waiters = new Map() // key -> Promise<result> for photos that share an original
    for (const it of todo) {
      let resolve, reject
      const promise = new Promise((a, b) => { resolve = a; reject = b })
      promise.catch(() => {})
      waiters.set(it.key, { promise, resolve, reject })
    }
    set(() => ({ phase: 'posting', error: '' }))
    todo.forEach((it) => setItem(it.key, { state: 'waiting', fraction: 0, error: '', attempt: 0 }))

    const one = async (it) => {
      const w = waiters.get(it.key)
      try {
        let originalPath = null
        if (it.owner && it.owner !== it.key) {
          const owner = results.current.get(it.owner) || (await (waiters.get(it.owner)?.promise ?? Promise.reject(new Error('missing'))).catch(() => {
            throw new Error('Waiting for the photo it was made from. Retry that one first.')
          }))
          originalPath = owner.originalPath
        }
        setItem(it.key, { state: 'uploading', fraction: 0.02 })
        const res = await uploadPostPhoto({
          userId, albumId: r.albumId, position: it.position, hiddenFields: r.hiddenFields, originalPath, signal: controller.signal,
          item: { file: it.file, display: it.display ? { blob: it.display, width: it.width, height: it.height } : undefined, settings: it.settings, recipe: it.recipe, pairRole: it.pairRole },
          onProgress: (p) => setItem(it.key, { fraction: p.fraction, ...(p.attempt ? { attempt: p.attempt } : {}) }),
        })
        results.current.set(it.key, res)
        w.resolve(res)
        setItem(it.key, { state: 'done', fraction: 1 })
        save(() => patchQueue(userId, { [it.key]: { state: 'done', photoId: res.photoId, originalPath: res.originalPath } }))
      } catch (err) {
        w.reject(err)
        if (isCancelled(err) || controller.signal.aborted) setItem(it.key, { state: 'waiting', fraction: 0 })
        else setItem(it.key, { state: 'failed', error: friendlyError(err) })
      }
    }

    const p = (async () => {
      let next = 0
      const worker = async () => {
        while (next < todo.length && !controller.signal.aborted) await one(todo[next++])
      }
      await Promise.all([worker(), worker()])
      if (controller.signal.aborted || !alive.current) return
      const left = r.items.filter((it) => !results.current.has(it.key))
      if (!left.length) await publish()
      else set(() => ({ phase: 'partial' }))
    })()
    running.current = p
    return p
  }, [userId, publish])

  // Start posting. items: [{ key, name, file, display ({ blob, width, height }), settings, recipe, pairRole, thumbUrl, size }]
  const start = useCallback(async ({ providerId, kind, meta, hiddenFields, items }) => {
    results.current = new Map()
    const owners = originalOwners(items)
    setJob({
      phase: 'creating', kind, providerId, title: meta.title, albumId: null, error: '',
      list: items.map((it) => ({ key: it.key, name: it.name, thumbUrl: it.thumbUrl, size: it.file?.size || 0, state: 'waiting', fraction: 0, error: '' })),
    })
    let albumId
    try {
      albumId = await createPostDraft({ providerId, kind, ...meta })
    } catch (err) {
      set(() => ({ phase: 'failed', error: friendlyError(err) }))
      return
    }
    const thumbs = await Promise.all(items.map((it) => (it.thumbUrl ? fetch(it.thumbUrl).then((x) => x.blob()).catch(() => null) : null)))
    rec.current = {
      userId, providerId, albumId, kind, meta, hiddenFields,
      items: items.map((it, i) => ({
        key: it.key, name: it.name, position: i, file: it.file, display: it.display?.blob || null, width: it.display?.width || 0, height: it.display?.height || 0,
        thumb: thumbs[i], settings: it.settings || {}, recipe: it.recipe ?? null, pairRole: it.pairRole || null,
        owner: owners[i] !== i ? items[owners[i]].key : null, state: 'pending', photoId: null, originalPath: null,
      })),
    }
    set(() => ({ albumId }))
    save(() => saveQueue(rec.current))
    return run(rec.current.items.map((it) => it.key))
  }, [userId, run])

  // Try again: one photo (key) or every photo that failed.
  const retry = useCallback((key = null) => {
    const r = rec.current
    if (!r) return
    const keys = key ? [key] : r.items.filter((it) => !results.current.has(it.key)).map((it) => it.key)
    // A photo that shares another's original needs that one too.
    const withOwners = new Set(keys)
    for (const k of keys) {
      const it = r.items.find((x) => x.key === k)
      if (it?.owner && !results.current.has(it.owner)) withOwners.add(it.owner)
    }
    return run([...withOwners])
  }, [run])

  // Stop, and throw the half-made post away. The composer still has the photos.
  const cancel = useCallback(async () => {
    const r = rec.current
    set(() => ({ phase: 'cancelling' }))
    control.current?.abort()
    await running.current?.catch(() => {})
    if (r?.albumId) await discardPostDraft(r.albumId).catch(() => {})
    save(() => clearQueue(userId))
    rec.current = null
    if (alive.current) setJob(null)
  }, [userId])

  // Pick up a saved queue (from loadQueue). Photos already in the post are skipped.
  const resume = useCallback(async (saved) => {
    results.current = new Map()
    const urls = saved.items.map((it) => (it.thumb ? URL.createObjectURL(it.thumb) : null))
    ownUrls.current.push(...urls.filter(Boolean))
    setJob({
      phase: 'creating', kind: saved.kind, providerId: saved.providerId, title: saved.meta?.title, albumId: saved.albumId, error: '', resumed: true,
      list: saved.items.map((it, i) => ({ key: it.key, name: it.name, thumbUrl: urls[i], size: it.file?.size || 0, state: it.state === 'done' ? 'done' : 'waiting', fraction: it.state === 'done' ? 1 : 0, error: '' })),
    })
    try {
      const album = saved.albumId ? await getAlbum(saved.albumId) : null
      if (!album) {
        save(() => clearQueue(userId))
        set(() => ({ phase: 'failed', error: 'This post was deleted, so it can’t be finished. Start a new post.', gone: true }))
        return
      }
      // Rows already saved (maybe after the tab closed, before the record was updated).
      const rows = await getPostPhotos(saved.albumId)
      const byPos = new Map(rows.map((p) => [p.position, p]))
      for (const it of saved.items) {
        const row = byPos.get(it.position)
        if (row) results.current.set(it.key, { photoId: row.id, originalPath: row.original_path })
        else if (it.state === 'done' && it.photoId) results.current.set(it.key, { photoId: it.photoId, originalPath: it.originalPath })
      }
      rec.current = saved
      const pending = saved.items.filter((it) => !results.current.has(it.key))
      set((j) => ({ list: j.list.map((x) => (results.current.has(x.key) ? { ...x, state: 'done', fraction: 1 } : x)) }))
      // A photo whose file is gone (it was marked done, then its row vanished) can't be redone.
      const lost = pending.filter((it) => !it.file && !(it.owner && it.display))
      lost.forEach((it) => setItem(it.key, { state: 'failed', error: 'This photo is no longer saved here. Post it again separately.' }))
      const runnable = pending.filter((it) => !lost.includes(it)).map((it) => it.key)
      if (!runnable.length) {
        if (!pending.length) await publish()
        else set(() => ({ phase: 'partial' }))
        return
      }
      return run(runnable)
    } catch (err) {
      set(() => ({ phase: 'failed', error: friendlyError(err) }))
    }
  }, [userId, run, publish])

  // Forget a saved queue without finishing it (and delete its hidden draft).
  const discardSaved = useCallback(async (saved) => {
    await clearQueue(userId)
    if (saved?.albumId) await discardPostDraft(saved.albumId).catch(() => {})
  }, [userId])

  const reset = useCallback(() => {
    rec.current = null
    results.current = new Map()
    setJob(null)
  }, [])

  const doneCount = job ? job.list.filter((x) => x.state === 'done').length : 0
  return { job, doneCount, start, retry, cancel, resume, discardSaved, publishPartial: () => publish({ partial: true }), reset }
}
