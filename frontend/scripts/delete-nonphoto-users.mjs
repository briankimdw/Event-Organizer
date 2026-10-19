// Delete the 32 test vendor accounts of the archived verticals (venues, catering,
// DJs...) and their Storage files. Step 3 of docs/PHOTOGRAPHY_ONLY_RUNBOOK.md: run it
// AFTER backup-nonphoto.mjs and supabase/demo/photography_only_setup.sql.
//
//   cd frontend
//   node scripts/delete-nonphoto-users.mjs --dry-run   # what would be deleted (reads only)
//   node scripts/delete-nonphoto-users.mjs             # delete them
//   node scripts/delete-nonphoto-users.mjs --backup=<folder>   # orphaned files from that backup (default: the newest)
//
// Who: the accounts listed in archive/event-platform/docs/test-users-vendors.json. The
// photographers, the two photo & video creators (Ana Torres Films, Northbound Media)
// and the clients in docs/test-users.json are never touched; an email that is in both
// files is refused. An account that still owns a listing (after the cleanup that can
// only be a Photo & video one) is skipped with a warning.
//
// For each account: its files under <user id>/ in every bucket (avatars, portfolio,
// portfolio-originals, raw-proofs) are removed, then bookings it made as a client
// (they block deleting a user; the backup has them), then the auth user itself, which
// cascades to the profile and the rest of its rows. Finally, files listed in the
// backup's storage-paths.json that no remaining photo or profile uses are removed
// (posts of the archived listings whose owner keeps their account).
//
// Needs the SERVER-ONLY service role key (SUPABASE_SERVICE_ROLE_KEY or services/ml/.env),
// never printed.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, STORAGE_BUCKETS, adminClient, archivedVendors, chunks, listAllUsers, listObjects, must } from './lib/admin.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const backupArg = args.find((a) => a.startsWith('--backup='))
if (args.some((a) => a !== '--dry-run' && a !== backupArg)) {
  console.error('Usage: node scripts/delete-nonphoto-users.mjs [--dry-run] [--backup=<backup folder>]')
  process.exit(2)
}

const db = adminClient()
const say = (s) => console.log(s)

// ---- preconditions ------------------------------------------------------------------
const verticals = must(await db.from('service_categories').select('slug, kind').eq('kind', 'vertical'))
const others = verticals.filter((v) => v.slug !== 'photography').map((v) => v.slug)
if (others.length) {
  console.error(`The database still has other verticals (${others.join(', ')}).`)
  console.error('Back up (node scripts/backup-nonphoto.mjs) and paste supabase/demo/photography_only_setup.sql first.')
  process.exit(1)
}

const keep = JSON.parse(readFileSync(resolve(ROOT, 'docs/test-users.json'), 'utf8'))
const keepEmails = new Set([...(keep.photographers || []), ...(keep.vendors || []), ...(keep.clients || [])].map((p) => p.email.toLowerCase()))
const vendors = archivedVendors()
const clash = vendors.filter((v) => keepEmails.has(v.email.toLowerCase()))
if (clash.length) {
  console.error(`Refusing: ${clash.map((v) => v.username).join(', ')} are also in docs/test-users.json (kept accounts).`)
  process.exit(1)
}
const byEmail = new Map(vendors.map((v) => [v.email.toLowerCase(), v]))
const accounts = (await listAllUsers(db)).filter((u) => byEmail.has(u.email?.toLowerCase()))
say(`${dryRun ? 'DRY RUN: ' : ''}${accounts.length} of ${vendors.length} archived vendor accounts exist.`)

