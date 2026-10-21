// Builds the raw data behind docs/CODEBASE_MAP.md: every tracked file with the
// commit that added it, its latest change, and who imports / references it.
//   node tools/codemap/scan.mjs > tools/codemap/codemap.json
// Import resolution covers what this repo uses: relative imports (JS/TS/CSS),
// the web app's '@/...' alias in mobile (mobile/src) and '@shared/...' (frontend/src),
// dynamic import(), and Python `from app.x import` / `import app.x` inside services/ml.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const git = (args) => execSync(`git ${args}`, { encoding: 'utf8', maxBuffer: 1 << 28 })
const files = git('ls-files').split('\n').filter(Boolean)
const tracked = new Set(files)

// ---- history: first commit that added each path (following renames), and the latest one
const added = new Map()
const latest = new Map()
const log = git('log --reverse --name-status -M --format=@@%h%x09%ad%x09%an%x09%s --date=short')
let commit = null
for (const line of log.split('\n')) {
  if (line.startsWith('@@')) {
    const [sha, date, author, ...subject] = line.slice(2).split('\t')
    commit = { sha, date, author, subject: subject.join('\t') }
    continue
  }
  if (!line.trim() || !commit) continue
  const parts = line.split('\t')
  const status = parts[0]
  if (status.startsWith('R')) {
    const [, from, to] = parts
    if (added.has(from)) added.set(to, { ...added.get(from), renamedFrom: from, renamedIn: commit })
    else added.set(to, commit)
    latest.set(to, commit)
  } else if (status === 'A') {
    if (!added.has(parts[1])) added.set(parts[1], commit) // keep the first add (parallel branches can add the same file)
    latest.set(parts[1], commit)
  } else if (status === 'M') {
    latest.set(parts[1], commit)
  }
}

// ---- references
const CODE = /\.(m?jsx?|tsx?|cjs|css)$/
const resolveJs = (fromFile, spec) => {
  let base
  if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(fromFile), spec)
  else if (spec.startsWith('@shared/')) base = 'frontend/src/' + spec.slice('@shared/'.length)
  else if (spec.startsWith('@/') && fromFile.startsWith('mobile/')) base = 'mobile/src/' + spec.slice(2)
  else return null
  base = path.posix.normalize(base)
  const exts = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.json', '.web.tsx', '.web.ts', '.native.ts']
  for (const e of exts) if (tracked.has(base + e)) return base + e
  for (const e of ['/index.js', '/index.ts', '/index.tsx', '/index.jsx']) if (tracked.has(base + e)) return base + e
  return null
}
const importedBy = new Map()
const addRef = (target, from) => {
  if (!target || target === from) return
  if (!importedBy.has(target)) importedBy.set(target, new Set())
  importedBy.get(target).add(from)
}
for (const f of files) {
  if (!existsSync(f)) continue
  if (CODE.test(f) && !f.startsWith('frontend/public/')) {
    const src = readFileSync(f, 'utf8')
    const re = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|@import\s+['"]([^'"]+)['"]|import\.meta\.glob\(\s*['"]([^'"*]+)['"]/g
    let m
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2] || m[3] || m[4] || m[5] || m[6]
      addRef(resolveJs(f, spec), f)
    }
  } else if (f.endsWith('.py') && f.startsWith('services/ml/')) {
    const src = readFileSync(f, 'utf8')
    const re = /^\s*(?:from\s+(app(?:\.[\w]+)+|eval(?:\.[\w]+)*|\.+[\w.]*)\s+import\s+([\w, ()]+)|import\s+(app(?:\.[\w]+)+))/gm
    let m
    while ((m = re.exec(src))) {
      let mod = m[1] || m[3]
      if (mod.startsWith('.')) {
        // relative: "." = this package, ".." = parent, ".x" = sibling module x
        const dots = mod.match(/^\.+/)[0].length
        let dir = path.posix.dirname(f).slice('services/ml/'.length)
        for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir)
        const rest = mod.slice(dots)
        mod = rest ? `${dir}/${rest.replace(/\./g, '/')}` : dir
      } else mod = mod.replace(/\./g, '/')
      const cands = [`services/ml/${mod}.py`, `services/ml/${mod}/__init__.py`]
      // `from app.ai import tools` -> app/ai/tools.py
      if (m[2]) for (const name of m[2].replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean)) cands.push(`services/ml/${mod}/${name}.py`)
      for (const c of cands) if (tracked.has(c)) addRef(c, f)
    }
  }
}

// ---- web routes (App.jsx) and mobile routes (expo-router files)
const routes = {}
if (existsSync('frontend/src/App.jsx')) {
  const app = readFileSync('frontend/src/App.jsx', 'utf8')
  const imports = {}
  for (const m of app.matchAll(/import\s+(\w+)(?:,\s*\{[^}]*\})?\s+from\s+['"](\.[^'"]+)['"]/g)) imports[m[1]] = resolveJs('frontend/src/App.jsx', m[2])
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
    const file = imports[m[2]]
    if (file) (routes[file] ||= []).push(m[1])
  }
}
for (const f of files.filter((f) => f.startsWith('mobile/src/app/') && /\.tsx?$/.test(f))) {
  const r = '/' + f.slice('mobile/src/app/'.length).replace(/\.(tsx|ts)$/, '').replace(/(^|\/)index$/, '').replace(/\(tabs\)\/?/, '')
  ;(routes[f] ||= []).push(`app ${r || '/'}`)
}

const out = files.map((f) => ({
  path: f,
  added: added.get(f) || null,
  latest: latest.get(f) || null,
  importedBy: [...(importedBy.get(f) || [])].sort(),
  routes: routes[f] || [],
  lines: existsSync(f) && !/\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|onnx)$/i.test(f) ? readFileSync(f, 'utf8').split('\n').length : null,
}))
process.stdout.write(JSON.stringify(out, null, 1))
