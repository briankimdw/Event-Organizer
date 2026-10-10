// The photos being prepared for a post: native port of the web's
// components/upload/usePhotoItems.js. Photos come from expo-image-picker (assets
// with uri / fileName / mimeType / fileSize / width / height / exif).
//
// item: { id, asset, name, size, status: 'loading' | 'ready', thumbUrl, width, height,
//         lowRes, settings (camera settings from EXIF), processed: { width, height, size } | null }
//
// Each added photo is checked (quickCheck), gets a small preview and its EXIF read
// (never GPS). Then, one at a time in the background, prepareUpload(asset) builds
// what the shared postAlbum() needs (the original as a Blob + the resized public
// copy), so "Post" is fast and the picker can say what clients will see.
import { useCallback, useEffect, useRef, useState } from 'react'

import { LOW_RES_EDGE, MAX_PHOTOS, makePreview, prepareUpload, quickCheck, readCameraSettings, type PickedPhoto } from '@/shims/images'

export type Prepared = Awaited<ReturnType<typeof prepareUpload>>
export type PhotoItem = {
  id: string
  asset: PickedPhoto
  name: string
  size: number
  status: 'loading' | 'ready'
  thumbUrl: string | null
  width: number
  height: number
  lowRes: boolean
  settings: Record<string, string>
  processed: { width: number; height: number; size: number } | null
}
export type Rejected = { id: string; name: string; reason: string }

let seq = 0
const newId = () => `p${Date.now().toString(36)}${(++seq).toString(36)}`
const nameOf = (a: PickedPhoto) => a.fileName || a.name || a.uri.split('/').pop() || 'photo.jpg'

// EXIF "2024:05:01 14:03:22" -> "2024-05-01" (the web reads this as settings.taken_on).
function takenOn(exif: Record<string, any> | null | undefined) {
  const e = exif || {}
  const raw = e.DateTimeOriginal ?? e['{Exif}']?.DateTimeOriginal ?? e.DateTime ?? e['{TIFF}']?.DateTime
  const m = typeof raw === 'string' && raw.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export default function usePhotoItems() {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [notice, setNotice] = useState('')
  const itemsRef = useRef(items)
  itemsRef.current = items

  const prepared = useRef(new Map<string, Promise<Prepared | null>>())
  const previewChain = useRef<Promise<unknown>>(Promise.resolve())
  const prepareChain = useRef<Promise<unknown>>(Promise.resolve())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const exists = (id: string) => itemsRef.current.some((i) => i.id === id)
  const patch = (id: string, fields: Partial<PhotoItem>) => alive.current && setItems((list) => list.map((i) => (i.id === id ? { ...i, ...fields } : i)))

  // What postAlbum needs for an item (starts making it if needed). Resolves null if the item was removed.
  const prepare = useCallback((item: PhotoItem) => {
    if (!prepared.current.has(item.id)) {
      const p = (prepareChain.current = prepareChain.current
        .catch(() => {})
        .then(async () => {
          if (!exists(item.id)) return null
          const ready = await prepareUpload(item.asset)
          if (alive.current && exists(item.id)) {
            patch(item.id, { processed: { width: ready.display.width, height: ready.display.height, size: ready.display.blob.size } })
          }
          return ready
        })) as Promise<Prepared | null>
      p.catch(() => {})
      prepared.current.set(item.id, p)
    }
    return prepared.current.get(item.id)!
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = (item: PhotoItem) => {
    previewChain.current = previewChain.current
      .catch(() => {})
      .then(async () => {
        if (!exists(item.id)) return
        try {
          const [preview, settings] = await Promise.all([makePreview(item.asset), readCameraSettings(item.asset)])
          if (!alive.current || !exists(item.id)) return
          const date = takenOn(item.asset.exif)
          const all = date ? { ...settings, taken_on: date } : settings
          const lowRes = Math.max(preview.width, preview.height) < LOW_RES_EDGE
          patch(item.id, { status: 'ready', thumbUrl: preview.thumbUrl, width: preview.width, height: preview.height, settings: all, lowRes })
          prepare(item)
        } catch (err: any) {
          if (!alive.current) return
          setItems((list) => list.filter((i) => i.id !== item.id))
          setRejected((r) => [...r, { id: item.id, name: item.name, reason: err?.message || 'This photo couldn’t be read.' }])
        }
      })
  }

  // Add picked photos. max: how many the post can hold. at: replace the item at this
  // index (before/after slots) instead of appending.
  const add = (assets: PickedPhoto[], { max = MAX_PHOTOS, at }: { max?: number; at?: number | null } = {}) => {
    if (!assets.length) return
    const bad: Rejected[] = []
    const good: PickedPhoto[] = []
    for (const a of assets) {
      const reason = quickCheck(a)
      if (reason) bad.push({ id: newId(), name: nameOf(a), reason })
      else good.push(a)
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
    const fresh: PhotoItem[] = taken.map((asset) => ({
      id: newId(), asset, name: nameOf(asset), size: asset.fileSize ?? asset.size ?? 0, status: 'loading',
      thumbUrl: null, width: asset.width ?? 0, height: asset.height ?? 0, lowRes: false, settings: {}, processed: null,
    }))
    if (!fresh.length) return
    let next: PhotoItem[]
    if (replacing) {
      prepared.current.delete(current[at!].id)
      next = current.map((it, i) => (i === at ? fresh[0] : it))
    } else {
      next = [...current, ...fresh]
    }
    commit(next)
    fresh.forEach(load)
  }

  const commit = (next: PhotoItem[]) => {
    itemsRef.current = next
    setItems(next)
  }

  const remove = (id: string) => {
    prepared.current.delete(id)
    commit(itemsRef.current.filter((i) => i.id !== id))
    setNotice('')
  }

  // Move the item at index `from` to index `to`.
  const move = (from: number, to: number) => {
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
    prepared.current.clear()
    commit([])
    setRejected([])
    setNotice('')
  }

  // Everything postAlbum needs for these items ({ file, display, settings }), using the prepared copies.
  const forUpload = async (list: PhotoItem[]) =>
    Promise.all(
      list.map(async (it) => {
        const ready = (await prepare(it).catch(() => null)) || (await prepareUpload(it.asset))
        return { ...ready, settings: it.settings }
      }),
    )

  return {
    items, rejected, notice,
    add, remove, move, swapFirstTwo, reset, forUpload,
    dismissRejected: (id: string) => setRejected((r) => r.filter((x) => x.id !== id)),
    clearNotice: () => setNotice(''),
  }
}

export type PhotoItems = ReturnType<typeof usePhotoItems>
