// SQL parity check, step 2: runs supabase/migrations/20261012000100_feed_v2.sql in PGlite
// + pgvector on a minimal schema, loads the fixture from parity_export.py, and compares
// discover_feed / provider_matches with the Python FeedV2 port.
//
//   mkdir <scratch dir> && cd <scratch dir>
//   npm i @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9
//   cp <repo>/services/ml/eval/sql/parity.mjs . && node parity.mjs <migration.sql> <fixture.json>
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
const [migration, fixturePath] = process.argv.slice(2)
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'))
const db = new PGlite({ extensions: { vector } })
await db.exec(`
create schema extensions; create extension vector with schema extensions;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $$;
create role anon; create role authenticated; create role service_role;
create type public.swipe_action as enum ('like', 'pass', 'save');
create type public.correction_kind as enum ('tag', 'provider');
create table public.service_categories (id uuid primary key default gen_random_uuid(), slug text unique);
create table public.providers (id uuid primary key, profile_id uuid not null, status text not null default 'active', vertical_id uuid references public.service_categories(id));
create table public.albums (id uuid primary key, provider_id uuid references public.providers(id), status text default 'published', kind text default 'photo', category_id uuid, title text);
create table public.photos (id uuid primary key, album_id uuid references public.albums(id), display_path text, auto_tags text[] not null default '{}', pair_role text, created_at timestamptz not null);
create table public.photo_embeddings (photo_id uuid primary key references public.photos(id), embedding extensions.vector(768) not null, model text default 'x');
create table public.swipes (id bigint generated always as identity primary key, user_id uuid not null, photo_id uuid references public.photos(id), action public.swipe_action not null, created_at timestamptz not null default now());
create table public.taste_corrections (user_id uuid, kind public.correction_kind, value text);
`)
const sql = readFileSync(migration, 'utf8').replace(/\r\n/g, '\n')
await db.exec(sql)
console.log('migration applied')
const vid = {}
for (const v of fx.verticals) vid[v] = (await db.query('insert into public.service_categories (slug) values ($1) returning id', [v])).rows[0].id
const provs = new Map(), albums = new Map()
for (const p of fx.photos) { provs.set(p.provider, p.vertical); albums.set(p.album, p.provider) }
for (const [id, v] of provs) await db.query('insert into public.providers (id, profile_id, vertical_id) values ($1, gen_random_uuid(), $2)', [id, vid[v]])
for (const [id, pr] of albums) await db.query("insert into public.albums (id, provider_id, title) values ($1, $2, 'a')", [id, pr])
for (const p of fx.photos) {
  await db.query("insert into public.photos (id, album_id, display_path, created_at) values ($1, $2, 'x.jpg', timestamptz '2026-01-01' + make_interval(secs => $3 * 1e6))", [p.id, p.album, p.created])
  await db.query('insert into public.photo_embeddings (photo_id, embedding) values ($1, $2)', [p.id, p.emb])
}
let ok = 0, total = 0
for (const s of fx.scenarios) {
  await db.query('delete from public.swipes')
  let t = 0
  for (const [pid, a] of s.swipes) await db.query("insert into public.swipes (user_id, photo_id, action, created_at) values ($1, $2, $3, timestamptz '2026-06-01' + make_interval(secs => $4))", [s.user, pid, a, t++])
  await db.query("select set_config('request.jwt.claims', $1, false)", [s.swipes.length || s.name !== 'no swipes' ? JSON.stringify({ sub: s.user }) : ''])
  const t0 = performance.now()
  const rows = (await db.query('select photo_id, exploration, score, reason from public.discover_feed(20, $1)', [s.category])).rows
  const ms = performance.now() - t0
  const main = rows.filter((r) => !r.exploration).map((r) => r.photo_id)
  const same = main.filter((id, k) => id === s.main[k]).length
  let provLine = ''
  if (s.providers.length) {
    const pm = (await db.query('select provider_id, match_pct from public.provider_matches()')).rows
    const order = new Map(s.providers.map(([id], k) => [id, k]))
    // Python best provider should get the top %, and % should fall as Python's score falls
    let inv = 0, pairs = 0
    for (let a = 0; a < pm.length; a++) for (let b = a + 1; b < pm.length; b++) {
      if (pm[a].match_pct === pm[b].match_pct) continue
      pairs++; if ((order.get(pm[a].provider_id) > order.get(pm[b].provider_id)) !== (pm[a].match_pct < pm[b].match_pct)) inv++
    }
    provLine = ` | provider_matches: ${pm.length} rows, top=${pm[0].provider_id === s.providers[0][0] ? 'same' : 'DIFF'}, discordant pairs ${inv}/${pairs}`
  }
  total += s.main.length; ok += same
  console.log(`${s.name.padEnd(30)} main order ${same}/${s.main.length} same (sql ${main.length})  ${ms.toFixed(0)} ms  ${rows.filter(r=>r.exploration).length} explore  reason: ${rows[0]?.reason}${provLine}`)
}
console.log(`TOTAL ${ok}/${total} positions identical`)
