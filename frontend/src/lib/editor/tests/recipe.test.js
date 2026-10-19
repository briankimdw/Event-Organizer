// node --test frontend/src/lib/editor/tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADJUSTMENTS, ADJUST_KEYS, ASPECTS, PRESETS, presets, RECIPE_VERSION, bakeFilter, clampAdjust, defaultRecipe, describe,
  effectiveAdjust, formatAdjust, getPreset, isIdentity, normalize, sameRecipe, toStorable,
} from '../recipe.js'

test('defaultRecipe is a complete identity', () => {
  const r = defaultRecipe()
  assert.equal(r.v, RECIPE_VERSION)
  assert.deepEqual(r.crop, { x: 0, y: 0, w: 1, h: 1 })
  assert.equal(r.aspect, 'original')
  assert.equal(r.rotate, 0)
  assert.equal(r.straighten, 0)
  assert.equal(r.flipH, false)
  assert.equal(r.filter, null)
  assert.deepEqual(Object.keys(r.adjust), ADJUST_KEYS)
  assert.ok(isIdentity(r))
  assert.ok(isIdentity(null))
  assert.ok(isIdentity({}))
})

test('normalize never throws and fixes garbage', () => {
  for (const bad of [undefined, null, 42, 'nope', '[]', [], { v: 'x' }, { crop: 'all', adjust: 7, filter: 9 }]) {
    const r = normalize(bad)
    assert.deepEqual(r, defaultRecipe())
  }
  const r = normalize({
    crop: { x: -1, y: 0.9, w: 5, h: 0.5 }, aspect: 'weird', rotate: 95, straighten: 80, flipH: 'yes',
    adjust: { exposure: 250, sharpen: -40, contrast: '12.6', bogus: 3 }, filter: { id: 'portra', strength: 150 }, extra: 1,
  })
  assert.deepEqual(r.crop, { x: 0, y: 0.5, w: 1, h: 0.5 })
  assert.equal(r.aspect, 'free') // a crop without a known aspect is free-form
  assert.equal(r.rotate, 90)
  assert.equal(r.straighten, 45)
  assert.equal(r.flipH, false)
  assert.equal(r.adjust.exposure, 100)
  assert.equal(r.adjust.sharpen, 0) // 0..100 slider
  assert.equal(r.adjust.contrast, 13)
  assert.equal('bogus' in r.adjust, false)
  assert.deepEqual(r.filter, { id: 'portra', strength: 100 })
  assert.equal('extra' in r, false)
})

test('normalize: rotation snaps, wraps and accepts negatives; JSON text works', () => {
  assert.equal(normalize({ rotate: -90 }).rotate, 270)
  assert.equal(normalize({ rotate: 360 }).rotate, 0)
  assert.equal(normalize({ rotate: 539 }).rotate, 180)
  assert.equal(normalize(JSON.stringify({ adjust: { fade: 30 } })).adjust.fade, 30)
  assert.equal(normalize({ straighten: -0.04 }).straighten, 0)
  assert.equal(Object.is(normalize({ straighten: -0.04 }).straighten, -0), false)
})

test('filters: unknown ids and zero strength mean no filter; a bare id means 100%', () => {
  assert.equal(normalize({ filter: { id: 'nope', strength: 50 } }).filter, null)
  assert.equal(normalize({ filter: { id: 'mono', strength: 0 } }).filter, null)
  assert.deepEqual(normalize({ filter: 'mono' }).filter, { id: 'mono', strength: 100 })
})

test('presets: 8-12 looks, defined as valid adjustments', () => {
  assert.equal(presets, PRESETS)
  assert.ok(PRESETS.length >= 8 && PRESETS.length <= 12)
  const ids = new Set()
  for (const p of PRESETS) {
    assert.ok(p.id && p.name)
    assert.ok(!ids.has(p.id)); ids.add(p.id)
    for (const [k, v] of Object.entries(p.adjust)) {
      assert.ok(ADJUST_KEYS.includes(k), `${p.id}.${k}`)
      assert.equal(clampAdjust(k, v), v, `${p.id}.${k} in range`)
    }
    assert.ok(!isIdentity({ filter: { id: p.id, strength: 100 } }))
  }
  assert.equal(getPreset('portra').name, 'Portra')
})

test('effectiveAdjust layers the look under the sliders, scaled by strength', () => {
  const r = normalize({ adjust: { contrast: 10, saturation: -50 }, filter: { id: 'mono', strength: 50 } })
  const e = effectiveAdjust(r)
  assert.equal(e.saturation, -100) // -50 + -100 * 0.5, clamped
  assert.equal(e.contrast, 21) // 10 + 22 * 0.5
  assert.equal(e.grain, 5)
  const baked = bakeFilter(r)
  assert.equal(baked.filter, null)
  assert.deepEqual(baked.adjust, e)
  assert.deepEqual(effectiveAdjust(baked), e)
})

test('toStorable is compact, null for identities, and round-trips', () => {
  assert.equal(toStorable(defaultRecipe()), null)
  assert.equal(toStorable({ filter: { id: 'mono', strength: 0 } }), null)
  const r = normalize({ crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, aspect: '4:5', adjust: { exposure: 15 }, filter: { id: 'golden', strength: 70 }, flipH: true })
  const s = toStorable(r)
  assert.deepEqual(s, { v: 1, crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, aspect: '4:5', flipH: true, adjust: { exposure: 15 }, filter: { id: 'golden', strength: 70 } })
  assert.ok(JSON.stringify(s).length < 300)
  assert.deepEqual(normalize(s), r)
  assert.ok(sameRecipe(s, r))
  // A worst case (everything set) stays well under the database's 4 KB limit.
  const big = normalize({ crop: { x: 0.12345, y: 0.23456, w: 0.34567, h: 0.45678 }, aspect: '16:9', rotate: 270, straighten: -12.3, flipH: true,
    adjust: Object.fromEntries(ADJUSTMENTS.map((a) => [a.key, a.min])), filter: { id: 'mono-matte', strength: 55 } })
  assert.ok(JSON.stringify(toStorable(big)).length < 600)
})

test('describe gives short summaries', () => {
  assert.equal(describe(null), 'Original')
  assert.equal(describe(defaultRecipe()), 'Original')
  assert.equal(describe({ adjust: { temperature: 20, exposure: 15 }, crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, aspect: '4:5' }), 'Warm · +0.3 EV · cropped 4:5')
  assert.equal(describe({ filter: { id: 'portra', strength: 60 } }), 'Portra 60%')
  assert.equal(describe({ adjust: { saturation: -100 } }), 'B&W · Saturation −100')
  assert.equal(describe({ filter: 'mono' }), 'Mono')
  assert.equal(describe({ adjust: { temperature: -30, contrast: 10, fade: 20 }, straighten: 2.5, rotate: 90, flipH: true }),
    'Cool · 2 adjustments · straightened +2.5° · rotated 90° · flipped')
})

test('formatAdjust', () => {
  assert.equal(formatAdjust('exposure', 15), '+0.30 EV')
  assert.equal(formatAdjust('exposure', -50), '−1.00 EV')
  assert.equal(formatAdjust('exposure', 0), '0 EV')
  assert.equal(formatAdjust('contrast', 12), '+12')
  assert.equal(formatAdjust('contrast', -12), '−12')
  assert.equal(formatAdjust('grain', 12), '12')
  assert.equal(formatAdjust('grain', 0), '0')
})

test('every aspect id survives normalize', () => {
  for (const a of ASPECTS) assert.equal(normalize({ aspect: a.id }).aspect, a.id)
})