// ---- per account ----------------------------------------------------------------------
const totals = { deleted: 0, skipped: 0, files: 0, bookings: 0 }
for (const user of accounts) {
  const v = byEmail.get(user.email.toLowerCase())
  const label = `${v.username.padEnd(18)} ${v.business || ''}`
  const listings = must(await db.from('providers').select('slug').eq('profile_id', user.id))
  if (listings.length) {
    say(`  skip ${label}: still owns listing(s) ${listings.map((l) => l.slug).join(', ')} (delete those by hand if that's intended)`)
    totals.skipped++
    continue
  }
  const files = {}
  for (const bucket of STORAGE_BUCKETS) files[bucket] = await listObjects(db, bucket, user.id)
  const nFiles = Object.values(files).reduce((n, l) => n + l.length, 0)
  const asClient = must(await db.from('bookings').select('id').eq('client_id', user.id))
  say(`  ${dryRun ? 'would delete' : 'delete'} ${label}: ${nFiles} file(s), ${asClient.length} booking(s) as a client`)
  totals.files += nFiles
  totals.bookings += asClient.length
  if (dryRun) continue

  for (const [bucket, paths] of Object.entries(files)) {
    for (const part of chunks(paths, 100)) must(await db.storage.from(bucket).remove(part))
  }
  if (asClient.length) {
    for (const part of chunks(asClient.map((b) => b.id), 100)) must(await db.from('bookings').delete().in('id', part))
  }
  // Counter offers they made on someone else's booking have no "on delete" rule.
  must(await db.from('booking_offers').delete().eq('created_by', user.id))
  const { error } = await db.auth.admin.deleteUser(user.id)
  if (error) {
    say(`    FAILED to delete the account: ${error.message}`)
    continue
  }
  totals.deleted++
}

// ---- orphaned files from the backup ---------------------------------------------------
const backupRoot = resolve(ROOT, 'archive/event-platform/data-backup')
const backupDir = backupArg
  ? resolve(backupArg.slice('--backup='.length))
  : existsSync(backupRoot)
    ? readdirSync(backupRoot).filter((d) => existsSync(resolve(backupRoot, d, 'storage-paths.json'))).sort().map((d) => resolve(backupRoot, d)).pop()
    : null
let orphans = 0
if (!backupDir || !existsSync(resolve(backupDir, 'storage-paths.json'))) {
  say('\nNo backup with storage-paths.json found: skipping orphaned post files (pass --backup=<folder> to include them).')
} else {
  const listed = JSON.parse(readFileSync(resolve(backupDir, 'storage-paths.json'), 'utf8'))
  for (const [bucket, paths] of Object.entries(listed)) {
    if (!paths.length) continue
    // Still used by a remaining photo or profile? Then it stays. (raw-proofs paths only
    // come from the deleted accounts' own folders.)
    const used = new Set()
    const col = bucket === 'avatars' ? 'avatar_path' : bucket === 'portfolio' ? 'display_path' : 'original_path'
    const table = bucket === 'avatars' ? 'profiles' : 'photos'
    if (bucket !== 'raw-proofs') {
      for (const part of chunks(paths, 80)) for (const r of must(await db.from(table).select(col).in(col, part))) used.add(r[col])
    }
    const gone = paths.filter((p) => !used.has(p))
    if (!gone.length) continue
    if (dryRun) {
      say(`  would remove up to ${gone.length} unused file(s) from ${bucket} (listed in the backup)`)
      continue
    }
    for (const part of chunks(gone, 100)) orphans += (must(await db.storage.from(bucket).remove(part)) || []).length
  }
  say(`\nBackup used for orphaned files: ${backupDir}`)
}

// ---- summary -------------------------------------------------------------------------
if (dryRun) {
  say(`\nDRY RUN: would delete ${accounts.length - totals.skipped} account(s), ${totals.files} file(s) in their folders and ${totals.bookings} booking(s) they made as clients; ${totals.skipped} skipped. Nothing was changed.`)
} else {
  const left = (await listAllUsers(db)).filter((u) => byEmail.has(u.email?.toLowerCase()))
  say(`\nDeleted ${totals.deleted} account(s), ${totals.files} file(s) in their folders, ${totals.bookings} booking(s) they made as clients, ${orphans} orphaned file(s); ${totals.skipped} skipped.`)
  say(`${left.length} archived vendor account(s) left${left.length ? `: ${left.map((u) => byEmail.get(u.email.toLowerCase()).username).join(', ')}` : ''}.`)
}
