// The photo edit recipe: a small, plain-JSON description of every edit, applied on top of the
// untouched original (non-destructive). Shared by web (renderWeb.js) and mobile (Skia), and
// stored in photos.edit_recipe (null = unedited). Plain JS: no DOM, no React.
//
// Shape (v1):
// {
//   v: 1,
//   crop: { x, y, w, h },     // normalized 0..1 of the ORIENTED frame (after rotate + flipH), axis-aligned;
//                             // the straightened image turns underneath it (see geometry.js)
//   aspect: 'original' | 'free' | '1:1' | '4:5' | '5:4' | '3:2' | '2:3' | '16:9' | '9:16',
//   rotate: 0 | 90 | 180 | 270,  // clockwise quarter turns
//   straighten: -45..45,         // degrees, positive turns the picture clockwise
//   flipH: boolean,              // mirror left-right (applied after rotate, so it's always left-right on screen)
//   adjust: { exposure, contrast, highlights, shadows, whites, blacks,          // -100..100
//             temperature, tint, vibrance, saturation,                         // -100..100
//             clarity (-100..100), sharpen (0..100), vignette (-100..100), grain (0..100), fade (0..100) },
//   filter: { id, strength 0..100 } | null,   // a look from `presets`, layered under `adjust`
// }
//
// The effective adjustments are `adjust + preset.adjust * strength / 100` (clamped): see effectiveAdjust().

export const RECIPE_VERSION = 1

// Every slider, in the order the editor shows them. `group` is the editor tab.
export const ADJUSTMENTS = [
  { key: 'exposure', label: 'Exposure', group: 'light', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', group: 'light', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', group: 'light', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', group: 'light', min: -100, max: 100 },
  { key: 'whites', label: 'Whites', group: 'light', min: -100, max: 100 },
  { key: 'blacks', label: 'Blacks', group: 'light', min: -100, max: 100 },
  { key: 'temperature', label: 'Temperature', group: 'color', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', group: 'color', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', group: 'color', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', group: 'color', min: -100, max: 100 },
  { key: 'clarity', label: 'Clarity', group: 'effects', min: -100, max: 100 },
  { key: 'sharpen', label: 'Sharpen', group: 'effects', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette', group: 'effects', min: -100, max: 100 },
  { key: 'grain', label: 'Grain', group: 'effects', min: 0, max: 100 },
  { key: 'fade', label: 'Fade', group: 'effects', min: 0, max: 100 },
]
export const ADJUST_KEYS = ADJUSTMENTS.map((a) => a.key)
const RANGE = Object.fromEntries(ADJUSTMENTS.map((a) => [a.key, a]))

// Exposure slider -> stops: ±100 is ±2 EV.
export const EV_PER_UNIT = 2 / 100
export const exposureToEv = (exposure) => (Number(exposure) || 0) * EV_PER_UNIT

// Crop aspect presets. ratio = width / height of the crop in pixels; null = free,
// 'original' = the oriented photo's own ratio. `swap` is the same shape turned 90°.
export const ASPECTS = [
  { id: 'original', label: 'Original', ratio: 'original' },
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: 'Square', ratio: 1, swap: '1:1' },
  { id: '4:5', label: '4:5', ratio: 4 / 5, swap: '5:4' },
  { id: '5:4', label: '5:4', ratio: 5 / 4, swap: '4:5', hidden: true },
  { id: '3:2', label: '3:2', ratio: 3 / 2, swap: '2:3' },
  { id: '2:3', label: '2:3', ratio: 2 / 3, swap: '3:2', hidden: true },
  { id: '16:9', label: '16:9', ratio: 16 / 9, swap: '9:16' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, swap: '16:9', hidden: true },
]
const ASPECT_BY_ID = Object.fromEntries(ASPECTS.map((a) => [a.id, a]))

// Width / height of an aspect for a photo whose oriented frame is frameW x frameH (pixels);
// null for 'free'.
export function aspectRatio(aspect, frameW = 1, frameH = 1) {
  const a = ASPECT_BY_ID[aspect]
  if (!a || a.ratio === null) return null
  return a.ratio === 'original' ? frameW / frameH : a.ratio
}

export const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 })
export const MIN_CROP = 0.02 // smallest crop side, as a fraction of the frame

export function defaultRecipe() {
  return {
    v: RECIPE_VERSION,
    crop: { ...FULL_CROP },
    aspect: 'original',
    rotate: 0,
    straighten: 0,
    flipH: false,
    adjust: Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0])),
    filter: null,
  }
}

