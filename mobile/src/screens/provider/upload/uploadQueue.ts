// The upload queue: posts survive leaving the screen, losing the network and closing the app.
//
//   enqueuePost(input)          copy the photos into the app's documents folder, save the job
//                               (AsyncStorage `pm:upload-queue:v1`) and start uploading
//   useUploadJobs(userId)       the user's jobs, live (per-photo stage + fraction)
//   resumeJobs(userId)          continue jobs that stopped (app closed / offline); New post and
//                               My work call it when they open, and it runs again whenever the
//                               app comes back to the foreground
//   retryJob(id) / cancelJob(id) / dismissJob(id)
//
// A job runs the shared step-by-step posting API (api/portfolio.js: createPostDraft ->
// uploadPostPhoto per photo -> publishPost) and records each finished photo, so a resumed job
// skips what's done; the post stays hidden until it's complete. Two photos upload
// at a time. iOS / Android pause JavaScript shortly after the app goes to the background (Expo
// Go has no background upload task): in-flight requests then fail as "network" and the job
// continues on its own when the app is opened again. Cancel removes the half-made post.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'

import { invalidate } from '@shared/api/catalog.js'
import { forgetBeforePhoto } from '@/lib/beforeAfter'
import { createPostDraft, discardPostDraft, getPostPhotos, isCancelled, publishPost, uploadPostPhoto } from '@shared/api/portfolio.js'
import { blobOfUri, fileBlob } from '@/shims/images'

export type AlbumFields = { title: string; caption?: string; location?: string; shotOn?: string; categoryId?: string | null }

const KEY = 'pm:upload-queue:v1'

export type QStage = 'waiting' | 'uploading' | 'saving' | 'done' | 'failed'
export type QPhoto = {
  key: string
  name: string
  thumb: string | null
  original: { uri: string; type: string; ext: string; size: number }
  /** Reuse another photo's uploaded original (a before & after made from one photo + its edit). */
  sameOriginalAs?: string | null
  display: { uri: string; width: number; height: number; size: number }
  exif: Record<string, string>
  recipe?: unknown | null
  pairRole: 'before' | 'after' | null
  stage: QStage
  fraction: number
  photoId?: string | null
  originalPath?: string | null
  error?: string | null
}
export type JobStatus = 'running' | 'paused' | 'failed' | 'done' | 'cancelling'
export type Job = {
  id: string
  userId: string
  providerId: string
  kind: 'album' | 'before_after'
  fields: AlbumFields
  hiddenFields: string[]
  photos: QPhoto[]
  albumId: string | null
  status: JobStatus
  error: string | null
  /** The last failure was the network (or the app going away): continue on its own. */
  offline?: boolean
  createdAt: number
  doneAt?: number
}

export type NewPhoto = Omit<QPhoto, 'stage' | 'fraction' | 'originalPath' | 'photoId' | 'error'>
export type NewPost = Omit<Job, 'id' | 'photos' | 'albumId' | 'status' | 'error' | 'createdAt'> & { photos: NewPhoto[] }

// ---- state ----

let jobs: Job[] = []
let hydrated: Promise<void> | null = null
const listeners = new Set<() => void>()
const running = new Map<string, AbortController>()

const emit = () => listeners.forEach((l) => l())
let saveTimer: ReturnType<typeof setTimeout> | null = null
const save = (now = false) => {
  if (saveTimer) clearTimeout(saveTimer)
  const write = () => {
    saveTimer = null
    AsyncStorage.setItem(KEY, JSON.stringify(jobs)).catch((e) => console.warn('upload queue save', e))
  }
  if (now) write()
  else saveTimer = setTimeout(write, 400)
}
const update = (id: string, fn: (j: Job) => Job, persist: boolean | 'now' = true) => {
  jobs = jobs.map((j) => (j.id === id ? fn(j) : j))
  emit()
  if (persist) save(persist === 'now')
}
const patchPhoto = (id: string, key: string, fields: Partial<QPhoto>, persist: boolean | 'now' = false) =>
  update(id, (j) => ({ ...j, photos: j.photos.map((p) => (p.key === key ? { ...p, ...fields } : p)) }), persist)
const get = (id: string) => jobs.find((j) => j.id === id)

function hydrate() {
  hydrated ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const saved: Job[] = raw ? JSON.parse(raw) : []
      // This is a fresh start of the app: anything "running" was cut off.
      const fresh = saved.map((j) => (j.status === 'running' || j.status === 'cancelling'
        ? { ...j, status: j.status === 'cancelling' ? 'cancelling' as const : 'paused' as const, offline: true }
        : j))
      // Keep finished jobs for a day (the success banner), then forget them and their files.
      const stale = (j: Job) => j.status === 'done' && Date.now() - (j.doneAt || 0) > 864e5
      fresh.filter(stale).forEach((j) => dropFiles(j.id))
      jobs = [...fresh.filter((j) => !stale(j)), ...jobs.filter((j) => !fresh.some((f) => f.id === j.id))]
      emit()
    })
    .catch((e) => console.warn('upload queue load', e))
  return hydrated
}

// ---- local files (kept until the job is done or cancelled) ----

