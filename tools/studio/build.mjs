#!/usr/bin/env node
// Builds the photomatch Studio (miniPaint + our bridge) into frontend/public/studio/.
//
//   node tools/studio/build.mjs [--work <dir>] [--keep]
//
// What it does (details and the reasons in docs/STUDIO.md):
//   1. downloads miniPaint at the pinned commit and checks its SHA-256;
//   2. stages upstream src/ (unmodified) + our bridge files in a scratch folder (default: OS temp);
//   3. installs the pinned build dependencies there with --ignore-scripts (no install scripts run);
//      AlertifyJS (GPL-3.0) is not installed at all: the webpack config swaps it for our MIT shim;
//   4. runs webpack, then refuses the result if any bundled package isn't MIT / ISC / BSD / Apache-2.0
//      or if AlertifyJS / GPL text shows up in the bundle;
//   5. copies the bundle, the icons miniPaint's CSS needs, the GIF worker and the licences into
//      frontend/public/studio/ (our own index.html there is not touched).
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MINIPAINT = {
  version: '4.14.3',
  commit: 'a79733eb803fc97084ef0ee4faa96b031e69e1c0', // tag v4.14.3
  url: 'https://codeload.github.com/viliusle/miniPaint/tar.gz/a79733eb803fc97084ef0ee4faa96b031e69e1c0',
  sha256: '21f1cadb54397f21927194d762fcef32282b0b2ec501a2cfaf65af9008c34fb4',
}
const ALLOWED = /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2\.0|0BSD|\(MIT OR [A-Za-z0-9.-]+\))$/

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const dest = path.join(repo, 'frontend', 'public', 'studio')
const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const work = path.resolve(opt('--work') || path.join(os.tmpdir(), 'photomatch-studio-build'))
const keep = args.includes('--keep')
const isWin = process.platform === 'win32'

const log = (...m) => console.log('[studio]', ...m)
const die = (m) => { console.error(`[studio] ${m}`); process.exit(1) }
const run = (cmd, argv, cwd) => {
  const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', shell: isWin && cmd === 'npm' })
  if (r.status !== 0) die(`${cmd} ${argv.join(' ')} failed (${r.status})`)
}
const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true })

