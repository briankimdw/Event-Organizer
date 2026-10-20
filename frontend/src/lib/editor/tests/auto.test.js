import test from 'node:test'
import assert from 'node:assert/strict'
import { autoEnhance, applyAuto, isAutoApplied, describeAuto, samplePixels, AUTO_KEYS } from '../auto.js'
import { applyToPixel, uniformsFor, srgbToLinear, linearToSrgb, LUMA } from '../colorMath.js'
import { normalize, effectiveAdjust } from '../recipe.js'

// ---------------------------------------------------------------------------
// Synthetic photos: a small outdoor-ish scene (sky, foliage, a skin-tone subject, shadows and a
// tonal ramp), built in sRGB, then pushed through linear-light gain / colour cast to simulate
// under- and over-exposure and white-balance errors.
// ---------------------------------------------------------------------------
const W = 120, H = 80
const fract = (x) => x - Math.floor(x)
const noise = (x, y) => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453)

function sceneColor(x, y) {
  const u = x / W, v = y / H
  const n = (noise(x, y) - 0.5) * 0.06
  if (v > 0.9) { const t = u; return [t, t, t] } // tonal ramp: black to white
  const dx = u - 0.62, dy = v - 0.5
  if (dx * dx + dy * dy < 0.012) return [0.86 + n, 0.66 + n, 0.55 + n] // face
  if (v < 0.28) return [0.5 + 0.15 * u + n, 0.66 + 0.1 * u + n, 0.9 + n] // sky
  if (v < 0.7 && u < 0.38) { // a grey building with darker windows
    const win = (Math.floor(x / 6) % 2 === 0 && Math.floor(y / 7) % 2 === 0) ? 0.3 : 0.68 + 0.1 * v
    return [win + n, win + n, win + 0.01 + n]
  }
  if (v < 0.7) {
    const t = 0.5 + 0.5 * Math.sin(u * 17 + v * 9)
    return [0.22 + 0.2 * t + n, 0.42 + 0.22 * t + n, 0.16 + 0.1 * t + n] // foliage
  }
  const t = 0.5 + 0.5 * Math.sin(u * 23)
  return [0.12 + 0.3 * t + n, 0.1 + 0.27 * t + n, 0.09 + 0.22 * t + n] // ground / shadows
}

// gain: linear-light multiplier (0.25 = −2 EV). cast: per-channel linear multipliers.
function makeImage({ gain = 1, cast = [1, 1, 1], gray = false, alphaHole = false } = {}) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = sceneColor(x, y).map((v) => Math.min(1, Math.max(0, v)))
    if (gray) { const l = c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]; c = [l, l, l] }
    const o = c.map((v, i) => linearToSrgb(Math.min(1, srgbToLinear(v) * gain * cast[i])))
    const k = (y * W + x) * 4
    data[k] = Math.round(o[0] * 255); data[k + 1] = Math.round(o[1] * 255); data[k + 2] = Math.round(o[2] * 255)
    data[k + 3] = alphaHole && x < W / 2 ? 0 : 255
  }
  return { data, width: W, height: H }
}

// Render an image through a recipe adjust (CPU reference) and measure it.
function stats(img, adjust = {}) {
  const u = uniformsFor(effectiveAdjust(normalize({ adjust })))
  const s = samplePixels(img.data, img.width, img.height)
  const Y = []
  let r = 0, g = 0, b = 0, chroma = 0
  for (let i = 0; i < s.length; i += 3) {
    const o = applyToPixel([s[i], s[i + 1], s[i + 2]], u)
    Y.push(o[0] * LUMA[0] + o[1] * LUMA[1] + o[2] * LUMA[2])
    r += srgbToLinear(o[0]); g += srgbToLinear(o[1]); b += srgbToLinear(o[2])
    chroma += Math.max(...o) - Math.min(...o)
  }
  Y.sort((a, c) => a - c)
  const n = Y.length
  return { median: Y[n >> 1], rg: Math.log2(r / g), bg: Math.log2(b / g), chroma: chroma / n }
}

const reference = makeImage()
const ref = stats(reference)

test('a well-exposed, neutral photo is left almost alone', () => {
  const { adjust } = autoEnhance(reference)
  for (const k of AUTO_KEYS) assert.ok(Math.abs(adjust[k]) <= 15, `${k} = ${adjust[k]}`)
  assert.ok(Math.abs(adjust.exposure) <= 10, `exposure ${adjust.exposure}`)
  assert.ok(Math.abs(adjust.temperature) <= 8 && Math.abs(adjust.tint) <= 8, `wb ${adjust.temperature}/${adjust.tint}`)
})

test('underexposed (−2 EV): brightens toward the reference, without clipping', () => {
  const dark = makeImage({ gain: 0.25 })
  const { adjust, after, before } = autoEnhance(dark)
  assert.ok(adjust.exposure >= 20, `exposure ${adjust.exposure}`)
  const out = stats(dark, adjust)
  assert.ok(stats(dark).median < 0.3)
  assert.ok(out.median >= 0.35 && out.median > stats(dark).median + 0.07, `median ${stats(dark).median} -> ${out.median}`)
  assert.ok(after.clipped <= before.clipped + 0.03, `clipped ${after.clipped}`)
})

