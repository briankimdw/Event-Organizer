// Demo portfolio posts for the 34 test vendors (caterers, venues, DJs...), so Discover
// and Explore have something to show in every vertical, not just photography.
//
//   cd frontend
//   node scripts/seed-vendor-photos.mjs --dry-run           # print the plan (no key, no downloads)
//   node scripts/seed-vendor-photos.mjs --dry-run --check   # ...and check every photo URL answers (HEAD only)
//   node scripts/seed-vendor-photos.mjs                     # create the posts, then ask the ML service to analyse them
//   node scripts/seed-vendor-photos.mjs --remove            # delete the posts it created (rows + storage files)
//
//   --only=goldenspoon,djnova   limit to some vendors (usernames from docs/test-users.json)
//   --no-ml                     don't call the ML service at the end
//
// What it posts: scripts/vendor-photos.json (vendor -> albums -> photo ids). The photos are rows
// of services/ml/eval/manifest.csv: hand-checked Creative Commons photos from Flickr (CC BY 2.0,
// CC0 or public domain), NOT the vendors' own work. Every photo keeps its credit in
// photos.exif.credit ({ by, license, licenseUrl, url, source, demo }), which the post viewer
// shows as "Photo credit", and every caption starts with "Demo post" and names the creators.
// See docs/test-users.md ("Demo posts for vendors").
//
// Needs the vendor accounts first (scripts/seed-test-users.mjs) and the SERVER-ONLY service role
// key, read from SUPABASE_SERVICE_ROLE_KEY in the environment or services/ml/.env. It is never
// printed. Safe to run more than once: albums that already exist (same vendor + title) are skipped.
// Downloads go to a fresh temp folder that is deleted at the end; nothing in it is executed.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { getOccasion, getVertical } from '../src/verticals/catalog.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const dryRun = flag('dry-run')
const check = flag('check')
const remove = flag('remove')
const noMl = flag('no-ml')
const only = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length).split(',').filter(Boolean)

// Verticals whose work isn't really visual: they may have one post, or none.
const NON_VISUAL = new Set(['officiant', 'staffing', 'transportation', 'wellness'])
const DEMO_MARK = 'Demo post'
const MIN_PHOTOS = 3
const MAX_PHOTOS = 6
const MAX_BYTES = 15 * 1024 * 1024
const UA = { 'User-Agent': 'photomatch-demo-seed/1.0 (test data; https://github.com/briankimdw)' }

// ---- plan -------------------------------------------------------------------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const LICENSES = {
  'by 2.0': { label: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/', short: 'CC BY 2.0' },
  'cc0 1.0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', short: 'CC0' },
  'pdm 1.0': { label: 'Public Domain Mark 1.0', url: 'https://creativecommons.org/publicdomain/mark/1.0/', short: 'public domain' },
}

// The credit stored with each photo (photos.exif.credit) and shown by the post viewer.
export const creditOf = (row) => ({
  by: row.creator,
  license: LICENSES[row.license]?.label ?? row.license,
  licenseUrl: LICENSES[row.license]?.url ?? null,
  url: row.landing,
  source: 'Flickr',
  demo: true,
})

// Flickr size suffixes, largest first: _b (1024 px), _c (800 px), then the manifest's own URL (_n, 320 px).
const FLICKR = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_[a-z])?\.jpg$/
export const candidateUrls = (url) => {
  const m = FLICKR.exec(url)
  return m ? [...new Set([`${m[1]}_b.jpg`, `${m[1]}_c.jpg`, url])] : [url]
}

function loadPlan() {
  const file = JSON.parse(readFileSync(resolve(here, 'vendor-photos.json'), 'utf8'))
  const plan = file.vendors
  // Photos that must never be posted: another business's watermark, logo or signature.
  const excluded = new Map((file.excluded || []).map((x) => [x.id, x.reason]))
  const manifest = new Map(parseCsv(readFileSync(resolve(root, 'services/ml/eval/manifest.csv'), 'utf8')).map((r) => [r.id, r]))
  const people = JSON.parse(readFileSync(resolve(root, 'docs/test-users.json'), 'utf8'))
  const vendors = new Map((people.vendors || []).map((v) => [v.username, v]))
  return { plan, manifest, vendors, excluded }
}

