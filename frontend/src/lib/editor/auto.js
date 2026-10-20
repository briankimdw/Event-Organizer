// Auto-enhance: look at a (downscaled) photo and suggest recipe sliders, like Lightroom's "Auto".
// Plain JS, no DOM, shared with mobile. Pass pixel data in; get slider values out.
//
//   const res = autoEnhance({ data, width, height })          // data: RGBA (or RGB with channels: 3) bytes
//   change((r) => applyAuto(r, res.adjust))                     // sets only the AUTO_KEYS sliders
//
// How it works (conservative on purpose: a good photo should come back almost untouched):
//  1. Sample up to ~12k pixels (transparent ones are skipped; `region` limits it to the crop).
//  2. White balance: "grey pixels" (see whiteBalance): the pixels whose local contrast is the same in
//     R, G and B are neutral surfaces whatever the light, so their colour is the cast. Measured in
//     linear light and turned into Temperature / Tint by inverting colorMath's white-balance gains.
//     Applied at 75% x confidence (half that in low-key scenes, which are usually lit in colour on
//     purpose), capped at ±35 / ±20, keeping a little warmth (golden light is usually intended);
//     skipped for B&W photos and when no neutral surface is found (better no change than a wrong one).
//  3. Exposure: if the median luma is outside 0.40..0.55, binary-search the EV (through the real
//     pipeline, applyToPixel) that brings it to the nearest edge of that band (brightening goes only
//     70% of the way; at most +1 / -1.5 EV);
//     back off while the brightest 0.5% would pass 0.97 or clip, so lights stay lights.
//  4. Tone: highlights / shadows recover big bright / dark areas; whites / blacks stretch the ends
//     of the histogram when they don't reach them (or relax clipping); contrast lifts flat photos.
//  5. Vibrance for dull colour (never saturation, which is the garish one).
//  6. A final simulated render checks that clipping didn't get worse; if it did, everything is scaled back.
// Every value is an integer slider value within the recipe ranges.
import { applyToPixel, uniformsFor, srgbToLinear, LUMA } from './colorMath.js'

export const AUTO_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temperature', 'tint', 'vibrance']
export const AUTO_SAMPLE_EDGE = 256 // callers: downscale to about this long edge before calling autoEnhance
const MAX_SAMPLES = 12000
const MEDIAN_BAND = [0.4, 0.55] // median luma (sRGB) of a normally exposed photo

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const lumaOf = (r, g, b) => r * LUMA[0] + g * LUMA[1] + b * LUMA[2]
const zeroAdjust = () => Object.fromEntries(AUTO_KEYS.map((k) => [k, 0]))

/**
 * Pick pixels from raw image data. Returns a Float32Array of sRGB triplets (0..1).
 * opts.channels: 4 (RGBA, default) or 3. opts.region: { x, y, w, h } in 0..1 of the image.
 */
export function samplePixels(data, width, height, { channels = 4, region = null, maxSamples = MAX_SAMPLES } = {}) {
  const x0 = Math.floor(clamp(region?.x ?? 0, 0, 1) * width)
  const y0 = Math.floor(clamp(region?.y ?? 0, 0, 1) * height)
  const x1 = Math.max(x0 + 1, Math.ceil(clamp((region?.x ?? 0) + (region?.w ?? 1), 0, 1) * width))
  const y1 = Math.max(y0 + 1, Math.ceil(clamp((region?.y ?? 0) + (region?.h ?? 1), 0, 1) * height))
  const area = (x1 - x0) * (y1 - y0)
  const step = Math.max(1, Math.sqrt(area / maxSamples))
  const out = []
  for (let fy = y0; fy < y1; fy += step) {
    const y = Math.floor(fy)
    for (let fx = x0; fx < x1; fx += step) {
      const i = (y * width + Math.floor(fx)) * channels
      if (i + 2 >= data.length) continue
      if (channels === 4 && data[i + 3] < 128) continue
      out.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    }
  }
  return Float32Array.from(out)
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const i = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1)
  return sorted[i]
}