// ---------------------------------------------------------------------------
// Presets ("looks"): defined as plain adjustments so they're transparent and editable
// (bakeFilter() turns the active look into slider values). Tuned to stay tasteful at 100.
// ---------------------------------------------------------------------------
export const PRESETS = [
  { id: 'vivid', name: 'Vivid', adjust: { contrast: 18, vibrance: 32, saturation: 6, clarity: 12, blacks: -6 } },
  { id: 'golden', name: 'Golden', adjust: { temperature: 28, tint: 6, contrast: 10, highlights: -18, shadows: 8, vibrance: 12, fade: 12, grain: 12 } },
  { id: 'portra', name: 'Portra', adjust: { temperature: 12, tint: 7, contrast: -8, highlights: -28, shadows: 16, saturation: -10, vibrance: 14, fade: 10, grain: 14 } },
  { id: 'airy', name: 'Airy', adjust: { exposure: 14, contrast: -16, highlights: -22, shadows: 28, whites: 8, vibrance: 8, temperature: 5, fade: 6 } },
  { id: 'coastal', name: 'Coastal', adjust: { temperature: -20, tint: -4, contrast: -10, shadows: 12, saturation: -12, fade: 24 } },
  { id: 'editorial', name: 'Editorial', adjust: { contrast: 26, blacks: -16, whites: 10, saturation: -20, clarity: 16, vignette: -16 } },
  { id: 'moody', name: 'Moody', adjust: { exposure: -10, contrast: 20, highlights: -32, shadows: -10, saturation: -26, temperature: -6, vignette: -28, fade: 8 } },
  { id: 'dusk', name: 'Dusk', adjust: { temperature: -10, tint: 10, contrast: 14, highlights: -20, saturation: -6, vignette: -20, fade: 6 } },
  { id: 'expired', name: 'Expired', adjust: { temperature: 16, tint: -8, contrast: 6, saturation: -16, fade: 34, grain: 30, vignette: -12 } },
  { id: 'mono', name: 'Mono', adjust: { saturation: -100, contrast: 22, clarity: 10, grain: 10 } },
  { id: 'mono-matte', name: 'Mono Matte', adjust: { saturation: -100, contrast: -10, shadows: 10, fade: 30, grain: 20 } },
]
export const presets = PRESETS // contract alias
const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]))
export const getPreset = (id) => PRESET_BY_ID[id] || null

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round = (v, step) => Math.round(v / step) * step
const r4 = (v) => Math.round(v * 10000) / 10000

export function clampAdjust(key, value) {
  const r = RANGE[key]
  return r ? clamp(Math.round(num(value)), r.min, r.max) : 0
}

function normalizeCrop(c) {
  if (!c || typeof c !== 'object') return { ...FULL_CROP }
  let w = clamp(num(c.w, 1), MIN_CROP, 1)
  let h = clamp(num(c.h, 1), MIN_CROP, 1)
  const x = clamp(num(c.x, 0), 0, 1 - w)
  const y = clamp(num(c.y, 0), 0, 1 - h)
  w = Math.min(w, 1 - x)
  h = Math.min(h, 1 - y)
  return { x: r4(x), y: r4(y), w: r4(w), h: r4(h) }
}

// Any value (null, a partial object, an older version, JSON text) -> a complete, valid recipe.
// Never throws. Unknown keys are dropped; numbers are clamped and rounded.
export function normalize(input) {
  let r = input
  if (typeof r === 'string') {
    try { r = JSON.parse(r) } catch { r = null }
  }
  const out = defaultRecipe()
  if (!r || typeof r !== 'object' || Array.isArray(r)) return out
  r = migrate(r)
  out.crop = normalizeCrop(r.crop)
  out.aspect = ASPECT_BY_ID[r.aspect] ? r.aspect : r.crop && typeof r.crop === 'object' ? 'free' : 'original'
  out.rotate = ((Math.round(num(r.rotate) / 90) * 90) % 360 + 360) % 360
  out.straighten = clamp(round(num(r.straighten), 0.1), -45, 45)
  if (Object.is(out.straighten, -0)) out.straighten = 0
  out.flipH = r.flipH === true
  const adj = r.adjust && typeof r.adjust === 'object' ? r.adjust : {}
  for (const k of ADJUST_KEYS) out.adjust[k] = clampAdjust(k, adj[k])
  const f = r.filter
  const fid = typeof f === 'string' ? f : f?.id
  if (fid && PRESET_BY_ID[fid]) {
    const strength = clamp(Math.round(num(typeof f === 'object' ? f.strength : 100, 100)), 0, 100)
    out.filter = strength > 0 ? { id: fid, strength } : null
  }
  return out
}

// Older recipe versions -> the current shape. (v1 is the first; this is where v2 will map.)
function migrate(r) {
  const v = num(r.v, RECIPE_VERSION)
  if (v > RECIPE_VERSION) return r // from a newer app: keep what we understand
  return r
}

