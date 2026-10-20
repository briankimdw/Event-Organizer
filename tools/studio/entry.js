/*
 * photomatch Studio bridge (runs inside the Studio iframe, bundled together with miniPaint).
 *
 * Upstream miniPaint files are NOT modified. This entry:
 *   1. adjusts miniPaint's exported config objects before miniPaint starts (dark theme only, no
 *      third-party network features: no Pixabay image search, no Google Fonts list, no "External"
 *      links), then imports upstream src/js/main.js unchanged;
 *   2. exposes window.studioBridge for the host app (same origin), documented in docs/STUDIO.md:
 *        studioBridge.ready                       Promise, resolves once miniPaint has started
 *        studioBridge.open(blobOrUrl, { name })   -> Promise<{ width, height }>  (replaces the document)
 *        studioBridge.exportImage({ type, quality, maxEdge, background }) -> Promise<{ blob, width, height }>
 *        studioBridge.isDirty()                   true after any undoable change since open()
 *        studioBridge.onChange = (dirty) => {}    called when isDirty() may have changed
 *        studioBridge.onEscape = () => {}         Escape pressed with no miniPaint popup or menu open
 *
 * Copyright (c) 2026 photomatch contributors. MIT License.
 */
import config from 'minipaint/js/config.js'
import menu from 'minipaint/js/config-menu.js'
import app from 'minipaint/js/app.js'
import 'minipaint/js/main.js'
import './studio-overrides.css'

// ---- 1. configuration (before miniPaint's own window "load" handler runs) ----
config.pixabay_key = ''
config.google_webfonts_key = ''
config.themes = ['dark']
config.COLOR = '#ffffff' // brush / text colour to start with (miniPaint's default is green)
// Only fonts every device has; other families would be fetched from Google Fonts.
config.FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Times New Roman', 'Courier', 'Monospace', 'Impact']
config.TOOLS = config.TOOLS.filter((t) => t.name !== 'media') // Pixabay image search

const DROP_TARGETS = new Set([
  'file/open.search', // Pixabay
  'file/open.open_template_test',
])
const DROP_NAMES = new Set(['External', 'Report Issues', 'Search Images'])
function prune(items) {
  if (!Array.isArray(items)) return items
  const out = items.filter((it) => !(it && (DROP_TARGETS.has(it.target) || DROP_NAMES.has(it.name) || it.href)))
  for (const it of out) if (it && it.children) it.children = prune(it.children)
  // No leading, trailing or doubled dividers.
  return out.filter((it, i, a) => !(it.divider && (i === 0 || i === a.length - 1 || a[i - 1].divider)))
}
menu.splice(0, menu.length, ...prune(menu))

// ---- 2. the bridge ----
let resolveReady
const ready = new Promise((r) => { resolveReady = r })
let lastDirty = false

const bridge = {
  ready,
  onChange: null,
  onEscape: null,
  isDirty,
  open,
  exportImage,
  version: typeof VERSION !== 'undefined' ? VERSION : '',
}
window.studioBridge = bridge

function isDirty() {
  return !!(app.State && app.State.action_history_index > 0)
}

function emitChange() {
  const d = isDirty()
  if (d !== lastDirty) {
    lastDirty = d
    try { bridge.onChange && bridge.onChange(d) } catch (e) { /* host's problem */ }
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Couldn’t open this photo in Studio.'))
    img.src = src
  })
}

async function open(source, { name = 'Photo' } = {}) {
  await ready
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const img = await loadImage(url)
    if (img.decode) await img.decode().catch(() => {})
    const w = img.naturalWidth, h = img.naturalHeight
    const layer = { name, type: 'image', link: img, width: w, height: h, width_original: w, height_original: h }
    await app.State.do_action(new app.Actions.Bundle_action('open_file', 'Open File', [
      new app.Actions.Insert_layer_action(layer),
      new app.Actions.Autoresize_canvas_action(w, h, null, true, true),
    ]))
    // The opened photo is the starting point: nothing to undo yet, and not "unsaved".
    app.State.action_history = []
    app.State.action_history_index = 0
    config.need_render = true
    setTimeout(() => {
      try { app.GUI.GUI_preview.zoom_auto() } catch (e) { /* older layout */ }
      try { app.GUI.GUI_information.show_size(true) } catch (e) { /* ignore */ }
    }, 60)
    emitChange()
    return { width: config.WIDTH, height: config.HEIGHT }
  } finally {
    // The layer keeps the decoded <img>, so the object URL can go.
    if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

async function exportImage({ type = 'image/jpeg', quality = 0.92, maxEdge = 0, background = '#ffffff' } = {}) {
  await ready
  const { width, height } = app.Layers.get_dimensions()
  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  const ctx = full.getContext('2d')
  app.Layers.convert_layers_to_canvas(ctx, null, false)
  if (type === 'image/jpeg' || background) {
    // Like miniPaint's own JPG export: transparent areas become the background colour.
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = background || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }
  let out = full
  const long = Math.max(width, height)
  if (maxEdge && long > maxEdge) {
    const s = maxEdge / long
    out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(width * s))
    out.height = Math.max(1, Math.round(height * s))
    const o = out.getContext('2d')
    o.imageSmoothingEnabled = true
    o.imageSmoothingQuality = 'high'
    o.drawImage(full, 0, 0, out.width, out.height)
  }
  const blob = await new Promise((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t export the image.'))), type, quality)
  })
  return { blob, width: out.width, height: out.height }
}

// Track undo history changes (actions, undo, redo).
function wrapState() {
  const State = app.State
  for (const fn of ['do_action', 'undo', 'redo']) {
    const orig = State[fn] && State[fn].bind(State)
    if (!orig) continue
    State[fn] = async (...args) => {
      try { return await orig(...args) } finally { emitChange() }
    }
  }
}

// Escape: close an open miniPaint popup first; otherwise let the host handle it (Cancel).
function onKey(e) {
  if (e.key !== 'Escape' && e.key !== 'Esc') return
  const popups = document.getElementById('popups')
  if (popups && popups.children.length) {
    const close = popups.querySelector('[data-id="popup_cancel"], [data-id="popup_close"]')
    if (close) { e.preventDefault(); close.click() }
    return
  }
  if (document.querySelector('#main_menu [aria-expanded="true"]') || e.defaultPrevented) return
  if (bridge.onEscape) { e.preventDefault(); bridge.onEscape() }
}

window.addEventListener('load', () => {
  // miniPaint's own "load" handler (registered first, in main.js) has run by now.
  setTimeout(() => {
    try { app.GUI.change_theme('dark') } catch (e) { /* ignore */ }
    wrapState()
    document.addEventListener('keydown', onKey)
    document.documentElement.classList.add('studio-ready')
    resolveReady()
  }, 0)
})