test('overexposed (+1.3 EV): darkens and recovers highlights', () => {
  const bright = makeImage({ gain: 2.5 })
  const { adjust } = autoEnhance(bright)
  assert.ok(adjust.exposure < 0, `exposure ${adjust.exposure}`)
  assert.ok(adjust.highlights <= 0 && adjust.whites <= 0, `highlights ${adjust.highlights}, whites ${adjust.whites}`)
  const out = stats(bright, adjust)
  assert.ok(out.median < stats(bright).median - 0.05, `median ${out.median}`)
})

test('warm (orange) cast: cools it and gets closer to neutral', () => {
  const warm = makeImage({ cast: [1.35, 1, 0.65] })
  const { adjust } = autoEnhance(warm)
  assert.ok(adjust.temperature < -10, `temperature ${adjust.temperature}`)
  const before = stats(warm), after = stats(warm, adjust)
  const dist = (s) => Math.hypot(s.rg - ref.rg, s.bg - ref.bg)
  assert.ok(dist(after) < dist(before) * 0.75, `cast ${dist(before).toFixed(3)} -> ${dist(after).toFixed(3)}`)
})

test('blue cast: warms it; green cast: adds magenta', () => {
  const blue = autoEnhance(makeImage({ cast: [0.75, 1, 1.35] })).adjust
  assert.ok(blue.temperature > 10, `temperature ${blue.temperature}`)
  const green = autoEnhance(makeImage({ cast: [0.8, 1.2, 0.8] })).adjust
  assert.ok(green.tint > 8, `tint ${green.tint}`)
})

test('never garish: every value is an in-range integer and nothing is extreme', () => {
  const cases = [
    makeImage({ gain: 0.08 }), makeImage({ gain: 6 }), makeImage({ cast: [2, 1, 0.4] }), makeImage({ cast: [0.4, 1, 2] }),
    makeImage({ gain: 0.3, cast: [1.4, 1, 0.6] }),
  ]
  for (const img of cases) {
    const { adjust } = autoEnhance(img)
    for (const k of AUTO_KEYS) {
      assert.ok(Number.isInteger(adjust[k]) && adjust[k] >= -100 && adjust[k] <= 100, `${k} = ${adjust[k]}`)
      assert.ok(!Object.is(adjust[k], -0), `${k} is -0`)
    }
    assert.ok(Math.abs(adjust.exposure) <= 75 && Math.abs(adjust.temperature) <= 35 && Math.abs(adjust.tint) <= 20)
    assert.ok(adjust.contrast <= 25 && adjust.vibrance <= 25 && adjust.shadows <= 45 && adjust.highlights >= -55)
  }
})

test('black & white photos get no white balance or vibrance', () => {
  const { adjust, mono } = autoEnhance(makeImage({ gray: true, gain: 0.3 }))
  assert.equal(mono, true)
  assert.equal(adjust.temperature, 0)
  assert.equal(adjust.tint, 0)
  assert.equal(adjust.vibrance, 0)
  assert.ok(adjust.exposure > 0)
})

test('transparent pixels are ignored; region limits the sample; tiny input is safe', () => {
  const holed = makeImage({ alphaHole: true })
  const n = samplePixels(holed.data, W, H).length / 3
  assert.ok(n > 0 && n < (W * H) / 2 + W)
  const sky = samplePixels(reference.data, W, H, { region: { x: 0, y: 0, w: 1, h: 0.25 } })
  for (let i = 0; i < sky.length; i += 3) assert.ok(sky[i + 2] > 0.8) // all sky (blue)
  assert.deepEqual(autoEnhance({ data: new Uint8ClampedArray(4 * 4), width: 2, height: 2 }).adjust, Object.fromEntries(AUTO_KEYS.map((k) => [k, 0])))
  assert.deepEqual(autoEnhance(null).adjust, Object.fromEntries(AUTO_KEYS.map((k) => [k, 0])))
  // RGB (3 channels) works too
  const rgb = new Uint8ClampedArray(W * H * 3)
  for (let i = 0, j = 0; i < reference.data.length; i += 4, j += 3) { rgb[j] = reference.data[i]; rgb[j + 1] = reference.data[i + 1]; rgb[j + 2] = reference.data[i + 2] }
  assert.deepEqual(autoEnhance({ data: rgb, width: W, height: H, channels: 3 }).adjust, autoEnhance(reference).adjust)
})

test('deterministic, strength scales, applyAuto only touches the auto sliders', () => {
  const dark = makeImage({ gain: 0.3, cast: [1.2, 1, 0.8] })
  const a = autoEnhance(dark).adjust
  assert.deepEqual(autoEnhance(dark).adjust, a)
  const half = autoEnhance(dark, { strength: 0.5 }).adjust
  assert.ok(Math.abs(half.exposure) < Math.abs(a.exposure))
  assert.ok(AUTO_KEYS.every((k) => autoEnhance(dark, { strength: 0 }).adjust[k] === 0))

  const recipe = normalize({ adjust: { clarity: 20, grain: 10, exposure: -30 }, filter: { id: 'portra', strength: 60 }, aspect: '4:5' })
  const next = applyAuto(recipe, a)
  assert.equal(next.adjust.clarity, 20)
  assert.equal(next.adjust.grain, 10)
  assert.equal(next.adjust.exposure, a.exposure)
  assert.deepEqual(next.filter, recipe.filter)
  assert.equal(next.aspect, '4:5')
  assert.ok(isAutoApplied(next, a))
  assert.ok(!isAutoApplied(recipe, a))
  assert.equal(typeof describeAuto(a), 'string')
  assert.match(describeAuto(a), /EV/)
})
