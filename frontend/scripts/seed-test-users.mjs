// Create the fake test users from docs/test-users.json in your Supabase project.
//
//   cd frontend
//   node scripts/seed-test-users.mjs                 # accounts + profiles + photographer listings
//   node scripts/seed-test-users.mjs --with-photos   # ...plus sample albums for each photographer
//
// Needs the SERVER-ONLY service role key, read from SUPABASE_SERVICE_ROLE_KEY in the
// environment or from services/ml/.env. It is never printed. Safe to run more than
// once: anything that already exists is skipped.
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const withPhotos = process.argv.includes('--with-photos')

// ---- config -----------------------------------------------------------------
const fileEnv = (path) =>
  existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_]+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}
const mlEnv = fileEnv(resolve(root, 'services/ml/.env'))
const frontEnv = fileEnv(resolve(root, 'frontend/.env.local'))
const url = process.env.SUPABASE_URL || mlEnv.SUPABASE_URL || frontEnv.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || mlEnv.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in services/ml/.env; see .env.example).')
  process.exit(1)
}
const dataPath = resolve(root, 'docs/test-users.json')
if (!existsSync(dataPath)) {
  console.error('Missing docs/test-users.json')
  process.exit(1)
}
const data = JSON.parse(readFileSync(dataPath, 'utf8'))
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const must = ({ data: d, error }) => {
  if (error) throw error
  return d
}

// ---- users ------------------------------------------------------------------
async function findUserByEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }))
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit || users.length < 200) return hit ?? null
  }
  return null
}

async function ensureUser(person) {
  const { data: created, error } = await db.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true, // treat as confirmed: these addresses can't receive mail
    user_metadata: { full_name: person.name, username: person.username },
  })
  let user = created?.user
  let isNew = true
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error
    user = await findUserByEmail(person.email)
    isNew = false
    if (!user) throw new Error(`${person.email} exists but couldn't be found`)
  }
  // The signup trigger made the profile; make sure name/username/city/bio match the doc.
  must(await db.from('profiles').update({
    display_name: person.name,
    username: person.username,
    city: person.city ?? null,
    bio: person.bio ?? null,
  }).eq('id', user.id))
  return { user, isNew }
}

// ---- photographer listings --------------------------------------------------
let refs
async function loadRefs() {
  const cats = must(await db.from('service_categories').select('id, slug'))
  const policy = must(await db.from('cancellation_policies').select('id').is('provider_id', null).eq('name', 'Moderate').maybeSingle())
  refs = { cat: Object.fromEntries(cats.map((c) => [c.slug, c.id])), policyId: policy?.id ?? null }
}

async function ensureProvider(person, userId) {
  const existing = must(await db.from('providers').select('id').eq('profile_id', userId).maybeSingle())
  if (existing) return { id: existing.id, isNew: false }
  const provider = must(await db.from('providers').insert({
    profile_id: userId,
    vertical_id: refs.cat.photography,
    display_name: person.name,
    slug: person.slug,
    city: person.city,
    bio: person.bio,
    status: 'active',
    cancellation_policy_id: refs.policyId,
  }).select('id').single())
  must(await db.from('provider_private').insert({ provider_id: provider.id }))
  const services = (person.services || []).filter((s) => refs.cat[s]).map((s) => ({ provider_id: provider.id, category_id: refs.cat[s] }))
  if (services.length) must(await db.from('provider_services').insert(services))
  return { id: provider.id, isNew: true }
}

// ---- sample albums (--with-photos) -----------------------------------------
// Random free photos from picsum.photos (Unsplash). Their content won't match the
// album titles; SigLIP will tag them by what they actually show.
async function downloadPhoto(seed, { grayscale = false, blur = false } = {}) {
  const query = [grayscale && 'grayscale', blur && 'blur=2'].filter(Boolean).join('&')
  const res = await fetch(`https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/1500${query ? `?${query}` : ''}`)
  if (!res.ok) throw new Error(`photo download failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

async function ensureAlbum(person, userId, providerId, plan) {
  const existing = must(await db.from('albums').select('id').eq('provider_id', providerId).eq('title', plan.title).maybeSingle())
  if (existing) return 0
  const beforeAfter = plan.kind === 'before_after'
  const album = must(await db.from('albums').insert({
    provider_id: providerId,
    category_id: refs.cat[plan.category] ?? null,
    title: plan.title,
    location_text: person.city,
    kind: beforeAfter ? 'before_after' : 'album',
  }).select('id').single())

  const count = beforeAfter ? 2 : plan.count
  let cover = null
  for (let i = 0; i < count; i++) {
    const seed = beforeAfter ? `${person.slug}-${plan.title}` : `${person.slug}-${plan.title}-${i}`
    // Before/after: same picture; the "before" is a soft, ungraded version.
    const bytes = await downloadPhoto(seed, { grayscale: plan.grayscale, blur: beforeAfter && i === 0 })
    const path = `${userId}/${album.id}/${randomUUID()}.jpg`
    must(await db.storage.from('portfolio').upload(path, bytes, { contentType: 'image/jpeg' }))
    const photo = must(await db.from('photos').insert({
      album_id: album.id,
      owner_id: userId,
      position: i,
      display_path: path,
      width: 1200,
      height: 1500,
      pair_role: beforeAfter ? (i === 0 ? 'before' : 'after') : null,
      exif: {},
    }).select('id').single())
    if (i === 0 || (beforeAfter && i === 1)) cover = photo.id
  }
  must(await db.from('albums').update({ cover_photo_id: cover }).eq('id', album.id))
  return count
}

// ---- run --------------------------------------------------------------------
const stats = { created: 0, existing: 0, providers: 0, albums: 0, photos: 0 }
await loadRefs()

for (const person of data.photographers) {
  const { user, isNew } = await ensureUser(person)
  stats[isNew ? 'created' : 'existing']++
  const provider = await ensureProvider(person, user.id)
  if (provider.isNew) stats.providers++
  let line = `${isNew ? '+' : '='} ${person.name.padEnd(14)} photographer${provider.isNew ? ' (listing created)' : ''}`
  if (withPhotos) {
    for (const plan of person.albums || []) {
      const added = await ensureAlbum(person, user.id, provider.id, plan)
      if (added) {
        stats.albums++
        stats.photos += added
      }
    }
    line += ' · albums ok'
  }
  console.log(line)
}

for (const person of data.clients) {
  const { isNew } = await ensureUser(person)
  stats[isNew ? 'created' : 'existing']++
  console.log(`${isNew ? '+' : '='} ${person.name.padEnd(14)} client`)
}

console.log(
  `\nDone: ${stats.created} users created, ${stats.existing} already existed, ${stats.providers} photographer listings created` +
    (withPhotos ? `, ${stats.albums} albums / ${stats.photos} photos added.` : '.'),
)
if (withPhotos && stats.photos) {
  console.log('Next: analyse the new photos with SigLIP:  cd ../services/ml && .venv/Scripts/python -m app.worker --once')
}
