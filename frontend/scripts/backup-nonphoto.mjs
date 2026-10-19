// Back up everything the photography-only cleanup deletes, BEFORE running it.
//
//   cd frontend
//   node scripts/backup-nonphoto.mjs --dry-run     # without the key: the plan; with it: row counts, nothing written
//   node scripts/backup-nonphoto.mjs               # rows (JSON) + their Storage files
//   node scripts/backup-nonphoto.mjs --no-files    # rows only (no downloads)
//   node scripts/backup-nonphoto.mjs --out=<dir>   # somewhere else than archive/event-platform/data-backup/
//
// Writes archive/event-platform/data-backup/<timestamp>/ (git-ignored: it holds user data):
//   tables/<table>.json   every row the cleanup deletes or changes, per table
//   storage-paths.json    { bucket: [paths] } of the files that belong to those rows / accounts
//   files/<bucket>/<path> the files themselves (unless --no-files)
//   manifest.json         when, which project, row counts, what was selected and why
//
// What is selected (see supabase/migrations/20261018000000_photography_only.sql and
// frontend/scripts/delete-nonphoto-users.mjs for what then happens to it):
//   1. every listing outside photography (the 32 vendors of the archived verticals, and
//      the 2 videographers, whose listings the migration merges into photography) and
//      everything hanging off them: private row, services, policies, packages, add-ons,
//      hours, blocked days, posts, photos, embeddings, post tags, collection entries,
//      bookings (+ offers, history, add-ons, reviews, booking chats), inquiries, swipes,
//      follows, shortlist entries, "Not into this" entries, chat messages sharing them;
//   2. the 32 vendor ACCOUNTS (archive/event-platform/docs/test-users-vendors.json) and
//      their rows as people: profile, bookings as a client, messages, chat memberships,
//      swipes, follows, shortlist, collections, notifications, reports, blocks, reviews;
//   3. events with friends: every event, member, candidate, vote, event chat, event
//      share card, and the bookings that were linked to an event;
//   4. post credits (album_credits) and the occasion tags with their post links;
//   5. service_categories (all of it, so the 18 verticals and their schemas can be restored).
//
// Needs the SERVER-ONLY service role key, read from SUPABASE_SERVICE_ROLE_KEY or
// services/ml/.env (like seed-test-users.mjs). It is never printed. Read-only on the
// database and Storage.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ROOT, STORAGE_BUCKETS, adminClient, adminConfig, archivedVendors, chunks, listAllUsers, listObjects, projectRef } from './lib/admin.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const noFiles = args.includes('--no-files')
const outArg = args.find((a) => a.startsWith('--out='))
const OUT_ROOT = outArg ? resolve(outArg.slice('--out='.length)) : resolve(ROOT, 'archive/event-platform/data-backup')
if (args.some((a) => !['--dry-run', '--no-files'].includes(a) && a !== outArg)) {
  console.error('Usage: node scripts/backup-nonphoto.mjs [--dry-run] [--no-files] [--out=<dir>]')
  process.exit(2)
}

const PLAN = `Backup plan (rows the photography-only cleanup deletes or changes):
  1. listings outside photography + their private row, services, policies, packages, add-ons, hours,
     blocked days, posts, photos, embeddings, post tags, collection entries, bookings (offers, history,
     add-ons, reviews, chats), inquiries, swipes, follows, shortlist, "Not into this", share cards
  2. the 32 archived vendor accounts (archive/event-platform/docs/test-users-vendors.json) and their rows
     as people (profile, bookings as a client, messages, chat memberships, swipes, follows, shortlist,
     collections, notifications, reports, blocks, reviews)
  3. events with friends: events, members, candidates, votes, event chats, event share cards, linked bookings
  4. post credits (album_credits), occasion tags and their post links
  5. service_categories (all rows)
  + Storage: the files of those posts and everything under the vendor accounts' folders
    (${STORAGE_BUCKETS.join(', ')})
Output: archive/event-platform/data-backup/<timestamp>/ (git-ignored)`

const config = adminConfig()
if (dryRun && !config.serviceKey) {
  console.log(PLAN)
  console.log('\n--dry-run without SUPABASE_SERVICE_ROLE_KEY: this is the plan only. With the key, --dry-run also prints row counts.')
  process.exit(0)
}
const db = adminClient(config)

// ---- collection ---------------------------------------------------------------
const rows = {} // table -> Map(json -> row)
const skipped = new Set() // tables this database doesn't have
const why = {} // table -> Set(reasons)

const add = (table, list, reason) => {
  const m = (rows[table] ||= new Map())
  ;(why[table] ||= new Set()).add(reason)
  for (const r of list) m.set(JSON.stringify(r), r)
  return list
}
const missingTable = (error) => error && (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message))