// ---------------------------------------------------------------------------
// Questions about a recipe
// ---------------------------------------------------------------------------
export const hasCrop = (r) => {
  const c = r?.crop || FULL_CROP
  return c.x > 0.0005 || c.y > 0.0005 || c.w < 0.9995 || c.h < 0.9995
}
export const hasGeometry = (r) => !!r && (hasCrop(r) || r.rotate !== 0 || r.straighten !== 0 || r.flipH)
export const hasColor = (r) => {
  const e = effectiveAdjust(r)
  return ADJUST_KEYS.some((k) => e[k] !== 0)
}

// True when the recipe changes nothing (save it as null).
export function isIdentity(input) {
  if (input == null) return true
  const r = normalize(input)
  return !hasGeometry(r) && !hasColor(r)
}

// The adjustments actually rendered: the user's sliders plus the active look at its strength.
export function effectiveAdjust(input) {
  const r = input?.adjust && input.v ? input : normalize(input)
  const out = { ...r.adjust }
  const preset = r.filter && PRESET_BY_ID[r.filter.id]
  if (preset) {
    const s = (r.filter.strength ?? 100) / 100
    for (const [k, v] of Object.entries(preset.adjust)) out[k] = clampAdjust(k, (out[k] || 0) + v * s)
  }
  return out
}

// Turn the active look into plain slider values (filter becomes null).
export function bakeFilter(input) {
  const r = normalize(input)
  return { ...r, adjust: effectiveAdjust(r), filter: null }
}

// Compact form for storage: normalized, zero adjustments left out, null when it's an identity.
export function toStorable(input) {
  if (isIdentity(input)) return null
  const r = normalize(input)
  const adjust = Object.fromEntries(Object.entries(r.adjust).filter(([, v]) => v !== 0))
  const out = { v: r.v }
  if (hasCrop(r) || r.aspect !== 'original') { out.crop = r.crop; out.aspect = r.aspect }
  if (r.rotate) out.rotate = r.rotate
  if (r.straighten) out.straighten = r.straighten
  if (r.flipH) out.flipH = true
  if (Object.keys(adjust).length) out.adjust = adjust
  if (r.filter) out.filter = r.filter
  return out
}

// Structural equality on the normalized form (for undo/redo and "unsaved changes").
export const sameRecipe = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))

// ---------------------------------------------------------------------------
// describe(): a short human summary, e.g. "Portra · Warm · +0.3 EV · cropped 4:5"
// ---------------------------------------------------------------------------
const signed = (n, digits = 1, strip = true) => {
  const t = Math.abs(n).toFixed(digits)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${strip ? t.replace(/\.0+$/, '') : t}`
}

export function describe(input) {
  if (input == null) return 'Original'
  const r = normalize(input)
  const e = effectiveAdjust(r)
  const parts = []
  const preset = r.filter && PRESET_BY_ID[r.filter.id]
  if (preset) parts.push(r.filter.strength < 100 ? `${preset.name} ${r.filter.strength}%` : preset.name)
  if (e.saturation <= -95 && !(preset && preset.adjust.saturation <= -95)) parts.push('B&W')
  if (r.adjust.temperature >= 10) parts.push('Warm')
  else if (r.adjust.temperature <= -10) parts.push('Cool')
  if (r.adjust.exposure !== 0) parts.push(`${signed(exposureToEv(r.adjust.exposure))} EV`)
  const shown = new Set(['temperature', 'exposure'])
  const others = ADJUST_KEYS.filter((k) => !shown.has(k) && r.adjust[k] !== 0)
  if (others.length === 1) {
    const a = RANGE[others[0]]
    parts.push(`${a.label} ${signed(r.adjust[others[0]], 0)}`)
  } else if (others.length > 1) {
    parts.push(`${others.length} adjustments`)
  }
  if (hasCrop(r)) parts.push(r.aspect === 'free' || r.aspect === 'original' ? 'cropped' : `cropped ${r.aspect}`)
  if (r.straighten) parts.push(`straightened ${signed(r.straighten)}°`)
  if (r.rotate) parts.push(`rotated ${r.rotate}°`)
  if (r.flipH) parts.push('flipped')
  return parts.length ? parts.join(' · ') : 'Original'
}

// Format a slider's value for display / aria-valuetext.
export function formatAdjust(key, value) {
  const v = Number(value) || 0
  if (key === 'exposure') return v === 0 ? '0 EV' : `${signed(exposureToEv(v), 2, false)} EV`
  if (v === 0) return '0'
  return RANGE[key]?.min === 0 ? String(v) : signed(v, 0)
}
