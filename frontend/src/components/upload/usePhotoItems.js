import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_PHOTOS, displayFromRender, fingerprint, isHeic, makeDisplayCopy, makePreview, previewFromBlob, quickCheck,
  readCameraSettings, toDecodable,
} from '../../lib/images.js'
import { photoHints } from '../../api/portfolio.js'

// The photos being prepared for a post.
//
// item: {
//   id, file (the untouched original, uploaded privately), source (what the browser decodes:
//   the file, or a JPEG converted from a HEIC), name, size, status 'loading' | 'ready',
//   note (what's happening while loading), heic (converted from HEIC), hash (duplicate check),
//   width, height, settings (camera settings from EXIF; GPS never read),
//   thumbUrl / processed { url, width, height, size }: what clients will see (the edit, if any),
//   base { thumbUrl, processed }: the unedited version,
//   recipe (edit recipe) | null, edited (bool),
//   pixels { blob, recipe } | null: a pixel edit (AI / Studio): the pixel-edited base and the recipe on
//     top of it, for reopening the editor; the post then stores recipe null (the original stays private),
//   pairOf: id | null  (the "before" made from another photo's original, for a before & after)
// }
//
// Each added file is checked, decoded once for a small preview (HEIC converted first when the
// browser can't read it), and its EXIF read. Then, in the background and one at a time, the
// public copy is made, so "Post" is fast and the composer shows exactly what clients will see.
// Decoding is serialized to keep memory low on phones.
export default function usePhotoItems() {
  const [items, setItems] = useState([])
  const [rejected, setRejected] = useState([]) // [{ id, name, reason }]
  const [notice, setNotice] = useState('')
  const itemsRef = useRef(items)
  itemsRef.current = items

  const urls = useRef(new Set())
  const displays = useRef(new Map()) // item id -> Promise<{ blob, width, height } | null> (unedited public copy)
  const edits = useRef(new Map())    // item id -> { blob, width, height } (edited public copy)
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
  // Revoke an object URL unless an item still shows it (a before/after pair shares some).
  const release = (url, except = null) => {
    if (!url) return
    const used = itemsRef.current.some((i) => i.id !== except && [i.thumbUrl, i.processed?.url, i.base?.thumbUrl, i.base?.processed?.url].includes(url))
    if (used) return
    URL.revokeObjectURL(url)
    urls.current.delete(url)
  }
  const exists = (id) => itemsRef.current.some((i) => i.id === id)
  const commit = (next) => {
    itemsRef.current = next
    if (alive.current) setItems(next)
  }
  const update = (id, fn) => commit(itemsRef.current.map((i) => (i.id === id ? { ...i, ...fn(i) } : i)))

  // The unedited public copy for an item (starts making it if needed). Resolves null if the item was removed.
  const prepare = useCallback((item) => {
    if (!displays.current.has(item.id)) {
      const p = (displayChain.current = displayChain.current
        .catch(() => {})
        .then(async () => {
          if (!exists(item.id)) return null
          const copy = await makeDisplayCopy(item.source || item.file)
          if (alive.current && exists(item.id)) {
            const processed = { url: track(URL.createObjectURL(copy.blob)), width: copy.width, height: copy.height, size: copy.blob.size }
            // The base copy is shared with a pair's "before" clone.
            commit(itemsRef.current.map((i) => (i.id === item.id || i.pairOf === item.id
              ? { ...i, base: { ...i.base, processed }, ...(i.edited ? {} : { processed }) }
              : i)))
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
          if (isHeic(item.file)) update(item.id, () => ({ note: 'Converting HEIC…' }))
          const { file: source, converted } = await toDecodable(item.file)
          if (!exists(item.id)) return
          const [preview, settings, hash] = await Promise.all([makePreview(source), readCameraSettings(item.file), fingerprint(item.file)])
          if (!alive.current || !exists(item.id)) return URL.revokeObjectURL(preview.thumbUrl)
          track(preview.thumbUrl)
          update(item.id, (i) => ({
            status: 'ready', note: '', source, heic: converted, hash, settings, width: preview.width, height: preview.height,
            thumbUrl: i.edited ? i.thumbUrl : preview.thumbUrl, base: { ...i.base, thumbUrl: preview.thumbUrl },
          }))
          prepare({ ...item, source })
        } catch (err) {
          if (!alive.current) return
          commit(itemsRef.current.filter((i) => i.id !== item.id))
          setRejected((r) => [...r, { id: item.id, name: item.name, reason: err.message }])
        }
      })
  }

  // Add files. max: how many the post can hold. at: replace the item at this index
  // (before/after slots) instead of appending. Returns the ids added.
  const add = (fileList, { max = MAX_PHOTOS, at } = {}) => {
    const files = [...(fileList || [])]
    if (!files.length) return []
    const bad = []
    const good = []
    for (const file of files) {
      const reason = quickCheck(file)
      if (reason) bad.push({ id: crypto.randomUUID(), name: file.name || 'Pasted image', reason })
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
      id: crypto.randomUUID(), file, source: null, name: file.name || 'Pasted image', size: file.size, status: 'loading', note: '',
      heic: false, hash: '', thumbUrl: null, width: 0, height: 0, settings: {}, processed: null,
      base: { thumbUrl: null, processed: null }, recipe: null, edited: false, pairOf: null,
    }))
    if (!fresh.length) return []
    let next
    if (replacing) {
      const old = current[at]
      next = current.map((it, i) => (i === at ? fresh[0] : it)).filter((it) => it.pairOf !== old.id)
      commit(next)
      forget(old)
    } else {
      commit([...current, ...fresh])
    }
    fresh.forEach(load)
    return fresh.map((f) => f.id)
  }

  const forget = (item) => {
    if (!item) return
    ;[item.thumbUrl, item.processed?.url, item.base?.thumbUrl, item.base?.processed?.url].forEach((u) => release(u, item.id))
    if (!item.pairOf) displays.current.delete(item.id)
    edits.current.delete(item.id)
  }

  const remove = (id) => {
    const item = itemsRef.current.find((i) => i.id === id)
    // Removing a photo also removes the "before" made from it.
    const gone = itemsRef.current.filter((i) => i.id === id || i.pairOf === id)
    commit(itemsRef.current.filter((i) => !gone.includes(i)))
    gone.forEach(forget)
    setNotice('')
    return item
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

  // Keep an edit: { blob, recipe, width, height, pixelEdited?, pixelBase? } from the editor. The
  // render becomes the public copy. A pixel edit (AI / Studio: recipe null) keeps its pixelBase as
  // item.pixels, so the editor reopens on it (editorBridge.jsx editorPropsFor).
  const setEdit = async (id, { blob, recipe, width, height, pixelEdited = false, pixelBase = null }) => {
    const display = await displayFromRender(blob, width, height)
    const preview = await previewFromBlob(display.blob)
    if (!alive.current || !exists(id)) return URL.revokeObjectURL(preview.thumbUrl)
    track(preview.thumbUrl)
    edits.current.set(id, display)
    const old = itemsRef.current.find((i) => i.id === id)
    update(id, () => ({
      edited: true, recipe: pixelEdited ? null : recipe ?? null, thumbUrl: preview.thumbUrl,
      pixels: pixelEdited ? { blob: pixelBase?.blob || blob, recipe: pixelBase ? pixelBase.recipe ?? null : null } : null,
      processed: { url: track(URL.createObjectURL(display.blob)), width: display.width, height: display.height, size: display.blob.size },
    }))
    if (old?.edited) {
      release(old.thumbUrl)
      release(old.processed?.url)
    }
  }

  // Back to the original photo.
  const clearEdit = (id) => {
    const old = itemsRef.current.find((i) => i.id === id)
    if (!old?.edited) return
    edits.current.delete(id)
    update(id, (i) => ({ edited: false, recipe: null, pixels: null, thumbUrl: i.base.thumbUrl, processed: i.base.processed }))
    release(old.thumbUrl)
    release(old.processed?.url)
  }

  // Before & after from one photo: the photo keeps the edit (the "after") and an unedited
  // copy of it becomes the "before". The pair moves to the front. Returns the "before" id.
  const makePair = async (id, edit) => {
    await setEdit(id, edit)
    const after = itemsRef.current.find((i) => i.id === id)
    if (!after) return null
    const others = itemsRef.current.filter((i) => i.id !== id && i.pairOf !== id)
    const before = {
      ...after, id: crypto.randomUUID(), pairOf: id, edited: false, recipe: null, pixels: null,
      thumbUrl: after.base.thumbUrl, processed: after.base.processed,
    }
    commit([before, after, ...others])
    return before.id
  }

  // Drop the "before" copies (leaving before & after for a plain post).
  const dropPairs = () => {
    const pairs = itemsRef.current.filter((i) => i.pairOf)
    if (!pairs.length) return
    commit(itemsRef.current.filter((i) => !i.pairOf))
  }

  const reset = () => {
    const all = itemsRef.current
    commit([])
    all.forEach(forget)
    displays.current.clear()
    edits.current.clear()
    setRejected([])
    setNotice('')
  }

  // Everything uploadPostPhoto / postAlbum needs for these items, using the prepared copies.
  // A pair's "before" shares the original File with its "after" (so it's uploaded once).
  const forUpload = async (list) =>
    Promise.all(list.map(async (it) => {
      const display = (it.edited && edits.current.get(it.id))
        || (await prepare(it.pairOf ? itemsRef.current.find((x) => x.id === it.pairOf) || it : it).catch(() => null))
        || undefined
      return { file: it.file, display, settings: it.settings, recipe: it.edited ? it.recipe : null }
    }))

  // Non-blocking notes per item id: [{ kind, text }].
  const hintsFor = (it) => {
    if (it.status !== 'ready') return []
    const list = itemsRef.current
    const firstSame = it.hash && !it.pairOf ? list.findIndex((x) => x.hash === it.hash && !x.pairOf) : -1
    const index = list.indexOf(it)
    const dup = firstSame >= 0 && firstSame < index ? firstSame + 1 : null
    return photoHints({ width: it.width, height: it.height, size: it.size, duplicateOf: dup })
  }

  return {
    items, rejected, notice,
    add, remove, move, swapFirstTwo, reset, forUpload, setEdit, clearEdit, makePair, dropPairs, hintsFor,
    dismissRejected: (id) => setRejected((r) => r.filter((x) => x.id !== id)),
    clearNotice: () => setNotice(''),
  }
}