/** Every row of `table` matching the filter built by `q` (paged). */
async function fetchAll(table, q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(db.from(table).select('*')).range(from, from + 999)
    if (error) {
      if (missingTable(error)) {
        skipped.add(table)
        return out
      }
      throw new Error(`${table}: ${error.message}`)
    }
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/** Rows of `table` whose `col` is one of `values`. */
async function grab(table, col, values, reason) {
  const out = []
  for (const part of chunks([...new Set(values)].filter(Boolean), 80)) out.push(...(await fetchAll(table, (q) => q.in(col, part))))
  return add(table, out, reason)
}
const grabWhere = async (table, q, reason) => add(table, await fetchAll(table, q), reason)
const ids = (table, col = 'id') => [...(rows[table]?.values() || [])].map((r) => r[col]).filter(Boolean)

console.log(`${dryRun ? 'DRY RUN: counting' : 'Backing up'} non-photo data in project ${projectRef(config.url)}...`)

// 5. Categories (all), to know the verticals.
const cats = await grabWhere('service_categories', (q) => q, 'all categories (reference)')
const photo = cats.find((c) => c.slug === 'photography' && c.kind === 'vertical')
const otherVerticals = cats.filter((c) => c.kind === 'vertical' && c.slug !== 'photography')
console.log(`  verticals: ${cats.filter((c) => c.kind === 'vertical').length} (${otherVerticals.length} besides photography)`)

// 1. Listings outside photography and what hangs off them.
const listings = await grab('providers', 'vertical_id', otherVerticals.map((v) => v.id), 'listing outside photography')
const listingIds = listings.map((p) => p.id)
for (const t of ['provider_private', 'provider_services', 'packages', 'package_addons', 'availability_rules', 'blackouts', 'albums', 'reviews', 'follows', 'saved_providers', 'swipes', 'conversations', 'bookings']) {
  await grab(t, 'provider_id', listingIds, 'of a non-photo listing')
}
await grab('cancellation_policies', 'provider_id', listingIds, 'own policy of a non-photo listing')
await grab('messages', 'shared_provider_id', listingIds, 'card sharing a non-photo listing')
await grabWhere('taste_corrections', (q) => q.eq('kind', 'provider'), 'scan')
rows.taste_corrections = new Map([...rows.taste_corrections.entries()].filter(([, r]) => listingIds.includes(r.value)))
why.taste_corrections = new Set(['"Not into this" a non-photo listing'])
// Photo listings' packages / posts / bookings filed under another vertical's category
// (the migration moves them to photography or clears the category).
const otherCategoryIds = cats.filter((c) => c.id !== photo?.id && c.parent_id !== photo?.id).map((c) => c.id)
for (const t of ['packages', 'albums', 'bookings']) await grab(t, 'category_id', otherCategoryIds, 'filed under a non-photo category')
const albumIds = ids('albums')
await grab('photos', 'album_id', albumIds, 'photo of a non-photo post')
await grab('album_tags', 'album_id', albumIds, 'tag of a non-photo post')
await grab('swipes', 'album_id', albumIds, 'swipe on a non-photo post')
await grab('messages', 'shared_album_id', albumIds, 'card sharing a non-photo post')

// 2. The archived vendor accounts.
const vendors = archivedVendors()
const emails = new Set(vendors.map((v) => v.email.toLowerCase()))
const users = (await listAllUsers(db)).filter((u) => emails.has(u.email?.toLowerCase()))
const uids = users.map((u) => u.id)
console.log(`  vendor accounts: ${users.length} of ${vendors.length} still exist`)
add('auth_users', users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, user_metadata: u.user_metadata })), 'archived vendor account (no secrets)')
await grab('profiles', 'id', uids, 'archived vendor account')
await grab('providers', 'profile_id', uids, 'listing of an archived vendor account')
await grab('bookings', 'client_id', uids, 'booked by an archived vendor account')
await grab('messages', 'sender_id', uids, 'sent by an archived vendor account')
await grab('conversation_members', 'profile_id', uids, 'archived vendor account in a chat')
await grab('photos', 'owner_id', uids, 'photo of an archived vendor account')
for (const [t, c] of [['swipes', 'user_id'], ['taste_corrections', 'user_id'], ['saved_providers', 'user_id'], ['follows', 'follower_id'],
  ['collections', 'owner_id'], ['notifications', 'user_id'], ['reports', 'reporter_id'], ['blocks', 'blocker_id'], ['blocks', 'blocked_id'],
  ['reviews', 'author_id'], ['reviews', 'subject_profile_id'], ['events', 'owner_id'], ['event_members', 'profile_id'], ['identity_verifications', 'user_id']]) {
  await grab(t, c, uids, `${c} is an archived vendor account`)
}
await grab('collection_items', 'collection_id', ids('collections'), 'in a collection of an archived vendor account')

// 3. Events with friends (all of it).
await grabWhere('events', (q) => q, 'event (events with friends is archived)')
await grabWhere('event_members', (q) => q, 'event member')
await grabWhere('event_candidates', (q) => q, 'hiring board')
await grabWhere('event_candidate_votes', (q) => q, 'hiring board vote')
await grabWhere('conversations', (q) => q.eq('kind', 'event'), 'event chat')
await grabWhere('bookings', (q) => q.not('event_id', 'is', null), 'booking linked to an event (kept, unlinked)')
await grabWhere('messages', (q) => q.not('shared_event_id', 'is', null), 'event share card')
await grabWhere('messages', (q) => q.eq('share_preview->>kind', 'event'), 'event share card')

