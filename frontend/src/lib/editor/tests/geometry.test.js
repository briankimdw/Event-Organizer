import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRecipe, normalize, aspectRatio } from '../recipe.js'
import {
  constrain, cropForAspect, fitCrop, fitScale, flipRecipe, geometryMatrix, isValidCrop, mat3, moveCrop, orientedSize,
  outputSize, resizeCrop, rotateCropQuarter, rotateRecipe,
} from '../geometry.js'

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)
const map = (r, w, h, u, v, opts) => mat3.apply(geometryMatrix(r, w, h, opts), u, v)

test('identity maps output to source unchanged', () => {
  const r = defaultRecipe()
  for (const [u, v] of [[0, 0], [1, 1], [0.25, 0.75]]) {
    const [s, t] = map(r, 4000, 3000, u, v)
    close(s, u); close(t, v)
  }
})

test('quarter turns: output top-left shows the right source corner', () => {
  const W = 4000, H = 3000
  // 90° clockwise: what was bottom-left is now top-left.
  let [s, t] = map(normalize({ rotate: 90 }), W, H, 0, 0); close(s, 0); close(t, 1)
  ;[s, t] = map(normalize({ rotate: 180 }), W, H, 0, 0); close(s, 1); close(t, 1)
  ;[s, t] = map(normalize({ rotate: 270 }), W, H, 0, 0); close(s, 1); close(t, 0)
  // Flip: left-right mirror.
  ;[s, t] = map(normalize({ flipH: true }), W, H, 0, 0.5); close(s, 1); close(t, 0.5)
  assert.deepEqual(orientedSize(W, H, 90), { w: 3000, h: 4000 })
  assert.deepEqual(outputSize(normalize({ rotate: 270 }), W, H), { width: 3000, height: 4000 })
})

test('crop selects the right part of the frame', () => {
  const r = normalize({ crop: { x: 0.5, y: 0.25, w: 0.5, h: 0.5 } })
  const [s0, t0] = map(r, 1000, 1000, 0, 0); close(s0, 0.5); close(t0, 0.25)
  const [s1, t1] = map(r, 1000, 1000, 1, 1); close(s1, 1); close(t1, 0.75)
  assert.deepEqual(outputSize(r, 4000, 3000), { width: 2000, height: 1500 })
})

test('straighten turns the picture clockwise around the centre', () => {
  const r = normalize({ straighten: 10 })
  const [sc, tc] = map(r, 3000, 2000, 0.5, 0.5); close(sc, 0.5); close(tc, 0.5)
  // A point to the right of centre on screen samples from slightly above it in the source
  // (the picture turned clockwise, so content from above moved down to it).
  const [, t] = map(r, 3000, 2000, 0.75, 0.5)
  assert.ok(t < 0.5)
  // The full frame no longer fits inside the turned picture; the fitted crop does.
  assert.ok(fitScale({ x: 0, y: 0, w: 1, h: 1 }, 3000, 2000, 10) < 1)
  const c = fitCrop({ x: 0, y: 0, w: 1, h: 1 }, 3000, 2000, 10)
  assert.ok(isValidCrop(c, 3000, 2000, 10))
  close(fitScale(c, 3000, 2000, 10), 1, 1e-6) // as large as possible
  close(c.w / c.h, 1, 1e-6) // same shape as the frame (normalized w/h)
  // Every corner of the fitted crop samples inside the photo.
  const rr = { ...r, crop: c }
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const [s2, t2] = map(rr, 3000, 2000, u, v)
    assert.ok(s2 >= -1e-6 && s2 <= 1 + 1e-6 && t2 >= -1e-6 && t2 <= 1 + 1e-6, `${s2},${t2}`)
  }
})

test('cropForAspect gives the largest centred crop of that shape in pixels', () => {
  for (const [aspect, W, H] of [['1:1', 4000, 3000], ['4:5', 4000, 3000], ['16:9', 3000, 4000], ['original', 4000, 3000], ['free', 4000, 3000]]) {
    const c = cropForAspect(aspect, W, H, 0)
    const ratio = aspectRatio(aspect, W, H) ?? W / H
    close((c.w * W) / (c.h * H), ratio, 1e-6)
    assert.ok(Math.abs(c.w - 1) < 1e-6 || Math.abs(c.h - 1) < 1e-6, 'touches two sides')
    close(c.x + c.w / 2, 0.5, 1e-9); close(c.y + c.h / 2, 0.5, 1e-9)
  }
  const tilted = cropForAspect('4:5', 4000, 3000, -7)
  assert.ok(isValidCrop(tilted, 4000, 3000, -7))
  close((tilted.w * 4000) / (tilted.h * 3000), 0.8, 1e-6)
})