// ---- 1. download + verify ----
fs.rmSync(work, { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const tgz = path.join(work, 'minipaint.tar.gz')
log(`downloading miniPaint ${MINIPAINT.version} (${MINIPAINT.commit.slice(0, 7)})`)
const res = await fetch(MINIPAINT.url)
if (!res.ok) die(`download failed: ${res.status}`)
const buf = Buffer.from(await res.arrayBuffer())
const sum = createHash('sha256').update(buf).digest('hex')
if (sum !== MINIPAINT.sha256) die(`SHA-256 mismatch: got ${sum}, expected ${MINIPAINT.sha256}. Review the download before updating the pin.`)
fs.writeFileSync(tgz, buf)
const upstreamDir = path.join(work, 'upstream')
fs.mkdirSync(upstreamDir)
// Relative paths: GNU tar (Git Bash) would read "C:\..." as a remote host.
run('tar', ['-xzf', 'minipaint.tar.gz', '-C', 'upstream', '--strip-components=1'], work)

// ---- 2. stage ----
copyDir(path.join(upstreamDir, 'src'), path.join(work, 'src'))
fs.copyFileSync(path.join(upstreamDir, 'package.json'), path.join(work, 'upstream-package.json'))
fs.mkdirSync(path.join(work, 'bridge'))
for (const f of ['entry.js', 'alertify-shim.js', 'alertify-shim.css', 'studio-overrides.css', 'strip-keys-loader.js']) fs.copyFileSync(path.join(here, f), path.join(work, 'bridge', f))
fs.copyFileSync(path.join(here, 'webpack.config.cjs'), path.join(work, 'webpack.config.cjs'))
fs.copyFileSync(path.join(here, 'package.json'), path.join(work, 'package.json'))
const lock = path.join(here, 'package-lock.json')
if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(work, 'package-lock.json'))

// ---- 3. install (no scripts) ----
log('installing pinned build dependencies (--ignore-scripts)')
run('npm', [fs.existsSync(lock) ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], work)
if (!fs.existsSync(lock)) fs.copyFileSync(path.join(work, 'package-lock.json'), lock)
if (fs.existsSync(path.join(work, 'node_modules', 'alertifyjs'))) die('alertifyjs was installed; it must not be (GPL-3.0)')

// ---- 4. build + licence checks ----
const out = path.join(work, 'out')
log('bundling')
const r = spawnSync(process.execPath, [path.join(work, 'node_modules', 'webpack-cli', 'bin', 'cli.js'), '--config', path.join(work, 'webpack.config.cjs')], {
  cwd: work, stdio: 'inherit', env: { ...process.env, STUDIO_OUT: out },
})
if (r.status !== 0) die('webpack failed')
let bundle = fs.readFileSync(path.join(out, 'minipaint.js'), 'utf8')
if (/alertifyjs\.com|Mohammad Younes|GNU General Public|Licensed under GPL/i.test(bundle)) die('GPL / AlertifyJS text found in the bundle')
// No third-party API keys: upstream's Pixabay / Google Fonts keys (and their pieces, since upstream
// splits the Google key), Google-style keys, or a hard-coded key in a "key=" URL.
const upstreamConfig = fs.readFileSync(path.join(upstreamDir, 'src', 'js', 'config.js'), 'utf8')
const keyBits = [...upstreamConfig.matchAll(/config\.(?:pixabay_key|google_webfonts_key)\s*=\s*([^;\n]+);/g)]
  .flatMap((m) => [...m[1].matchAll(/'([^']{6,})'/g)].map((x) => x[1].replace(',', '')))
if (keyBits.length < 2) die('could not find upstream API keys in config.js to check against; review the pin')
const keyHits = [
  ...keyBits.filter((k) => bundle.includes(k)),
  ...(bundle.match(/AIza[0-9A-Za-z_-]{8,}/g) || []),
  ...(bundle.match(/[?&](?:api_?)?key=[0-9A-Za-z_-]{12,}/gi) || []),
]
if (keyHits.length) die(`API key text found in the bundle: ${[...new Set(keyHits)].map((k) => `${k.slice(0, 8)}…`).join(', ')}`)
log(`no API keys in the bundle (checked ${keyBits.length} upstream key strings + patterns)`)
// Upstream ships its own Pixabay and Google Fonts API keys in its config. Studio never uses
// those services (the bridge turns them off), and this repo is public: blank the keys here.
bundle = stripUpstreamKeys(bundle)
fs.writeFileSync(path.join(out, 'minipaint.js'), bundle)
if (/pixabay_key:"[^"]+"|AIzaSy[0-9A-Za-z_-]/.test(bundle)) die('an upstream API key is still in the bundle')
const pkgs = JSON.parse(fs.readFileSync(path.join(out, 'bundled-packages.json'), 'utf8'))
const bad = pkgs.filter((p) => !ALLOWED.test(p.license))
if (bad.length) die(`packages with a licence that isn't allowed: ${bad.map((p) => `${p.name}@${p.version} (${p.license})`).join(', ')}`)
log(`bundled packages: ${pkgs.map((p) => `${p.name}@${p.version} ${p.license}`).join(', ')}`)

// ---- 5. publish into frontend/public/studio ----
fs.mkdirSync(dest, { recursive: true })
for (const f of ['minipaint.js', 'minipaint.js.LICENSE.txt', 'bundled-packages.json']) {
  if (fs.existsSync(path.join(out, f))) fs.copyFileSync(path.join(out, f), path.join(dest, f))
}
fs.rmSync(path.join(dest, 'images'), { recursive: true, force: true })
copyDir(path.join(upstreamDir, 'images', 'icons'), path.join(dest, 'images', 'icons'))
for (const f of ['logo.svg', 'logo-colors.png']) fs.copyFileSync(path.join(upstreamDir, 'images', f), path.join(dest, 'images', f))
// "Save as GIF" (animation) loads its worker from this page-relative path.
const gifDir = path.join(dest, 'src', 'js', 'libs', 'gifjs')
fs.mkdirSync(gifDir, { recursive: true })
fs.copyFileSync(path.join(upstreamDir, 'src', 'js', 'libs', 'gifjs', 'gif.worker.js'), path.join(gifDir, 'gif.worker.js'))
fs.copyFileSync(path.join(upstreamDir, 'MIT-LICENSE.txt'), path.join(dest, 'MINIPAINT-LICENSE.txt'))
fs.writeFileSync(path.join(dest, 'VERSION.json'), JSON.stringify({ minipaint: MINIPAINT, builtAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')

// pixabay_key:"…" -> "" and google_webfonts_key="AIza…"+"…" -> "" (the key is split into parts).
function stripUpstreamKeys(js) {
  return js
    .replace(/pixabay_key:"[^"]*"/g, 'pixabay_key:""')
    .replace(/google_webfonts_key=(?:"[^"]*"\s*\+\s*)*"[^"]*"/g, 'google_webfonts_key=""')
}

const kb = (f) => `${(fs.statSync(path.join(dest, f)).size / 1024).toFixed(0)} KB`
log(`done: frontend/public/studio/minipaint.js ${kb('minipaint.js')}`)
if (!keep) fs.rmSync(work, { recursive: true, force: true })