// 4. Post credits and occasion tags.
await grabWhere('album_credits', (q) => q, 'post credit')
const occasionTags = await grabWhere('tags', (q) => q.like('slug', 'occasion-%'), 'occasion tag')
await grab('album_tags', 'tag_id', occasionTags.map((t) => t.id), 'occasion tag on a post')

// Children of everything collected so far.
const photoIds = ids('photos')
await grab('photo_embeddings', 'photo_id', photoIds, 'embedding of a backed-up photo')
await grab('collection_items', 'photo_id', photoIds, 'backed-up photo in a collection')
const bookingIds = ids('bookings')
for (const t of ['booking_offers', 'booking_events', 'booking_addons', 'reviews', 'conversations']) await grab(t, 'booking_id', bookingIds, 'of a backed-up booking')
const conversationIds = ids('conversations')
await grab('conversation_members', 'conversation_id', conversationIds, 'member of a backed-up chat')
await grab('messages', 'conversation_id', conversationIds, 'message in a backed-up chat')

// ---- storage ------------------------------------------------------------------
const paths = Object.fromEntries(STORAGE_BUCKETS.map((b) => [b, new Set()]))
const isPath = (p) => typeof p === 'string' && p && !/^https?:/i.test(p)
for (const p of rows.photos?.values() || []) {
  if (isPath(p.display_path)) paths.portfolio.add(p.display_path)
  if (isPath(p.original_path)) paths['portfolio-originals'].add(p.original_path)
}
for (const p of rows.profiles?.values() || []) if (isPath(p.avatar_path)) paths.avatars.add(p.avatar_path)
for (const uid of uids) {
  for (const bucket of STORAGE_BUCKETS) for (const p of await listObjects(db, bucket, uid)) paths[bucket].add(p)
}
const storagePaths = Object.fromEntries(Object.entries(paths).map(([b, s]) => [b, [...s].sort()]))
const fileCount = Object.values(storagePaths).reduce((n, l) => n + l.length, 0)

// ---- report / write -------------------------------------------------------------
const counts = Object.fromEntries(Object.entries(rows).map(([t, m]) => [t, m.size]).sort())
const width = Math.max(...Object.keys(counts).map((t) => t.length))
for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(width)}  ${String(n).padStart(6)}`)
if (skipped.size) console.log(`  (not on this database: ${[...skipped].sort().join(', ')})`)
console.log(`  storage files: ${fileCount} (${Object.entries(storagePaths).map(([b, l]) => `${b} ${l.length}`).join(', ')})`)

if (dryRun) {
  console.log('\nDRY RUN: nothing was written. Run without --dry-run to save the backup.')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
const dir = resolve(OUT_ROOT, stamp)
mkdirSync(resolve(dir, 'tables'), { recursive: true })
for (const [t, m] of Object.entries(rows)) writeFileSync(resolve(dir, 'tables', `${t}.json`), `${JSON.stringify([...m.values()], null, 1)}\n`)
writeFileSync(resolve(dir, 'storage-paths.json'), `${JSON.stringify(storagePaths, null, 1)}\n`)

let downloaded = 0
const failed = []
if (!noFiles) {
  const queue = Object.entries(storagePaths).flatMap(([bucket, list]) => list.map((path) => ({ bucket, path })))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { data, error } = await db.storage.from(job.bucket).download(job.path)
      if (error || !data) {
        failed.push({ ...job, error: error?.message || 'no data' })
        continue
      }
      const target = resolve(dir, 'files', job.bucket, job.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, Buffer.from(await data.arrayBuffer()))
      downloaded++
      if (downloaded % 50 === 0) console.log(`  ...${downloaded}/${fileCount} files`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

writeFileSync(resolve(dir, 'manifest.json'), `${JSON.stringify({
  backup: stamp,
  project: projectRef(config.url),
  createdAt: new Date().toISOString(),
  purpose: 'Rows and files deleted by supabase/migrations/20261018000000_photography_only.sql and frontend/scripts/delete-nonphoto-users.mjs',
  counts,
  reasons: Object.fromEntries(Object.entries(why).map(([t, s]) => [t, [...s]])),
  tablesNotOnThisDatabase: [...skipped].sort(),
  storage: { files: fileCount, downloaded: noFiles ? 0 : downloaded, skippedDownloads: noFiles, failed },
  photographyVertical: photo ? { id: photo.id, name: photo.name } : null,
}, null, 1)}\n`)

console.log(`\nSaved to ${dir} (${Object.keys(counts).length} tables${noFiles ? ', no files' : `, ${downloaded}/${fileCount} files`}).`)
if (failed.length) console.log(`  ${failed.length} file(s) could not be downloaded; they are listed in manifest.json (storage.failed).`)
console.log('\nNext: open supabase/demo/photography_only_setup.sql, replace \'no\' in its first statement with')
console.log(`  '${stamp}'`)
console.log('and paste the whole file into the Supabase SQL Editor. Runbook: docs/PHOTOGRAPHY_ONLY_RUNBOOK.md')