const fs = () => (Platform.OS === 'web' ? null : (require('expo-file-system') as typeof import('expo-file-system')))

async function keepFile(uri: string, jobId: string, name: string) {
  const FS = fs()
  if (!FS || !uri.startsWith('file:')) return uri
  try {
    const dir = new FS.Directory(FS.Paths.document, 'pm-uploads', jobId)
    dir.create({ intermediates: true, idempotent: true })
    const dest = new FS.File(dir, name)
    if (dest.exists) dest.delete()
    await new FS.File(uri).copy(dest)
    return dest.uri
  } catch (e) {
    console.warn('upload queue: could not keep a copy', e)
    return uri // the cache copy usually survives too
  }
}

function dropFiles(jobId: string) {
  const FS = fs()
  if (!FS) return
  try {
    const dir = new FS.Directory(FS.Paths.document, 'pm-uploads', jobId)
    if (dir.exists) dir.delete()
  } catch { /* nothing to clean */ }
}

// Is a kept file still there? (On the web target, blob: URLs die with the page.)
async function stillHere(uri: string) {
  const FS = fs()
  try {
    if (FS && uri.startsWith('file:')) return new FS.File(uri).exists
    if (uri.startsWith('blob:')) {
      await fetch(uri)
      return true
    }
  } catch {
    return false
  }
  return true
}

// ---- public API ----

const newId = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export async function enqueuePost(input: NewPost) {
  await hydrate()
  const id = newId()
  const photos: QPhoto[] = []
  for (const [i, p] of input.photos.entries()) {
    const display = { ...p.display, uri: await keepFile(p.display.uri, id, `${i}-display.jpg`) }
    photos.push({
      ...p,
      original: p.sameOriginalAs ? p.original : { ...p.original, uri: await keepFile(p.original.uri, id, `${i}-original.${p.original.ext}`) },
      display,
      thumb: display.uri, // survives an app restart (the picker's thumbnail may not)
      stage: 'waiting',
      fraction: 0,
      photoId: null,
      error: null,
    })
  }
  activeUser = input.userId
  const job: Job = { ...input, id, photos, albumId: null, status: 'running', error: null, createdAt: Date.now() }
  jobs = [...jobs, job]
  emit()
  save(true)
  run(id)
  return id
}

let activeUser: string | null = null

export async function resumeJobs(userId: string) {
  activeUser = userId
  await hydrate()
  for (const j of jobs) {
    if (j.userId !== userId) continue
    if (j.status === 'cancelling') cancelJob(j.id)
    else if (j.status === 'paused' || (j.status === 'failed' && j.offline)) run(j.id)
  }
}

export function retryJob(id: string) {
  const j = get(id)
  if (j && j.status !== 'done' && j.status !== 'cancelling') run(id)
}

export async function cancelJob(id: string) {
  const j = get(id)
  if (!j) return
  running.get(id)?.abort()
  update(id, (x) => ({ ...x, status: 'cancelling' }), 'now')
  // Wait for the in-flight steps to stop, then undo what was made.
  for (let i = 0; i < 50 && running.has(id); i++) await new Promise((r) => setTimeout(r, 100))
  const cur = get(id)!
  try {
    if (cur.albumId) await discardPostDraft(cur.albumId)
  } catch (e) {
    console.warn('cancel post', e)
  }
  dropFiles(id)
  jobs = jobs.filter((x) => x.id !== id)
  emit()
  save(true)
  invalidate('providers')
}

export function dismissJob(id: string) {
  const j = get(id)
  if (!j || (j.status !== 'done')) return
  jobs = jobs.filter((x) => x.id !== id)
  dropFiles(id)
  emit()
  save(true)
}

export function useUploadJobs(userId: string | null | undefined) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    hydrate()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return userId ? jobs.filter((j) => j.userId === userId) : []
}

export const getJob = (id: string | null | undefined) => (id ? get(id) ?? null : null)

// Overall progress of a job, 0..1, weighted by bytes.
export function jobFraction(j: Job) {
  let sum = 0
  let total = 0
  for (const p of j.photos) {
    const w = p.display.size + (p.sameOriginalAs ? 0 : p.original.size) + 50_000
    total += w
    sum += w * (p.stage === 'done' ? 1 : p.fraction)
  }
  return total ? sum / total : 0
}

// ---- the runner ----
// Steps (shared api/portfolio.js): createPostDraft (hidden until done) -> uploadPostPhoto per photo
// (2 at a time; it retries hiccups and cleans up its own files when it fails) -> publishPost.
// A resumed job first asks the database which photos already made it (getPostPhotos, by position),
// so a photo whose row was saved just before the app closed isn't posted twice.