// Every rule the plan must follow. Returns a list of problems (empty = fine).
export function checkPlan({ plan, manifest, vendors, excluded = new Map() }) {
  const problems = []
  const used = new Map()
  for (const [username, albums] of Object.entries(plan)) {
    const v = vendors.get(username)
    if (!v) { problems.push(`${username}: not a vendor in docs/test-users.json`); continue }
    const vertical = getVertical(v.vertical)
    if (!vertical) problems.push(`${username}: unknown vertical ${v.vertical}`)
    const services = new Set((vertical?.services || []).map((s) => s.slug))
    const titles = new Set()
    for (const a of albums) {
      const where = `${username} / "${a.title}"`
      if (!a.title || a.title.length > 120) problems.push(`${where}: title missing or too long`)
      if (titles.has(a.title)) problems.push(`${where}: duplicate title`)
      titles.add(a.title)
      if (!services.has(a.category)) problems.push(`${where}: category ${a.category} is not a ${v.vertical} service`)
      if (a.occasion && !getOccasion(a.occasion)) problems.push(`${where}: unknown occasion ${a.occasion}`)
      if (a.photos.length < MIN_PHOTOS || a.photos.length > MAX_PHOTOS) problems.push(`${where}: ${a.photos.length} photos (want ${MIN_PHOTOS}-${MAX_PHOTOS})`)
      for (const c of a.credits || []) if (!vendors.has(c.vendor) || c.vendor === username) problems.push(`${where}: bad credit ${c.vendor}`)
      for (const id of a.photos) {
        const row = manifest.get(id)
        if (!row) { problems.push(`${where}: photo ${id} is not in the manifest`); continue }
        if (used.has(id)) problems.push(`${where}: photo ${id} is already used by ${used.get(id)}`)
        if (excluded.has(id)) problems.push(`${where}: photo ${id} is excluded (${excluded.get(id)})`)
        used.set(id, where)
        if (!LICENSES[row.license]) problems.push(`${where}: photo ${id} has license "${row.license}"`)
        if (!row.creator || !/^https:\/\/www\.flickr\.com\/photos\//.test(row.landing)) problems.push(`${where}: photo ${id} has no creator or source page`)
      }
    }
  }
  for (const [username, v] of vendors) {
    const n = plan[username]?.length || 0
    if (!NON_VISUAL.has(v.vertical) && n < 2) problems.push(`${username} (${v.vertical}): ${n} albums; visual vendors need at least 2`)
    if (NON_VISUAL.has(v.vertical) && n > 1) problems.push(`${username} (${v.vertical}): non-visual vendors get at most 1 album`)
    if (n > 4) problems.push(`${username}: ${n} albums (max 4)`)
  }
  return problems
}

// "Demo post: ... Photos by A, B (CC BY 2.0); C (public domain), via Flickr. ..."
export function captionFor(album, manifest) {
  const byLicense = new Map()
  for (const id of album.photos) {
    const row = manifest.get(id)
    const key = LICENSES[row.license]?.short ?? row.license
    if (!byLicense.has(key)) byLicense.set(key, new Set())
    byLicense.get(key).add(row.creator)
  }
  const credits = [...byLicense].map(([lic, names]) => `${[...names].join(', ')} (${lic})`).join('; ')
  return `${DEMO_MARK}: sample photos for testing the app, not this vendor's own work. ` +
    `Photos by ${credits}, via Flickr. Each photo's credit and source link are in the post details.`
}

// ---- downloads --------------------------------------------------------------
// Width/height from a JPEG's SOF header.
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue }
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + len
  }
  return null
}

const isFlickrJpeg = (res) =>
  res.ok && /^image\/jpe?g/i.test(res.headers.get('content-type') || '') && new URL(res.url).hostname === 'live.staticflickr.com'

// Which size answers for this photo? (HEAD only, nothing is downloaded.)
async function probe(row) {
  for (const url of candidateUrls(row.url)) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: UA })
      if (isFlickrJpeg(res)) return url
    } catch { /* try the next size */ }
  }
  return null
}