test('moving and resizing stop at the edges and keep the shape', () => {
  const W = 4000, H = 3000, th = 5
  let c = cropForAspect('1:1', W, H, th)
  c = { ...c, w: c.w * 0.6, h: c.h * 0.6, x: c.x + c.w * 0.2, y: c.y + c.h * 0.2 }
  assert.ok(isValidCrop(c, W, H, th))
  const moved = moveCrop(c, 5, 0, W, H, th) // far to the right
  assert.ok(isValidCrop(moved, W, H, th))
  assert.ok(moved.x > c.x)
  close(moved.w, c.w)
  const grown = resizeCrop(c, 'se', 2, 2, 1, W, H, th)
  assert.ok(isValidCrop(grown, W, H, th))
  assert.ok(grown.w > c.w)
  close((grown.w * W) / (grown.h * H), 1, 1e-6)
  close(grown.x, c.x); close(grown.y, c.y) // anchored at the opposite corner
  const shrunk = resizeCrop(c, 'w', 0.05, 0, null, W, H, th)
  close(shrunk.w, c.w - 0.05); close(shrunk.x, c.x + 0.05); close(shrunk.h, c.h)
  // An impossible change leaves the crop where it was.
  const stuck = constrain(c, () => ({ x: -5, y: -5, w: 9, h: 9 }), W, H, th)
  assert.ok(isValidCrop(stuck, W, H, th))
})

test('rotate button turns the view clockwise, also when flipped', () => {
  const W = 4000, H = 3000
  for (const flipH of [false, true]) {
    // A source point and where it appears on screen before / after pressing Rotate.
    const r0 = normalize({ flipH, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, aspect: 'free' })
    const r1 = rotateRecipe(r0)
    const screenOf = (r, s, t) => mat3.apply(mat3.invert(geometryMatrix(r, W, H, { crop: { x: 0, y: 0, w: 1, h: 1 } })), s, t)
    const [a0, b0] = screenOf(r0, 0.2, 0.3)
    const [a1, b1] = screenOf(r1, 0.2, 0.3)
    // Clockwise quarter turn of the frame: (a, b) -> (1 - b, a)
    close(a1, 1 - b0, 1e-9); close(b1, a0, 1e-9)
    // The crop turned with the picture: the same source area is selected.
    const corner0 = mat3.apply(geometryMatrix(r0, W, H), 0, 0)
    const corner1 = mat3.apply(geometryMatrix(r1, W, H), 1, 0) // old top-left is now top-right
    close(corner0[0], corner1[0], 1e-9); close(corner0[1], corner1[1], 1e-9)
  }
  let c = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }
  for (let i = 0; i < 4; i++) c = rotateCropQuarter(c)
  close(c.x, 0.1); close(c.y, 0.2); close(c.w, 0.3); close(c.h, 0.4)
  assert.equal(rotateRecipe(normalize({ aspect: '4:5' })).aspect, '5:4')
})

test('flip mirrors the crop and the tilt', () => {
  const r = flipRecipe(normalize({ straighten: 4, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } }))
  assert.equal(r.flipH, true)
  assert.equal(r.straighten, -4)
  close(r.crop.x, 0.4)
})

test('fitted crops never show empty area: 4 corners map inside the source (random combos)', () => {
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const aspects = ['original', 'free', '1:1', '4:5', '5:4', '3:2', '2:3', '16:9', '9:16']
  for (let i = 0; i < 2000; i++) {
    const W = 200 + Math.round(rnd() * 6000), H = 200 + Math.round(rnd() * 6000)
    let r = normalize({ rotate: [0, 90, 180, 270][i % 4], flipH: rnd() < 0.5, straighten: Math.round((rnd() * 90 - 45) * 10) / 10, aspect: aspects[i % aspects.length] })
    const f = orientedSize(W, H, r.rotate)
    r = { ...r, crop: cropForAspect(r.aspect, f.w, f.h, r.straighten) }
    // Then a random user drag / resize, a rotate or a flip, as the editor does them.
    const step = i % 5
    if (step === 1) r = { ...r, crop: moveCrop(r.crop, rnd() - 0.5, rnd() - 0.5, f.w, f.h, r.straighten) }
    if (step === 2) r = { ...r, crop: resizeCrop(r.crop, ['nw', 'se', 'n', 'e'][i % 4], rnd() - 0.5, rnd() - 0.5, aspectRatio(r.aspect, f.w, f.h), f.w, f.h, r.straighten) }
    if (step === 3) { const n = rotateRecipe(r); const g = orientedSize(W, H, n.rotate); r = { ...n, crop: fitCrop(n.crop, g.w, g.h, n.straighten) } }
    if (step === 4) r = flipRecipe(r)
    const stored = normalize(JSON.parse(JSON.stringify(r))) // what gets saved and re-opened (crop rounded to 4 decimals)
    const m = geometryMatrix(stored, W, H)
    const tol = 2e-4 + 1.5 / Math.min(W, H) // rounding of the stored crop: well under a pixel or two
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const [s, t] = mat3.apply(m, u, v)
      assert.ok(s >= -tol && s <= 1 + tol && t >= -tol && t <= 1 + tol, `case ${i} ${JSON.stringify(stored)}: corner ${u},${v} -> ${s},${t}`)
    }
  }
})
