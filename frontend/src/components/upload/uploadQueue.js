// The post being uploaded, saved in this browser (IndexedDB) so it can be finished if the
// tab closes or the connection drops mid-upload. One record per signed-in user.
//
// record: { userId, providerId, albumId, kind, meta: { title, caption, location, shotOn, categoryId },
//           hiddenFields, savedAt,
//           items: [{ key, name, position, file (Blob, the original), display (Blob), thumb (small Blob), width, height,
//                     settings, recipe, pairRole, owner (key of the item whose original it shares) | null,
//                     state: 'pending' | 'done', photoId, originalPath }] }
// Every call is best effort: storage can be full, blocked or unavailable (private windows),
// and then resuming just isn't offered.
const DB = 'pm-posting'
const STORE = 'queue'
const keyOf = (userId) => `post:${userId}`

let dbPromise = null
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'))
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

async function tx(mode, fn) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function saveQueue(record) {
  try {
    await tx('readwrite', (s) => s.put({ ...record, savedAt: Date.now() }, keyOf(record.userId)))
    return true
  } catch {
    return false
  }
}

export async function loadQueue(userId) {
  try {
    const rec = await tx('readonly', (s) => s.get(keyOf(userId)))
    if (!rec || !Array.isArray(rec.items) || !rec.items.length) return null
    // Older than two weeks: not worth offering.
    if (Date.now() - (rec.savedAt || 0) > 14 * 86400000) return null
    return rec
  } catch {
    return null
  }
}

export async function clearQueue(userId) {
  try {
    await tx('readwrite', (s) => s.delete(keyOf(userId)))
  } catch { /* nothing saved */ }
}

// Mark items done (or change any fields) in the saved record. patch: { [key]: fields }.
// Done items drop their files: they're uploaded.
export async function patchQueue(userId, patch, fields = {}) {
  try {
    const rec = await tx('readonly', (s) => s.get(keyOf(userId)))
    if (!rec) return
    rec.items = rec.items.map((it) => {
      const p = patch[it.key]
      if (!p) return it
      const next = { ...it, ...p }
      if (next.state === 'done') {
        // Uploaded: only the small thumbnail is kept (a photo sharing this original reuses
        // its uploaded path, not the file).
        next.file = null
        next.display = null
      }
      return next
    })
    Object.assign(rec, fields)
    await tx('readwrite', (s) => s.put({ ...rec, savedAt: Date.now() }, keyOf(userId)))
  } catch { /* best effort */ }
}
