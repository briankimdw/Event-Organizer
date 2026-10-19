// The photos being prepared for a post (native port of the web's components/upload/usePhotoItems.js,
// grown for the native flow). Photos come from expo-image-picker (library or camera): assets with
// uri / assetId / fileName / mimeType / fileSize / width / height / exif.
//
// item: { id, asset, name, size, status: 'loading' | 'ready', thumbUrl, width, height,
//         lowRes, huge, dupOf (id of the photo it looks like), settings (camera settings from EXIF),
//         edit: { uri, width, height, recipe } | null (from the editor),
//         sameOriginalAs (a before & after's "after" made from the "before" photo + its edit),
//         processed: { width, height, size } | null (what clients will see) }
//
// Each added photo is checked (quickCheck), HEIC is converted to JPEG (toCompatible), it gets a
// small preview and its EXIF read (never GPS). Then, one at a time in the background, the public
// copy is made (makeDisplayFile), so "Post" is quick. forQueue() hands everything to the upload queue.
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  LOW_RES_EDGE, MAX_PHOTOS, fileExtension, formatBytes, isHeic, makeDisplayFile, makePreview, quickCheck, readCameraSettings, toCompatible, type PickedPhoto,
} from '@/shims/images'
import type { NewPhoto } from './uploadQueue'

export type PickedAsset = PickedPhoto & { assetId?: string | null }
export type PhotoEdit = { uri: string; width: number; height: number; recipe: unknown }
type DisplayFile = { uri: string; width: number; height: number; size: number; from: string }
export type PhotoItem = {
  id: string
  asset: PickedAsset
  name: string
  size: number
  status: 'loading' | 'ready'
  thumbUrl: string | null
  width: number
  height: number
  lowRes: boolean
  huge: boolean
  dupOf: string | null
  settings: Record<string, string>
  edit: PhotoEdit | null
  sameOriginalAs?: string | null
  processed: { width: number; height: number; size: number } | null
}
export type Rejected = { id: string; name: string; reason: string }

const HUGE_BYTES = 25 * 1024 * 1024
const HUGE_PIXELS = 48e6

let seq = 0
const newId = () => `p${Date.now().toString(36)}${(++seq).toString(36)}`
const nameOf = (a: PickedPhoto) => a.fileName || a.name || a.uri.split('/').pop() || 'photo.jpg'
const sizeOf = (a: PickedPhoto) => a.fileSize ?? a.size ?? 0