// Download the largest available size into `dir`; returns { file, bytes, width, height, url }.
async function download(row, dir) {
  for (const url of candidateUrls(row.url)) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: UA })
      if (!isFlickrJpeg(res)) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > MAX_BYTES) continue
      const size = jpegSize(bytes)
      if (!size) continue // not a real JPEG
      const file = join(dir, `${row.id}.jpg`)
      writeFileSync(file, bytes)
      return { file, bytes, ...size, url }
    } catch { /* try the next size */ }
  }
  throw new Error(`could not download photo ${row.id} (${row.landing})`)
}

// ---- dry run ----------------------------------------------------------------
async function printPlan(ctx) {
  const { plan, manifest, vendors } = ctx
  const stats = { vendors: 0, albums: 0, photos: 0, licenses: {}, sizes: {}, failed: [] }
  for (const [username, albums] of Object.entries(plan)) {
    if (only.length && !only.includes(username)) continue
    const v = vendors.get(username)
    stats.vendors++
    console.log(`\n${v.business} (${username} · ${v.vertical})`)
    for (const [k, a] of albums.entries()) {
      stats.albums++
      const service = getVertical(v.vertical).services.find((s) => s.slug === a.category)?.name
      const tags = [service, a.occasion && getOccasion(a.occasion).name].filter(Boolean).join(' · ')
      const credits = (a.credits || []).map((c) => `${c.vendor}${c.role ? ` (${c.role})` : ''}`).join(', ')
      console.log(`  ${k + 1}. ${a.title}  [${tags}]  ${a.photos.length} photos${credits ? `  · credits: ${credits}` : ''}`)
      for (const id of a.photos) {
        const row = manifest.get(id)
        const c = creditOf(row)
        stats.photos++
        stats.licenses[c.license] = (stats.licenses[c.license] || 0) + 1
        let size = ''
        if (check) {
          const url = await probe(row)
          const suffix = url ? (/_([bc])\.jpg$/.exec(url)?.[1] ?? 'n') : 'MISSING'
          stats.sizes[suffix] = (stats.sizes[suffix] || 0) + 1
          if (!url) stats.failed.push(`${username} / ${a.title}: ${id}`)
          size = `  [${suffix === 'MISSING' ? 'MISSING' : `_${suffix}`}]`
        }
        console.log(`       ${id.slice(0, 8)}  ${c.by} · ${c.license} · ${c.url}${size}`)
      }
    }
  }
  console.log(`\nPlan: ${stats.vendors} vendors, ${stats.albums} albums, ${stats.photos} photos (each photo used once).`)
  console.log(`Licenses: ${Object.entries(stats.licenses).map(([k, n]) => `${k} ${n}`).join(', ')}`)
  const without = [...vendors.keys()].filter((u) => !plan[u])
  if (without.length) console.log(`No posts (not visual enough): ${without.join(', ')}`)
  if (check) {
    console.log(`Sizes that answer: ${Object.entries(stats.sizes).map(([k, n]) => `${k === 'MISSING' ? k : `_${k}`} ${n}`).join(', ')}`)
    if (stats.failed.length) {
      console.log(`Not reachable:\n  ${stats.failed.join('\n  ')}`)
      process.exitCode = 1
    }
  }
  console.log('Dry run: nothing was downloaded or written.')
}

// ---- database ---------------------------------------------------------------
const fileEnv = (path) =>
  existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_]+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}

async function connect() {
  const mlEnv = fileEnv(resolve(root, 'services/ml/.env'))
  const frontEnv = fileEnv(resolve(root, 'frontend/.env.local'))
  const url = process.env.SUPABASE_URL || mlEnv.SUPABASE_URL || frontEnv.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || mlEnv.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in services/ml/.env; see .env.example).')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return { db, mlEnv }
}

const must = ({ data, error }) => {
  if (error) throw error
  return data
}

const isMissingTable = (err) => !!err && (err.code === 'PGRST205' || err.code === '42P01')