// Render the samples through the real pipeline and measure the result.
function measure(samples, adjust) {
  const u = uniformsFor(adjust)
  const n = samples.length / 3
  const Y = new Float32Array(n)
  let chroma = 0, clipped = 0, lo = 0, hi = 0, crushed = 0
  for (let k = 0; k < n; k++) {
    const o = adjust ? applyToPixel([samples[3 * k], samples[3 * k + 1], samples[3 * k + 2]], u) : [samples[3 * k], samples[3 * k + 1], samples[3 * k + 2]]
    const y = lumaOf(o[0], o[1], o[2])
    Y[k] = y
    chroma += Math.max(o[0], o[1], o[2]) - Math.min(o[0], o[1], o[2])
    if (Math.max(o[0], o[1], o[2]) >= 0.996) clipped++
    if (y < 0.12) lo++
    if (y > 0.88) hi++
    if (y < 0.012) crushed++
  }
  Y.sort()
  return {
    median: percentile(Y, 0.5), p005: percentile(Y, 0.005), p05: percentile(Y, 0.05), p95: percentile(Y, 0.95), p995: percentile(Y, 0.995),
    chroma: chroma / n, clipped: clipped / n, lo: lo / n, hi: hi / n, crushed: crushed / n,
  }
}

// White balance: { temperature, tint, confidence }, from the 2-D image.
// "Grey pixels" (after Yang, Gao & Li, CVPR 2015): in log space the illuminant is a constant per
// channel, so a pixel's local contrast (|Laplacian of log|) doesn't depend on the colour cast. On a
// neutral surface (a grey wall and its dark windows, a white shirt's folds) all three channels have
// the same local contrast; on foliage, sky or skin they don't. We keep the most "grey" pixels, drop
// the ones far from the group (and casts beyond 2x, which aren't white-balance errors), and read
// the cast from their colour. Smooth areas carry no contrast and don't vote, so a big blue sky
// can't be mistaken for a neutral. No grey pixels found -> confidence 0 -> no correction.
const LIN = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))
const LOGLIN = LIN.map((v) => Math.log(v + 0.002))

function whiteBalance(data, width, height, channels, region) {
  const step = Math.max(1, Math.round(Math.max(width, height) / 256))
  const x0 = Math.floor(clamp(region?.x ?? 0, 0, 1) * width) + step
  const y0 = Math.floor(clamp(region?.y ?? 0, 0, 1) * height) + step
  const x1 = Math.ceil(clamp((region?.x ?? 0) + (region?.w ?? 1), 0, 1) * width) - step
  const y1 = Math.ceil(clamp((region?.y ?? 0) + (region?.h ?? 1), 0, 1) * height) - step
  const at = (x, y) => (y * width + x) * channels
  const ok = (i) => (channels !== 4 || data[i + 3] >= 128) &&
    data[i] > 6 && data[i + 1] > 6 && data[i + 2] > 6 && data[i] < 250 && data[i + 1] < 250 && data[i + 2] < 250
  const cand = []
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = at(x, y), n = [at(x - step, y), at(x + step, y), at(x, y - step), at(x, y + step)]
      if (!ok(i) || !n.every(ok)) continue
      const C = [0, 1, 2].map((c) => Math.abs(4 * LOGLIN[data[i + c]] - LOGLIN[data[n[0] + c]] - LOGLIN[data[n[1] + c]] - LOGLIN[data[n[2] + c]] - LOGLIN[data[n[3] + c]]))
      const mean = (C[0] + C[1] + C[2]) / 3
      if (mean < 0.05) continue // flat: no evidence either way
      const gi = Math.sqrt(((C[0] - mean) ** 2 + (C[1] - mean) ** 2 + (C[2] - mean) ** 2) / 3) / mean
      const lr = LIN[data[i]], lg = LIN[data[i + 1]], lb = LIN[data[i + 2]]
      const cr = Math.log2(lr / lg), cb = Math.log2(lb / lg)
      if (Math.hypot(cr, cb) > 1.3) continue // a "cast" beyond ~2.5x is a coloured surface, not the light
      cand.push({ gi, cr, cb, w: 0.2 + lumaOf(lr, lg, lb) })
    }
  }
  if (cand.length < 20) return { temperature: 0, tint: 0, confidence: 0 }
  cand.sort((a, b) => a.gi - b.gi)
  let best = cand.slice(0, Math.max(12, Math.round(cand.length * 0.05))).filter((p) => p.gi < 0.2)
  if (best.length < 8) return { temperature: 0, tint: 0, confidence: 0 }
  // Robust centre: the median chromaticity, then a weighted mean of the points near it.
  const med = (arr) => { const a = [...arr].sort((p, q) => p - q); return a[a.length >> 1] }
  const mR = med(best.map((p) => p.cr)), mB = med(best.map((p) => p.cb))
  best = best.filter((p) => Math.hypot(p.cr - mR, p.cb - mB) < 0.25)
  if (best.length < 6) return { temperature: 0, tint: 0, confidence: 0 }
  let sr = 0, sb = 0, sw = 0
  for (const p of best) { sr += p.cr * p.w; sb += p.cb * p.w; sw += p.w }
  // colorMath: log2(gainR / gainG) = 0.6T + 0.6G, log2(gainB / gainG) = -0.6T + 0.6G (T, G = slider / 100).
  const cr = -sr / sw, cb = -sb / sw
  return { temperature: ((cr - cb) / 1.2) * 100, tint: ((cr + cb) / 1.2) * 100, confidence: clamp(best.length / 40, 0, 1) }
}

