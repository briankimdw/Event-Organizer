import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, effectiveAdjust, PRESETS, ADJUSTMENTS } from '../recipe.js'
import {
  applyToPixel, uniformsFor, srgbToLinear, linearToSrgb, hash12, valueNoise, LUMA,
  COLOR_FUNCTIONS, COLOR_UNIFORMS, FRAGMENT_SHADER, SKSL_SHADER,
} from '../colorMath.js'

const U = (adjust = {}) => uniformsFor(effectiveAdjust(normalize({ adjust })))
const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]
const grays = Array.from({ length: 41 }, (_, i) => i / 40)

test('sRGB transfer functions round-trip', () => {
  for (const c of grays) assert.ok(Math.abs(linearToSrgb(srgbToLinear(c)) - c) < 1e-9)
})

test('identity recipe leaves pixels unchanged', () => {
  const u = U()
  for (const r of [0, 0.1, 0.5, 0.93, 1]) for (const g of [0, 0.4, 1]) for (const b of [0, 0.7, 1]) {
    const o = applyToPixel([r, g, b], u, { u: 0, v: 0, px: 3, py: 7 })
    assert.ok(Math.abs(o[0] - r) < 1e-9 && Math.abs(o[1] - g) < 1e-9 && Math.abs(o[2] - b) < 1e-9, `${[r, g, b]} -> ${o}`)
  }
})

test('exposure works in linear light (+1 EV doubles the light)', () => {
  const u = U({ exposure: 50 })
  assert.equal(u.u_exposure, 2)
  const out = applyToPixel([0.3, 0.3, 0.3], u)
  assert.ok(Math.abs(srgbToLinear(out[0]) / srgbToLinear(0.3) - 2) < 1e-6)
  const dark = applyToPixel([0.5, 0.5, 0.5], U({ exposure: -50 }))
  assert.ok(Math.abs(srgbToLinear(dark[0]) / srgbToLinear(0.5) - 0.5) < 1e-6)
  // The shoulder keeps brightened highlights from clipping hard.
  const hi = applyToPixel([0.8, 0.8, 0.8], U({ exposure: 50 }))
  assert.ok(hi[0] < 1 && hi[0] > 0.8)
})

test('tone sliders keep the curve monotonic at their extremes', () => {
  const keys = ['contrast', 'highlights', 'shadows', 'whites', 'blacks', 'exposure', 'fade']
  for (const key of keys) for (const v of [-100, -50, 50, 100]) {
    if (key === 'fade' && v < 0) continue
    const u = U({ [key]: v })
    let prev = -1
    for (const g of grays) {
      const y = luma(applyToPixel([g, g, g], u))
      assert.ok(y >= prev - 1e-9, `${key} ${v}: not monotonic at ${g}`)
      prev = y
    }
  }
})

test('sliders move things the right way', () => {
  const mid = [0.5, 0.5, 0.5]
  const dark = [0.15, 0.15, 0.15]
  const light = [0.85, 0.85, 0.85]
  assert.ok(luma(applyToPixel(dark, U({ shadows: 100 }))) > luma(dark) + 0.05)
  assert.ok(luma(applyToPixel(light, U({ highlights: -100 }))) < luma(light) - 0.05)
  assert.ok(Math.abs(luma(applyToPixel(light, U({ shadows: 100 }))) - luma(light)) < 0.06) // shadows leave highlights alone
  assert.ok(luma(applyToPixel([0.02, 0.02, 0.02], U({ blacks: 100 }))) > 0.08)
  assert.ok(luma(applyToPixel([0.05, 0.05, 0.05], U({ blacks: -100 }))) < 0.01)
  assert.ok(luma(applyToPixel(light, U({ whites: 100 }))) > luma(light) + 0.05)
  const c = applyToPixel(dark, U({ contrast: 100 })), l = applyToPixel(light, U({ contrast: 100 }))
  assert.ok(c[0] < dark[0] && l[0] > light[0])
  const f = applyToPixel([0, 0, 0], U({ fade: 100 }))
  assert.ok(Math.abs(f[0] - 0.1) < 1e-9)
  assert.ok(Math.abs(luma(applyToPixel(mid, U({ saturation: 50 }))) - 0.5) < 1e-9) // gray stays gray
})

test('white balance: warm is redder, cool is bluer, brightness about the same', () => {
  const g = [0.5, 0.5, 0.5]
  const warm = applyToPixel(g, U({ temperature: 100 }))
  const cool = applyToPixel(g, U({ temperature: -100 }))
  assert.ok(warm[0] > warm[2] + 0.1)
  assert.ok(cool[2] > cool[0] + 0.1)
  const magenta = applyToPixel(g, U({ tint: 100 }))
  assert.ok(magenta[1] < magenta[0] && magenta[1] < magenta[2])
  for (const o of [warm, cool, magenta]) assert.ok(Math.abs(luma(o) - 0.5) < 0.04, `luma ${luma(o)}`)
})