// EXIF "2024:05:01 14:03:22" -> "2024-05-01" (the web reads this as settings.taken_on).
function takenAt(exif: Record<string, any> | null | undefined) {
  const e = exif || {}
  return e.DateTimeOriginal ?? e['{Exif}']?.DateTimeOriginal ?? e.DateTime ?? e['{TIFF}']?.DateTime ?? null
}
function takenOn(exif: Record<string, any> | null | undefined) {
  const raw = takenAt(exif)
  const m = typeof raw === 'string' && raw.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// Is `a` the same photo as `b`? Same library asset, or same name and size, or same pixel size
// and the same capture time to the second.
function sameShot(a: PickedAsset, b: PickedAsset) {
  if (a.assetId && b.assetId) return a.assetId === b.assetId
  if (sizeOf(a) && sizeOf(a) === sizeOf(b) && nameOf(a) === nameOf(b)) return true
  const ta = takenAt(a.exif)
  return !!ta && ta === takenAt(b.exif) && !!a.width && a.width === b.width && a.height === b.height
}

/** Short hints for a photo, worst first ("Looks like photo 2", "Low resolution", "Large file"). */
export function hintsOf(item: PhotoItem, items: PhotoItem[]) {
  const out: { key: 'dup' | 'low' | 'huge'; text: string }[] = []
  const dupIdx = item.dupOf ? items.findIndex((x) => x.id === item.dupOf) : -1
  if (dupIdx >= 0) out.push({ key: 'dup', text: `Looks like photo ${dupIdx + 1}` })
  if (item.lowRes) out.push({ key: 'low', text: 'Low resolution · may look soft' })
  if (item.huge) out.push({ key: 'huge', text: `Large file${item.size ? ` (${formatBytes(item.size)})` : ''} · slower on cellular` })
  return out
}

export default function usePhotoItems() {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [notice, setNotice] = useState('')
  const itemsRef = useRef(items)
  itemsRef.current = items

  const displays = useRef(new Map<string, Promise<DisplayFile>>()) // `${id}|${source uri}` -> public copy
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
  const commit = (next: PhotoItem[]) => {
    itemsRef.current = next
    setItems(next)
  }
  const patch = (id: string, fields: Partial<PhotoItem>) => {
    if (!alive.current) return
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, ...fields } : i)))
  }

  // The public copy of an item as it is now (its edit, or the photo itself). Starts it if needed.
  const display = useCallback((item: PhotoItem): Promise<DisplayFile> => {
    const src = item.edit ? { uri: item.edit.uri, width: item.edit.width, height: item.edit.height } : { uri: item.asset.uri, width: item.asset.width, height: item.asset.height }
    const k = `${item.id}|${src.uri}`
    if (!displays.current.has(k)) {
      const p = (prepareChain.current = prepareChain.current
        .catch(() => {})
        .then(async () => {
          const out = await makeDisplayFile(src)
          const cur = itemsRef.current.find((i) => i.id === item.id)
          const curSrc = cur?.edit?.uri ?? cur?.asset.uri
          if (alive.current && cur && curSrc === src.uri) patch(item.id, { processed: { width: out.width, height: out.height, size: out.size } })
          return { ...out, from: src.uri }
        })) as Promise<DisplayFile>
      p.catch(() => displays.current.delete(k))
      displays.current.set(k, p)
    }
    return displays.current.get(k)!
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const load = (item: PhotoItem) => {
    previewChain.current = previewChain.current
      .catch(() => {})
      .then(async () => {
        if (!exists(item.id)) return
        try {
          const asset = await toCompatible(item.asset) // HEIC -> JPEG
          const [preview, settings] = await Promise.all([makePreview(asset), readCameraSettings(asset)])
          if (!alive.current || !exists(item.id)) return
          const date = takenOn(item.asset.exif)
          const all = date ? { ...settings, taken_on: date } : settings
          const w = preview.width || asset.width || 0
          const h = preview.height || asset.height || 0
          const size = sizeOf(asset) || item.size
          const fields: Partial<PhotoItem> = {
            asset: { ...asset, assetId: item.asset.assetId, exif: item.asset.exif }, name: nameOf(asset), size,
            status: 'ready', thumbUrl: preview.thumbUrl, width: w, height: h, settings: all,
            lowRes: Math.max(w, h) > 0 && Math.max(w, h) < LOW_RES_EDGE,
            huge: size > HUGE_BYTES || w * h > HUGE_PIXELS,
          }
          patch(item.id, fields)
          const now = itemsRef.current.find((i) => i.id === item.id)
          if (now) display(now)
        } catch (err: any) {
          if (!alive.current) return
          commit(itemsRef.current.filter((i) => i.id !== item.id))
          setRejected((r) => [...r, { id: item.id, name: item.name, reason: isHeic(item.asset) ? 'This HEIC photo couldn’t be converted. Try exporting it as a JPEG.' : err?.message || 'This photo couldn’t be read.' }])
        }
      })
  }

  const fresh = (asset: PickedAsset): PhotoItem => ({
    id: newId(), asset, name: nameOf(asset), size: sizeOf(asset), status: 'loading',
    thumbUrl: null, width: asset.width ?? 0, height: asset.height ?? 0, lowRes: false, huge: false, dupOf: null, settings: {}, edit: null, processed: null,
  })

  // Add picked photos. max: how many the post can hold. at: replace the item at this
  // index (before/after slots) instead of appending.
  const add = (assets: PickedAsset[], { max = MAX_PHOTOS, at }: { max?: number; at?: number | null } = {}) => {
    if (!assets.length) return
    const bad: Rejected[] = []
    const good: PickedAsset[] = []
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
    const added: PhotoItem[] = []
    for (const asset of taken) {
      const it = fresh(asset)
      const twin = [...current, ...added].find((x) => sameShot(x.asset, asset))
      it.dupOf = twin?.id ?? null
      added.push(it)
    }
    if (!added.length) return
    const next = replacing ? current.map((it, i) => (i === at ? added[0] : it)) : [...current, ...added]
    commit(next)
    added.forEach(load)
  }

  const remove = (id: string) => {
    commit(itemsRef.current.filter((i) => i.id !== id).map((i) => (i.dupOf === id ? { ...i, dupOf: null } : i.sameOriginalAs === id ? { ...i, sameOriginalAs: null } : i)))
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

  // A new order by ids (drag to reorder).
  const reorder = (ids: string[]) => {
    const byId = new Map(itemsRef.current.map((i) => [i.id, i]))
    const next = ids.map((id) => byId.get(id)).filter(Boolean) as PhotoItem[]
    if (next.length === itemsRef.current.length) commit(next)
  }

  const swapFirstTwo = () => {
    const list = itemsRef.current
    if (list.length >= 2) commit([list[1], list[0], ...list.slice(2)])
  }

  const setEdit = (id: string, edit: PhotoEdit | null) => {
    const it = itemsRef.current.find((i) => i.id === id)
    if (!it) return
    patch(id, { edit, processed: null })
    display({ ...it, edit })
  }

  // A before & after from one photo and its edit: the untouched photo is "before", the edit "after"
  // (both use the same uploaded original).
  const setPairFrom = (item: PhotoItem, edit: PhotoEdit) => {
    const before: PhotoItem = { ...item, id: newId(), edit: null, dupOf: null, sameOriginalAs: null }
    const after: PhotoItem = { ...item, id: newId(), edit, dupOf: null, sameOriginalAs: before.id, processed: null }
    commit([before, after])
    setNotice('')
    display(before)
    display(after)
  }

  const reset = () => {
    displays.current.clear()
    commit([])
    setRejected([])
    setNotice('')
  }

  // Everything the upload queue needs for these items (the public copies are made if not ready).
  const forQueue = async (list: PhotoItem[], kind: 'album' | 'before_after'): Promise<NewPhoto[]> => {
    const out: NewPhoto[] = []
    for (const [i, it] of list.entries()) {
      const d = await display(it)
      out.push({
        key: it.id,
        name: it.name,
        thumb: it.edit?.uri ?? it.thumbUrl,
        original: { uri: it.asset.uri, type: it.asset.mimeType || it.asset.type || 'image/jpeg', ext: fileExtension(it.asset), size: it.size },
        sameOriginalAs: it.sameOriginalAs && list.some((x) => x.id === it.sameOriginalAs) ? it.sameOriginalAs : null,
        display: { uri: d.uri, width: d.width, height: d.height, size: d.size },
        exif: it.settings,
        recipe: it.edit?.recipe ?? null,
        pairRole: kind === 'before_after' ? (i === 0 ? 'before' : 'after') : null,
      })
    }
    return out
  }

  return {
    items, rejected, notice,
    add, remove, move, reorder, swapFirstTwo, setEdit, setPairFrom, reset, forQueue,
    dismissRejected: (id: string) => setRejected((r) => r.filter((x) => x.id !== id)),
    clearNotice: () => setNotice(''),
  }
}

export type PhotoItems = ReturnType<typeof usePhotoItems>