// The EV (stops) that brings the median luma to `target`, through the real pipeline.
function solveExposure(samples, base, target) {
  let lo = -2, hi = 2
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const m = measure(samples, { ...base, exposure: mid * 50 }).median
    if (m < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Suggest slider values for a photo.
 * input: { data, width, height, channels? = 4 } (an ImageData works). Downscale to ~AUTO_SAMPLE_EDGE first.
 * opts: { region?: {x,y,w,h} 0..1, strength?: 0..1 (default 1) }
 * Returns { adjust: { exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance },
 *           mono: boolean, before: stats, after: stats }.
 */
export function autoEnhance(input, { region = null, strength = 1, channels } = {}) {
  const ch = channels ?? input?.channels ?? 4
  const samples = input?.data ? samplePixels(input.data, input.width, input.height, { channels: ch, region }) : new Float32Array(0)
  const adjust = zeroAdjust()
  if (samples.length / 3 < 16) return { adjust, mono: false, before: null, after: null }

  const before = measure(samples, null)
  // B&W (or nearly): no white balance, no vibrance.
  const mono = before.chroma < 0.025

  // ---- white balance ----
  if (!mono) {
    const wb = whiteBalance(input.data, input.width, input.height, ch, region)
    // Few neutral pixels: trust the estimate less. Low-key scenes (concerts, night, candle light)
    // are usually lit in colour on purpose: half strength.
    const k = 0.75 * wb.confidence * (before.median < 0.22 ? 0.5 : 1)
    let t = wb.temperature * k
    const g = wb.tint * k
    if (t < 0) t *= 0.85 // keep a little warmth: golden light is usually on purpose
    adjust.temperature = Math.abs(t) < 4 ? 0 : clamp(Math.round(t), -35, 35)
    adjust.tint = Math.abs(g) < 4 ? 0 : clamp(Math.round(g), -20, 20)
  }

  // ---- exposure ----
  // A median anywhere in MEDIAN_BAND is fine as shot; otherwise bring it to the band's near edge.
  // Clipped photos aren't pulled down far: clipped white would only turn grey.
  const m0 = measure(samples, adjust).median
  let ev = m0 < MEDIAN_BAND[0] ? solveExposure(samples, adjust, MEDIAN_BAND[0]) : m0 > MEDIAN_BAND[1] ? solveExposure(samples, adjust, MEDIAN_BAND[1]) : 0
  if (Math.abs(ev) < 0.06) ev = 0
  if (ev > 0) ev *= 0.7 // dark photos are often dark on purpose (a lit subject on a dark ground): go part way
  ev = clamp(ev, before.clipped > 0.05 ? -0.8 : -1.5, 1)
  // Don't brighten the highlights away: a low-key photo with bright lights keeps its lights, and
  // its shadows get lifted below instead. Stop when the brightest 1% would pass 0.97 (or clip more).
  for (let i = 0; i < 20 && ev > 0; i++) {
    const m = measure(samples, { ...adjust, exposure: ev * 50 })
    if (m.clipped <= Math.max(before.clipped + 0.01, 0.015) && m.p995 <= Math.max(0.97, before.p995 + 0.01)) break
    ev = Math.max(0, ev - 0.08)
  }
  adjust.exposure = Math.round(ev * 50)

  // ---- tone ----
  const m1 = measure(samples, adjust)
  const hiShare = Math.max(m1.hi, before.hi * 0.6)
  if (hiShare > 0.06) adjust.highlights = -Math.round(clamp((hiShare - 0.03) * 220, 0, 55))
  if (m1.lo > 0.1) adjust.shadows = Math.round(clamp((m1.lo - 0.06) * 180, 0, 45))
  // Stretch the ends only when they fall short (and not against an exposure cut).
  if (m1.p995 < 0.92 && before.clipped < 0.01 && ev >= 0) adjust.whites = Math.round(clamp(((0.95 - m1.p995) / 0.2) * 100 * 0.5, 0, 25))
  else if (before.clipped > 0.03) adjust.whites = -Math.round(clamp(before.clipped * 60, 4, 20))
  if (m1.p005 > 0.07) adjust.blacks = -Math.round(clamp(((m1.p005 - 0.03) / 0.1) * 100 * 0.5, 0, 30))
  else if (m1.crushed > 0.04) adjust.blacks = Math.round(clamp(m1.crushed * 200, 0, 15))

  // ---- contrast (after the tone moves) ----
  const m2 = measure(samples, adjust)
  const spread = m2.p95 - m2.p05
  if (spread < 0.62) adjust.contrast = Math.round(clamp((0.62 - spread) * 70, 0, 25))
  else if (spread > 0.9) adjust.contrast = -Math.round(clamp((spread - 0.9) * 100, 0, 12))

  // ---- vibrance ----
  if (!mono) {
    const m3 = measure(samples, adjust)
    adjust.vibrance = Math.round(clamp((0.2 - m3.chroma) * 120, 0, 25))
    if (adjust.vibrance < 4) adjust.vibrance = 0
  }

  // ---- strength, then a safety check on clipping ----
  const s = clamp(Number(strength) || 0, 0, 1)
  for (const k of AUTO_KEYS) adjust[k] = Math.round(adjust[k] * s)
  let after = measure(samples, adjust)
  for (let i = 0; i < 3 && after.clipped > Math.max(before.clipped + 0.02, 0.04); i++) {
    for (const k of ['exposure', 'whites', 'contrast']) if (adjust[k] > 0) adjust[k] = Math.round(adjust[k] * 0.7)
    after = measure(samples, adjust)
  }
  for (const k of AUTO_KEYS) adjust[k] = Math.abs(adjust[k]) < 3 ? 0 : clamp(adjust[k], -100, 100) // tiny moves are noise; also no -0
  return { adjust, mono, before, after }
}

// Put auto values into a recipe: only the AUTO_KEYS sliders change (clarity, effects, the look and
// the crop are kept). Returns a new recipe.
export function applyAuto(recipe, adjust) {
  const next = { ...(recipe?.adjust || {}) }
  for (const k of AUTO_KEYS) next[k] = Math.round(Number(adjust?.[k]) || 0)
  return { ...recipe, adjust: next }
}

// True when the recipe's AUTO_KEYS sliders already equal `adjust`.
export function isAutoApplied(recipe, adjust) {
  return !!adjust && AUTO_KEYS.every((k) => (recipe?.adjust?.[k] || 0) === (adjust[k] || 0))
}

// A short description for a live region / status line, e.g. "+0.4 EV, cooler, more vibrance".
export function describeAuto(adjust) {
  if (!adjust) return 'No changes'
  const parts = []
  if (adjust.exposure) parts.push(`${adjust.exposure > 0 ? '+' : '−'}${Math.abs(adjust.exposure / 50).toFixed(1)} EV`)
  if (Math.abs(adjust.temperature) >= 4) parts.push(adjust.temperature > 0 ? 'warmer' : 'cooler')
  if (Math.abs(adjust.tint) >= 4) parts.push(adjust.tint > 0 ? 'more magenta' : 'more green')
  if (adjust.highlights < 0) parts.push('highlights recovered')
  if (adjust.shadows > 0) parts.push('shadows lifted')
  if (adjust.contrast > 0) parts.push('more contrast')
  if (adjust.contrast < 0) parts.push('softer contrast')
  if (adjust.vibrance > 0) parts.push('more vibrance')
  if (!parts.length && (adjust.whites || adjust.blacks)) parts.push('tones balanced')
  return parts.length ? parts.join(', ') : 'Already looks balanced'
}