async function run(id: string) {
  if (running.has(id)) return
  const ctl = new AbortController()
  running.set(id, ctl)
  update(id, (j) => ({ ...j, status: 'running', error: null, offline: false, photos: j.photos.map((p) => (p.stage === 'failed' ? { ...p, stage: 'waiting', error: null } : p)) }), 'now')
  try {
    let j = get(id)!
    if (!j.albumId) {
      const albumId: string = await createPostDraft({ providerId: j.providerId, kind: j.kind, ...j.fields } as any)
      update(id, (x) => ({ ...x, albumId }), 'now')
    } else {
      // Resuming: photos saved before the app went away count as done.
      const rows: { id: string; position: number; original_path: string | null }[] = await getPostPhotos(j.albumId).catch(() => [])
      for (const r of rows) {
        const p = j.photos[r.position]
        if (p && !p.photoId) patchPhoto(id, p.key, { stage: 'done', fraction: 1, photoId: r.id, originalPath: r.original_path }, true)
      }
    }
    j = get(id)!
    const albumId = j.albumId!

    // Photos that reuse another photo's original wait for it.
    const originals = new Map<string, { promise: Promise<string>; resolve: (v: string) => void; reject: (e: unknown) => void }>()
    for (const p of j.photos) {
      if (p.sameOriginalAs) continue
      let resolve!: (v: string) => void
      let reject!: (e: unknown) => void
      const promise = new Promise<string>((a, b) => { resolve = a; reject = b })
      promise.catch(() => {})
      if (p.photoId && p.originalPath) resolve(p.originalPath)
      originals.set(p.key, { promise, resolve, reject })
    }

    const one = async (i: number) => {
      const p = get(id)!.photos[i]
      if (p.stage === 'done' && p.photoId) return
      const own = originals.get(p.key)
      try {
        const originalPath = p.sameOriginalAs ? await originals.get(p.sameOriginalAs)?.promise : null
        patchPhoto(id, p.key, { stage: 'uploading', fraction: 0.02 })
        if (!(await stillHere(p.display.uri)) || (!p.sameOriginalAs && !(await stillHere(p.original.uri)))) {
          throw Object.assign(new Error('This photo is no longer on this device. Cancel this post and post it again.'), { missing: true })
        }
        const [file, display] = await Promise.all([
          fileBlob(p.original.uri, `${p.key}.${p.original.ext}`, p.original.type || 'image/jpeg'),
          blobOfUri(p.display.uri),
        ])
        const res = await uploadPostPhoto({
          userId: j.userId, albumId, position: i, hiddenFields: j.hiddenFields, originalPath: originalPath ?? null, signal: ctl.signal,
          item: { file, display: { blob: display, width: p.display.width, height: p.display.height }, settings: p.exif, recipe: p.recipe ?? null, pairRole: p.pairRole },
          onProgress: (pr: { stage: string; fraction: number }) => patchPhoto(id, p.key, {
            stage: pr.stage === 'saving' ? 'saving' : pr.stage === 'done' ? 'done' : 'uploading', fraction: Math.max(0.02, pr.fraction),
          }),
        } as any)
        patchPhoto(id, p.key, { stage: 'done', fraction: 1, photoId: res.photoId, originalPath: res.originalPath }, 'now')
        own?.resolve(res.originalPath)
      } catch (err: any) {
        own?.reject(err)
        if (!isCancelled(err)) patchPhoto(id, p.key, { stage: 'failed', fraction: 0, error: friendly(err) }, true) // its partial files were removed
        throw err
      }
    }

    let next = 0
    let failure: any = null
    // Owners of an original first, so the photos that share it never wait on a later slot.
    const order = j.photos.map((p, i) => ({ p, i })).sort((a, b) => Number(!!a.p.sameOriginalAs) - Number(!!b.p.sameOriginalAs)).map((x) => x.i)
    const worker = async () => {
      while (!failure && next < order.length) {
        const i = order[next++]
        try {
          await one(i)
        } catch (err) {
          failure ??= err
        }
      }
    }
    await Promise.all([worker(), worker()])
    if (failure) throw failure

    const done = get(id)!
    const coverIdx = done.kind === 'before_after' ? Math.max(0, done.photos.findIndex((p) => p.pairRole === 'after')) : 0
    await publishPost(albumId, { coverPhotoId: done.photos[coverIdx]?.photoId ?? done.photos[0]?.photoId ?? null } as any)
    running.delete(id)
    update(id, (x) => ({ ...x, status: 'done', doneAt: Date.now() }), 'now') // its files stay for the success screen until dismissed
    invalidate('providers')
    forgetBeforePhoto(albumId)
  } catch (err: any) {
    running.delete(id)
    if (isCancelled(err) || get(id)?.status === 'cancelling') return
    const offline = !err?.missing && (!!err?.network || !!err?.retryable || /network request failed|failed to fetch|network/i.test(err?.message || ''))
    console.warn('upload job', err)
    update(id, (x) => ({ ...x, status: 'failed', offline, error: friendly(err) }), 'now')
  }
}

const friendly = (err: any) => {
  const msg = err?.message || ''
  if (err?.network || /failed to fetch|network request failed|load failed/i.test(msg)) return 'Network problem. It continues when you’re back online.'
  if (/jwt|not authenticated|row-level security/i.test(msg)) return 'Your session expired. Sign in again, then retry.'
  return msg || 'Something went wrong.'
}

// Back in the foreground: continue anything that stopped because the app went away / offline.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return
    for (const j of jobs) if (j.userId === activeUser && ((j.status === 'failed' && j.offline) || j.status === 'paused')) run(j.id)
  })
}