async function providerOf(db, vendor) {
  return must(await db.from('providers').select('id, profile_id').eq('slug', vendor.slug).maybeSingle())
}

async function occasionTagId(db, slug) {
  const tagSlug = `occasion-${slug}`
  const found = must(await db.from('tags').select('id').eq('slug', tagSlug).maybeSingle())
  if (found) return found.id
  return must(await db.from('tags').insert({ slug: tagSlug, name: getOccasion(slug)?.name || slug, kind: 'user' }).select('id').single()).id
}

async function removeFiles(db, paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from('portfolio').remove(paths.slice(i, i + 100))
    if (error) console.warn(`  ! could not remove ${Math.min(100, paths.length - i)} storage file(s): ${error.message}`)
  }
}

async function seed(ctx) {
  const { plan, manifest, vendors } = ctx
  const { db, mlEnv } = await connect()
  const cats = must(await db.from('service_categories').select('id, slug'))
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]))
  const tmp = mkdtempSync(join(tmpdir(), 'seed-vendor-photos-'))
  const stats = { albums: 0, photos: 0, skipped: 0, failed: 0, missingVendors: [] }
  const providerIds = new Map()
  let creditsOk = true
  try {
    for (const [username, albums] of Object.entries(plan)) {
      if (only.length && !only.includes(username)) continue
      const v = vendors.get(username)
      const provider = await providerOf(db, v)
      if (!provider) {
        stats.missingVendors.push(username)
        console.log(`? ${v.business}: no listing yet (run scripts/seed-test-users.mjs first), skipped`)
        continue
      }
      providerIds.set(username, provider.id)
      let line = `= ${v.business.padEnd(28)}`
      for (const a of albums) {
        const existing = must(await db.from('albums').select('id').eq('provider_id', provider.id).eq('title', a.title).maybeSingle())
        if (existing) { stats.skipped++; continue }
        const uploaded = []
        let albumId = null
        try {
          const files = await Promise.all(a.photos.map((id) => download(manifest.get(id), tmp)))
          albumId = must(await db.from('albums').insert({
            provider_id: provider.id,
            category_id: catId[a.category] ?? null,
            title: a.title,
            caption: captionFor(a, manifest),
            location_text: v.city || null,
            kind: 'album',
          }).select('id').single()).id
          let cover = null
          for (const [i, id] of a.photos.entries()) {
            const f = files[i]
            const path = `${provider.profile_id}/${albumId}/${randomUUID()}.jpg`
            must(await db.storage.from('portfolio').upload(path, f.bytes, { contentType: 'image/jpeg', cacheControl: '31536000' }))
            uploaded.push(path)
            const photo = must(await db.from('photos').insert({
              album_id: albumId,
              owner_id: provider.profile_id,
              position: i,
              display_path: path,
              width: f.width,
              height: f.height,
              exif: { credit: creditOf(manifest.get(id)) },
            }).select('id').single())
            cover ??= photo.id
            rmSync(f.file, { force: true })
          }
          must(await db.from('albums').update({ cover_photo_id: cover }).eq('id', albumId))
          if (a.occasion) {
            must(await db.from('album_tags').upsert({ album_id: albumId, tag_id: await occasionTagId(db, a.occasion) }, { ignoreDuplicates: true }))
          }
          stats.albums++
          stats.photos += a.photos.length
          line += ' +'
        } catch (err) {
          stats.failed++
          console.warn(`  ! ${v.business} / ${a.title}: ${err.message}`)
          if (albumId) await db.from('albums').delete().eq('id', albumId)
          if (uploaded.length) await removeFiles(db, uploaded)
        }
      }
      console.log(line)
    }

    // Credits (other vendors tagged on a post), once every vendor's listing is known.
    // Skipped quietly until the post_credits migration is applied.
    for (const [username, albums] of Object.entries(plan)) {
      if (!creditsOk || !providerIds.has(username)) continue
      for (const a of albums.filter((x) => x.credits?.length)) {
        const album = must(await db.from('albums').select('id').eq('provider_id', providerIds.get(username)).eq('title', a.title).maybeSingle())
        if (!album) continue
        const rows = []
        for (const c of a.credits) {
          const pid = providerIds.get(c.vendor) ?? (await providerOf(db, vendors.get(c.vendor)))?.id
          if (pid) rows.push({ album_id: album.id, provider_id: pid, role: c.role || null })
        }
        if (!rows.length) continue
        const { error } = await db.from('album_credits').upsert(rows, { onConflict: 'album_id,provider_id', ignoreDuplicates: true })
        if (isMissingTable(error)) { creditsOk = false; console.log('(credits skipped: album_credits isn’t in the database yet)') }
        else if (error) console.warn(`  ! credits for ${a.title}: ${error.message}`)
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log(`\nDone: ${stats.albums} albums / ${stats.photos} photos added, ${stats.skipped} already there, ${stats.failed} failed.`)
  if (stats.missingVendors.length) console.log(`Missing listings: ${stats.missingVendors.join(', ')}`)
  if (!noMl) await analyse(mlEnv)
}

// Ask the running ML service to embed + tag the new photos (POST /process-pending).
async function analyse(mlEnv) {
  const base = (process.env.ML_URL || 'http://localhost:8000').replace(/\/$/, '')
  const secret = process.env.ML_WEBHOOK_SECRET || mlEnv.ML_WEBHOOK_SECRET
  const fallback = 'cd ../services/ml && .venv/Scripts/python -m app.worker --once   (macOS/Linux: .venv/bin/python)'
  if (!secret) {
    console.log(`\nNext: analyse the new photos with SigLIP (ML_WEBHOOK_SECRET isn't set, so the service wasn't called):\n  ${fallback}`)
    return
  }
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) })
    if (!health.ok) throw new Error(`health ${health.status}`)
    console.log(`\nAnalysing new photos with the ML service at ${base} (this can take a few minutes)...`)
    const res = await fetch(`${base}/process-pending`, { method: 'POST', headers: { 'X-ML-Secret': secret }, signal: AbortSignal.timeout(30 * 60 * 1000) })
    if (!res.ok) throw new Error(`process-pending answered ${res.status}`)
    const body = await res.json()
    console.log(`ML: ${body.analysed} photos analysed. Discover can rank them now.`)
  } catch (err) {
    console.log(`\nCouldn't reach the ML service at ${base} (${err.message}). Analyse the photos with:\n  ${fallback}`)
  }
}

