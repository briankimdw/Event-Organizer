// Shared by the service-role scripts (seed-test-users, backup-nonphoto,
// delete-nonphoto-users): paths, the SERVER-ONLY Supabase client and small helpers.
//
// The service role key is read from SUPABASE_SERVICE_ROLE_KEY in the environment or
// from services/ml/.env. It is never printed, logged or written to a file.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const fileEnv = (path) =>
  existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_]+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}

/** { url, serviceKey } (either may be empty). */
export function adminConfig() {
  const mlEnv = fileEnv(resolve(ROOT, 'services/ml/.env'))
  const frontEnv = fileEnv(resolve(ROOT, 'frontend/.env.local'))
  return {
    url: process.env.SUPABASE_URL || mlEnv.SUPABASE_URL || frontEnv.VITE_SUPABASE_URL || '',
    // An explicitly empty SUPABASE_SERVICE_ROLE_KEY= means "no key" (e.g. for a plan-only --dry-run).
    serviceKey: ('SUPABASE_SERVICE_ROLE_KEY' in process.env ? process.env.SUPABASE_SERVICE_ROLE_KEY : mlEnv.SUPABASE_SERVICE_ROLE_KEY) || '',
  }
}

/** The service-role client, or exits with a message when the key or URL is missing. */
export function adminClient({ url, serviceKey } = adminConfig()) {
  if (globalThis.__TEST_ADMIN_CLIENT__) return globalThis.__TEST_ADMIN_CLIENT__ // offline tests only
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in services/ml/.env; see .env.example).')
    process.exit(1)
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** "ktjvbajrfrbwpndforcy" from https://ktjvbajrfrbwpndforcy.supabase.co */
export const projectRef = (url) => {
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return '?'
  }
}

export const must = ({ data, error }) => {
  if (error) throw error
  return data
}

export const chunks = (list, size = 100) => {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Every auth user (paged). */
export async function listAllUsers(db) {
  const all = []
  for (let page = 1; page < 100; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 1000 }))
    all.push(...users)
    if (users.length < 1000) break
  }
  return all
}

/** Every object path under a folder of a bucket (recursive). */
export async function listObjects(db, bucket, prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) {
      if (/not found/i.test(error.message)) return out
      throw error
    }
    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id == null) out.push(...(await listObjects(db, bucket, path))) // a folder
      else if (!item.name.startsWith('.')) out.push(path)
    }
    if (!data || data.length < 1000) return out
  }
}

/** The 32 test vendors of the archived verticals (no passwords). */
export function archivedVendors() {
  const path = resolve(ROOT, 'archive/event-platform/docs/test-users-vendors.json')
  if (!existsSync(path)) {
    console.error('Missing archive/event-platform/docs/test-users-vendors.json')
    process.exit(1)
  }
  return JSON.parse(readFileSync(path, 'utf8')).vendors
}

export const STORAGE_BUCKETS = ['avatars', 'portfolio', 'portfolio-originals', 'raw-proofs']
