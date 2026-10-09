import { useCallback, useEffect, useRef, useState } from 'react'
import { LOW_RES_EDGE, MAX_PHOTOS, makeDisplayCopy, makePreview, quickCheck, readCameraSettings } from '../../lib/images.js'

// The photos being prepared for a post.
//
// item: { id, file, name, size, status: 'loading' | 'ready', thumbUrl, width, height, lowRes,
//         settings (camera settings from EXIF), processed: { url, width, height, size } | null }
//
// Each added file is checked, decoded once for a small preview, and its EXIF read
// (GPS never). Then, in the background and one at a time, the public copy that will
// actually be uploaded is made, so "Post" is fast and the composer can show exactly
// what clients will see. Decoding is serialized to keep memory low on phones.
export default function usePhotoItems() {
  const [items, setItems] = useState([])
  const [rejected, setRejected] = useState([]) // [{ id, name, reason }]
  const [notice, setNotice] = useState('')
  const itemsRef = useRef(items)
  itemsRef.current = items

  const urls = useRef(new Set())
  const displays = useRef(new Map()) // item id -> Promise<{ blob, width, height } | null>
  const previewChain = useRef(Promise.resolve())
  const displayChain = useRef(Promise.resolve())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      urls.current.clear()
    }
  }, [])

  const track = (url) => {
    urls.current.add(url)
    return url
  }
  const release = (url) => {
    if (!url) return
    URL.revokeObjectURL(url)
    urls.current.delete(url)
  }
  const exists = (id) => itemsRef.current.some((i) => i.id === id)
  const patch = (id, fields) => alive.current && setItems((list) => list.map((i) => (i.id === id ? { ...i, ...fields } : i)))

  // The public copy for an item (starts making it if needed). Resolves null if the item was removed.
  const prepare = useCallback((item) => {
    if (!displays.current.has(item.id)) {
      const p = (displayChain.current = displayChain.current
        .catch(() => {})
        .then(async () => {
          if (!exists(item.id)) return null
          const copy = await makeDisplayCopy(item.file)
          if (alive.current && exists(item.id)) {
            patch(item.id, { processed: { url: track(URL.createObjectURL(copy.blob)), width: copy.width, height: copy.height, size: copy.blob.size } })
          }
          return copy
        }))
      p.catch(() => {})
      displays.current.set(item.id, p)
    }
    return displays.current.get(item.id)
  }, [])

  const load = (item) => {
    previewChain.current = previewChain.current
      .catch(() => {})
      .then(async () => {
        if (!exists(item.id)) return
        try {
          const [preview, settings] = await Promise.all([makePreview(item.file), readCameraSettings(item.file)])
          if (!alive.current) return release(preview.thumbUrl)
          if (!exists(item.id)) return release(preview.thumbUrl)
          track(preview.thumbUrl)
          const lowRes = Math.max(preview.width, preview.height) < LOW_RES_EDGE
          patch(item.id, { status: 'ready', thumbUrl: preview.thumbUrl, width: preview.width, height: preview.height, settings, lowRes })
          prepare(item)
        } catch (err) {
          if (!alive.current) return
          setItems((list) => list.filter((i) => i.id !== item.id))
          setRejected((r) => [...r, { id: item.id, name: item.name, reason: err.message }])
        }
      })
  }

  // Add files. max: how many the post can hold. at: replace the item at this index
  // (before/after slots) instead of appending.
  const add = (fileList, { max = MAX_PHOTOS, at } = {}) => {
    const files = [...fileList]
    if (!files.length) return
    const bad = []
    const good = []
    for (const file of files) {
      const reason = quickCheck(file)
      if (reason) bad.push({ id: crypto.randomUUID(), name: file.name, reason })
      else good.push(file)
    }
    const current = itemsRef.current
    const replacing = at != null && at < current.length
    const room = replacing ? 1 : Math.max(0, max - current.length)
    const taken = good.slice(0, room)
    const skipped = good.length - taken.length
    setNotice(
      skipped > 0
        ? max === MAX_PHOTOS
          ? `A post holds up to ${MAX_PHOTOS} photos, so ${skipped} ${skipped === 1 ? 'wasn’t' : 'weren’t'} added. Make a second post for the rest.`
          : `Only ${max} photos are used here, so ${skipped} ${skipped === 1 ? 'wasn’t' : 'weren’t'} added.`
        : '',
    )
    setRejected((r) => [...r.filter((x) => !bad.some((b) => b.name === x.name)), ...bad])
    const fresh = taken.map((file) => ({
      id: crypto.randomUUID(), file, name: file.name, size: file.size, status: 'loading',
      thumbUrl: null, width: 0, height: 0, lowRes: false, settings: {}, processed: null,
    }))
    if (!fresh.length) return
    let next
    if (replacing) {
      const old = current[at]
      forget(old)
      next = current.map((it, i) => (i === at ? fresh[0] : it))
    } else {
      next = [...current, ...fresh]
    }
    itemsRef.current = next
    setItems(next)
    fresh.forEach(load)
  }

  const forget = (item) => {
    if (!item) return
    release(item.thumbUrl)
    release(item.processed?.url)
    displays.current.delete(item.id)
  }

  const commit = (next) => {
    itemsRef.current = next
    setItems(next)
  }

  const remove = (id) => {
    forget(itemsRef.current.find((i) => i.id === id))
    commit(itemsRef.current.filter((i) => i.id !== id))
    setNotice('')
  }

  // Move the item at index `from` to index `to`.
  const move = (from, to) => {
    const list = [...itemsRef.current]
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const [it] = list.splice(from, 1)
    list.splice(to, 0, it)
    commit(list)
  }

  const swapFirstTwo = () => {
    const list = itemsRef.current
    if (list.length >= 2) commit([list[1], list[0], ...list.slice(2)])
  }

  const reset = () => {
    itemsRef.current.forEach(forget)
    commit([])
    setRejected([])
    setNotice('')
  }

  // Everything postAlbum needs for these items, using the prepared copies where ready.
  const forUpload = async (list) =>
    Promise.all(list.map(async (it) => ({ file: it.file, settings: it.settings, display: (await prepare(it).catch(() => null)) || undefined })))

  return {
    items, rejected, notice,
    add, remove, move, swapFirstTwo, reset, forUpload,
    dismissRejected: (id) => setRejected((r) => r.filter((x) => x.id !== id)),
    clearNotice: () => setNotice(''),
  }
}
