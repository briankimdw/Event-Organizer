// Joins docs/codemap/*.md into docs/CODEBASE_MAP.md with an intro and a table of
// contents, then reports which tracked files the map never mentions.
//   node tools/codemap/scan.mjs > tools/codemap/codemap.json   (refresh the facts)
//   node tools/codemap/assemble.mjs
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const parts = readdirSync('docs/codemap').filter((f) => /^\d-.*\.md$/.test(f)).sort()
const bodies = parts.map((f) => readFileSync(`docs/codemap/${f}`, 'utf8').replace(/\r\n/g, '\n').trim())

// GitHub-style anchors (lowercase, drop punctuation except - and _, spaces -> -), de-duplicated.
const seen = new Map()
const anchor = (title) => {
  const base = title.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-')
  const n = seen.get(base) || 0
  seen.set(base, n + 1)
  return n ? `${base}-${n}` : base
}
const toc = []
for (const body of bodies) {
  let inFence = false
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    if (inFence) continue
    const m = line.match(/^(##|###) (.+)$/)
    if (m) toc.push(`${m[1] === '##' ? '' : '  '}- [${m[2].replace(/`/g, '')}](#${anchor(m[2])})`)
  }
}

const today = new Date().toISOString().slice(0, 10)
const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const intro = `# Codebase map

Every file in the repository: **what it is for**, **when and in which commit it was made**, its
**latest change**, and **where it is used** (which files import it, which route or screen shows it,
or who runs it). Generated on ${today} at commit \`${head}\`.

**How to read an entry**

- **What:** what the file does and its main exports.
- **Made:** the date, commit and author that added the file (and where it lived before, if it moved).
- **Last changed:** the latest commit that touched it.
- **Used by:** real consumers: importing files, routes, scripts, or "entry point" / "run by you".
  Mobile files that import shared web code through \`@shared/...\` are listed under **mobile**.
- **Notes:** gotchas, ownership (Tim's files are marked), generated files, things to check.

**The repository at a glance**

| Folder | What lives there |
|---|---|
| \`frontend/\` | The React + Vite web app. \`frontend/src/api\`, \`lib\` and \`verticals\` are plain JS shared with the Expo app. Also scripts you run (seed, backup, e2e) and the built Studio editor in \`public/studio\`. |
| \`mobile/\` | The Expo (React Native) app. Imports the shared web code through Metro (\`@shared/...\`). |
| \`services/ml/\` | Python FastAPI service: SigLIP photo embeddings and auto-tags (Discover), and the AI photo tools (remove background, erase, upscale). |
| \`supabase/\` | Database migrations (the schema), seed data, demo data, SQL tests. |
| \`tools/\` | Build tooling: the Studio (miniPaint) build, and the scripts that generate this map. |
| \`docs/\` | Project docs: plan, progress log, database design, data layer, editor, AI tools, runbooks. |
| \`backend/\`, \`orchestrator/\`, \`plans/\`, \`.claude/\` | Tim Phelps's FastAPI auth/gallery backend and his Claude Code orchestrator. |
| \`archive/event-platform/\` | The archived multi-vendor event platform (git tag \`multi-vendor-snapshot\`). Not built or imported. |

To refresh this map after changes: \`node tools/codemap/scan.mjs > tools/codemap/codemap.json\`,
update the section files in \`docs/codemap/\`, then \`node tools/codemap/assemble.mjs\`.

## Contents

${toc.join('\n')}
`

const doc = `${intro}\n${bodies.join('\n\n---\n\n')}\n`
writeFileSync('docs/CODEBASE_MAP.md', doc)

// Coverage: tracked files the map never names (exact path, or inside a folder the map summarises).
const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean)
const text = doc
const missing = tracked.filter((f) => {
  if (text.includes(f)) return false
  // relative mentions inside a section, e.g. `api/catalog.js` under frontend/src, `src/...` under mobile
  const rel = [f.replace(/^frontend\/src\//, ''), f.replace(/^mobile\//, ''), f.replace(/^archive\/event-platform\//, ''), f.split('/').slice(-2).join('/')]
  if (rel.some((r) => r !== f && text.includes(r))) return false
  // a folder entry/table that covers it: some ancestor folder is named, and either the
  // folder is summarised as a whole (assets) or the file's name appears as a table row
  const segs = f.split('/')
  const name = segs[segs.length - 1]
  for (let i = segs.length - 1; i > 0; i--) {
    const dir = segs.slice(0, i).join('/')
    const short = segs.slice(Math.max(0, i - 2), i).join('/')
    if (text.includes(dir + '/') || text.includes('`' + short + '/`')) {
      if (i >= segs.length - 2 || text.includes('`' + name + '`')) return false
    }
  }
  return true
})
console.log(`docs/CODEBASE_MAP.md: ${doc.split('\n').length} lines, ${toc.length} headings; tracked files ${tracked.length}, not mentioned: ${missing.length}`)
for (const f of missing) console.log('  -', f)