test('saturation and vibrance', () => {
  const red = [0.8, 0.3, 0.3]
  const bw = applyToPixel(red, U({ saturation: -100 }))
  assert.ok(Math.abs(bw[0] - bw[1]) < 1e-9 && Math.abs(bw[1] - bw[2]) < 1e-9)
  const spread = (c) => Math.max(...c) - Math.min(...c)
  assert.ok(spread(applyToPixel(red, U({ saturation: 50 }))) > spread(red))
  // Vibrance boosts muted colours more than vivid ones.
  const muted = [0.55, 0.5, 0.45], vivid = [0.9, 0.2, 0.1]
  const gainMuted = spread(applyToPixel(muted, U({ vibrance: 100 }))) / spread(muted)
  const gainVivid = spread(applyToPixel(vivid, U({ vibrance: 100 }))) / Math.min(spread(vivid), 1)
  assert.ok(gainMuted > gainVivid)
})

test('clarity and sharpen act on local detail only', () => {
  const p = [0.6, 0.6, 0.6]
  assert.deepEqual(applyToPixel(p, U({ clarity: 100, sharpen: 100 })), applyToPixel(p, U())) // no detail -> no change
  assert.ok(applyToPixel(p, U({ clarity: 100 }), { yBlur: 0.5 })[0] > 0.6)   // brighter than its surroundings -> brighter
  assert.ok(applyToPixel(p, U({ clarity: -100 }), { yBlur: 0.5 })[0] < 0.6)
  assert.ok(applyToPixel(p, U({ sharpen: 100 }), { yNbr: 0.55 })[0] > 0.6)
})

test('vignette darkens or lightens the corners, never the centre', () => {
  const p = [0.5, 0.5, 0.5]
  const u = U({ vignette: -100 })
  assert.equal(applyToPixel(p, u, { u: 0.5, v: 0.5 })[0], 0.5)
  assert.ok(applyToPixel(p, u, { u: 0, v: 0 })[0] < 0.2)
  assert.ok(applyToPixel(p, U({ vignette: 100 }), { u: 1, v: 1 })[0] > 0.7)
})

test('grain is deterministic, bounded and roughly zero-mean', () => {
  const u = U({ grain: 100 })
  let sum = 0, n = 0, maxDev = 0
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const o = applyToPixel([0.5, 0.5, 0.5], u, { px: x + 0.5, py: y + 0.5 })
    assert.deepEqual(o, applyToPixel([0.5, 0.5, 0.5], u, { px: x + 0.5, py: y + 0.5 }))
    sum += o[0] - 0.5; n++
    maxDev = Math.max(maxDev, Math.abs(o[0] - 0.5))
  }
  assert.ok(Math.abs(sum / n) < 0.01)
  assert.ok(maxDev > 0.02 && maxDev <= 0.07 + 1e-9)
  for (let i = 0; i < 100; i++) {
    const h = hash12(i * 1.7, i * 3.1)
    assert.ok(h >= 0 && h < 1)
    const v = valueNoise(i * 0.37, i * 0.11)
    assert.ok(v >= 0 && v <= 1)
  }
})

test('every preset renders to valid pixels', () => {
  for (const p of PRESETS) {
    const u = uniformsFor(effectiveAdjust(normalize({ filter: { id: p.id, strength: 100 } })))
    for (const c of [[0, 0, 0], [1, 1, 1], [0.8, 0.4, 0.2], [0.1, 0.5, 0.9]]) {
      const o = applyToPixel(c, u, { u: 0.1, v: 0.9, px: 10, py: 10, yBlur: 0.4, yNbr: 0.45 })
      for (const v of o) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${p.id}: ${o}`)
    }
  }
})

test('every slider at its extremes stays finite', () => {
  for (const a of ADJUSTMENTS) for (const v of [a.min, a.max]) {
    const o = applyToPixel([0.3, 0.6, 0.9], U({ [a.key]: v }), { u: 0, v: 0, px: 1, py: 1, yBlur: 0, yNbr: 1 })
    for (const x of o) assert.ok(Number.isFinite(x) && x >= 0 && x <= 1)
  }
})

test('shader sources declare every uniform and stay in the portable subset', () => {
  for (const key of Object.keys(uniformsFor({}))) {
    assert.ok(COLOR_UNIFORMS.includes(` ${key};`), `GLSL declares ${key}`)
  }
  assert.ok(FRAGMENT_SHADER.includes('pm_color('))
  // SkSL: no GLSL-only constructs, no leftover vecN/mat3 names.
  for (const bad of ['texture2D', 'varying', 'gl_FragColor', 'sampler2D', /\bvec[234]\b/, /\bmat3\b/]) {
    assert.ok(!(bad instanceof RegExp ? bad.test(SKSL_SHADER) : SKSL_SHADER.includes(bad)), `SkSL has ${bad}`)
  }
  assert.ok(SKSL_SHADER.includes('half4 main(float2 fragCoord)'))
  // GLSL ES 1.00 has no implicit int -> float: every bare number in the colour code is a float literal.
  const ints = COLOR_FUNCTIONS.replace(/\/\/.*$/gm, '').match(/(?<![\w.])\d+(?![\w.])/g) || []
  assert.deepEqual(ints, [])
})