async function removeAll(ctx) {
  const { plan, vendors } = ctx
  const { db } = await connect()
  let albums = 0
  let files = 0
  for (const [username, planned] of Object.entries(plan)) {
    if (only.length && !only.includes(username)) continue
    const provider = await providerOf(db, vendors.get(username))
    if (!provider) continue
    const rows = must(await db.from('albums').select('id, caption, photos!photos_album_id_fkey(display_path, original_path)')
      .eq('provider_id', provider.id).in('title', planned.map((a) => a.title)))
    const mine = rows.filter((r) => (r.caption || '').startsWith(DEMO_MARK)) // never touch a post someone wrote by hand
    if (!mine.length) continue
    const paths = mine.flatMap((r) => r.photos.flatMap((p) => [p.display_path, p.original_path])).filter(Boolean)
    must(await db.from('albums').delete().in('id', mine.map((r) => r.id))) // photos, embeddings, tags and credits cascade
    await removeFiles(db, paths)
    albums += mine.length
    files += paths.length
    console.log(`- ${vendors.get(username).business}: ${mine.length} demo posts removed`)
  }
  console.log(`\nRemoved ${albums} demo posts and ${files} storage files.`)
}

// ---- run --------------------------------------------------------------------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const ctx = loadPlan()
  const unknown = only.filter((u) => !ctx.plan[u])
  if (unknown.length) {
    console.error(`--only: no demo posts planned for ${unknown.join(', ')}`)
    process.exit(1)
  }
  const problems = checkPlan(ctx)
  if (problems.length) {
    console.error(`vendor-photos.json has problems:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  if (dryRun) await printPlan(ctx)
  else if (remove) await removeAll(ctx)
  else await seed(ctx)
}

export { loadPlan, jpegSize }
