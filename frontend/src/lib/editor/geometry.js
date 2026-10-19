// Crop / rotate / straighten / flip as math. Plain JS (no DOM), shared by web and mobile.
//
// Frames, all with y pointing down:
//   source   the upright photo, srcW x srcH pixels, normalized (s, t) in 0..1
//   oriented O = flipH(rotate(source)): W' x H' (W' = srcH when rotate is 90/270), normalized (a, b)
//   output   the crop of the straightened O: normalized (u, v) in 0..1
//
// The crop rectangle is axis-aligned in O's normalized coordinates. The picture is turned by
// `straighten` degrees (positive = clockwise on screen) around O's centre, underneath the crop:
//   P = crop.xy + (u, v) * crop.wh            (O-normalized point under output pixel u, v)
//   Q = C + R(-θ) (P·[W', H'] - C)             (C = O's centre in pixels; R(φ) = [[cos, -sin], [sin, cos]])
//   (a, b) = Q / [W', H'], then un-flip and un-rotate to (s, t).
// geometryMatrix() composes all of that into one 3x3 affine matrix (output uv -> source st).
//
// A crop is valid when it lies inside the frame AND inside the turned picture (no empty corners).

import { FULL_CROP, MIN_CROP, aspectRatio } from './recipe.js'

const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// 3x3 matrices, row-major [m00, m01, m02, m10, m11, m12, m20, m21, m22]
// ---------------------------------------------------------------------------
export const mat3 = {
  identity: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  mul(a, b) {
    const o = new Array(9)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    return o
  },
  translate: (x, y) => [1, 0, x, 0, 1, y, 0, 0, 1],
  scale: (x, y) => [x, 0, 0, 0, y, 0, 0, 0, 1],
  rotate: (rad) => [Math.cos(rad), -Math.sin(rad), 0, Math.sin(rad), Math.cos(rad), 0, 0, 0, 1],
  apply: (m, x, y) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]],
  invert(m) {
    // affine only (last row 0 0 1)
    const det = m[0] * m[4] - m[1] * m[3]
    const ia = m[4] / det, ib = -m[1] / det, ic = -m[3] / det, id = m[0] / det
    return [ia, ib, -(ia * m[2] + ib * m[5]), ic, id, -(ic * m[2] + id * m[5]), 0, 0, 1]
  },
  // Column-major Float32 order for WebGL uniformMatrix3fv (transpose = false).
  toColumnMajor: (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]],
}

const chain = (...ms) => ms.reduce((acc, m) => mat3.mul(acc, m))

// Oriented frame size for a source of srcW x srcH.
export function orientedSize(srcW, srcH, rotate = 0) {
  return rotate === 90 || rotate === 270 ? { w: srcH, h: srcW } : { w: srcW, h: srcH }
}

// O-normalized (a, b) -> source-normalized (s, t), as a matrix.
function unorientMatrix(rotate, flipH) {
  const unflip = flipH ? [-1, 0, 1, 0, 1, 0, 0, 0, 1] : mat3.identity()
  let unrot
  if (rotate === 90) unrot = [0, 1, 0, -1, 0, 1, 0, 0, 1] // s = b, t = 1 - a
  else if (rotate === 180) unrot = [-1, 0, 1, 0, -1, 1, 0, 0, 1] // s = 1 - a, t = 1 - b
  else if (rotate === 270) unrot = [0, -1, 1, 1, 0, 0, 0, 0, 1] // s = 1 - b, t = a
  else unrot = mat3.identity()
  return mat3.mul(unrot, unflip)
}

// Output-normalized (u, v) -> source-normalized (s, t).
// opts.crop overrides the recipe's crop (pass FULL_CROP to show the whole straightened frame in the crop tool).
export function geometryMatrix(recipe, srcW, srcH, opts = {}) {
  const crop = opts.crop || recipe.crop || FULL_CROP
  const { w: W, h: H } = orientedSize(srcW, srcH, recipe.rotate)
  const th = (recipe.straighten || 0) * DEG
  return chain(
    unorientMatrix(recipe.rotate, recipe.flipH),
    mat3.scale(1 / W, 1 / H),
    mat3.translate(W / 2, H / 2),
    mat3.rotate(-th),
    mat3.translate(-W / 2, -H / 2),
    mat3.scale(W, H),
    [crop.w, 0, crop.x, 0, crop.h, crop.y, 0, 0, 1],
  )
}

// Size of the edited picture in source pixels (before any downscaling).
export function outputSize(recipe, srcW, srcH, opts = {}) {
  const crop = opts.crop || recipe.crop || FULL_CROP
  const { w, h } = orientedSize(srcW, srcH, recipe.rotate)
  return { width: Math.max(1, Math.round(crop.w * w)), height: Math.max(1, Math.round(crop.h * h)) }
}

// Fit (width, height) inside a longest edge of maxEdge (never upscales).
export function fitEdge(width, height, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), scale: s }
}

// ---------------------------------------------------------------------------
// Crop validity and fitting
// ---------------------------------------------------------------------------

// Largest factor s (about the crop's centre) so the crop scaled by s fits inside the turned picture.
// >= 1 means the crop fits as it is. Can be <= 0 when the centre itself is outside.
export function fitScale(crop, frameW, frameH, straighten) {
  const th = (straighten || 0) * DEG
  const cos = Math.cos(-th), sin = Math.sin(-th)
  const cx = (crop.x + crop.w / 2) * frameW - frameW / 2
  const cy = (crop.y + crop.h / 2) * frameH - frameH / 2
  const ex = cos * cx - sin * cy
  const ey = sin * cx + cos * cy
  const a = (crop.w * frameW) / 2, b = (crop.h * frameH) / 2
  let s = Infinity
  for (const [dx, dy] of [[a, b], [a, -b], [-a, b], [-a, -b]]) {
    const kx = cos * dx - sin * dy
    const ky = sin * dx + cos * dy
    if (kx > 1e-9) s = Math.min(s, (frameW / 2 - ex) / kx)
    else if (kx < -1e-9) s = Math.min(s, (frameW / 2 + ex) / -kx)
    if (ky > 1e-9) s = Math.min(s, (frameH / 2 - ey) / ky)
    else if (ky < -1e-9) s = Math.min(s, (frameH / 2 + ey) / -ky)
  }
  return s
}

const EPS = 1e-6
export function isValidCrop(crop, frameW, frameH, straighten) {
  return crop.x >= -EPS && crop.y >= -EPS && crop.x + crop.w <= 1 + EPS && crop.y + crop.h <= 1 + EPS &&
    crop.w >= MIN_CROP - EPS && crop.h >= MIN_CROP - EPS && fitScale(crop, frameW, frameH, straighten) >= 1 - 1e-6
}

const scaleAbout = (c, s) => {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2
  return { x: cx - (c.w * s) / 2, y: cy - (c.h * s) / 2, w: c.w * s, h: c.h * s }
}
const clampToFrame = (c) => {
  const w = Math.min(1, c.w), h = Math.min(1, c.h)
  return { x: Math.min(Math.max(0, c.x), 1 - w), y: Math.min(Math.max(0, c.y), 1 - h), w, h }
}

// Make a crop valid for the given straighten angle, keeping its shape (aspect):
// shrinks it about its centre; if its centre is outside the picture, re-centres it first.
export function fitCrop(crop, frameW, frameH, straighten) {
  let c = clampToFrame(crop)
  let s = fitScale(c, frameW, frameH, straighten)
  if (s >= 1) return c
  if (s < 0.25) {
    // Centre too close to an empty corner: move it toward the middle of the frame.
    const centered = { x: (1 - c.w) / 2, y: (1 - c.h) / 2, w: c.w, h: c.h }
    const sc = fitScale(centered, frameW, frameH, straighten)
    if (sc > s) { c = centered; s = sc }
  }
  return clampToFrame(scaleAbout(c, Math.max(0, s) * (1 - 1e-9)))
}

// The largest crop with this aspect (recipe.aspect ids) centred in the frame, fitted to the angle.
export function cropForAspect(aspect, frameW, frameH, straighten = 0) {
  const ratio = aspectRatio(aspect, frameW, frameH)
  let crop
  if (!ratio) crop = { ...FULL_CROP }
  else {
    const rn = (ratio * frameH) / frameW // normalized w / h
    crop = rn >= 1 ? { x: 0, y: (1 - 1 / rn) / 2, w: 1, h: 1 / rn } : { x: (1 - rn) / 2, y: 0, w: rn, h: 1 }
  }
  return fitCrop(crop, frameW, frameH, straighten)
}

// Apply a crop change (a move or a resize, as a function of how far along it is, 0..1) as far
// as it can go while staying valid. `prev` must be valid.
export function constrain(prev, candidateAt, frameW, frameH, straighten) {
  const full = candidateAt(1)
  if (isValidCrop(full, frameW, frameH, straighten)) return full
  let lo = 0, hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (isValidCrop(candidateAt(mid), frameW, frameH, straighten)) lo = mid
    else hi = mid
  }
  return lo > 0 ? candidateAt(lo) : prev
}

// Move a crop by (dx, dy) in O-normalized units, as far as it stays valid.
export function moveCrop(crop, dx, dy, frameW, frameH, straighten) {
  // Slide along each axis separately so it glides along an edge instead of sticking.
  const stepX = constrain(crop, (t) => ({ ...crop, x: crop.x + dx * t }), frameW, frameH, straighten)
  return constrain(stepX, (t) => ({ ...stepX, y: stepX.y + dy * t }), frameW, frameH, straighten)
}

// Resize a crop by dragging a handle ('n','ne','e','se','s','sw','w','nw') by (dx, dy) in
// O-normalized units. With an aspect ratio (pixels w/h), the shape is kept.
export function resizeCrop(crop, handle, dx, dy, ratio, frameW, frameH, straighten) {
  const rn = ratio ? (ratio * frameH) / frameW : null
  const make = (t) => {
    let { x, y, w, h } = crop
    const ddx = dx * t, ddy = dy * t
    const L = handle.includes('w'), R = handle.includes('e'), T = handle.includes('n'), B = handle.includes('s')
    if (!rn) {
      if (L) { x += ddx; w -= ddx }
      if (R) w += ddx
      if (T) { y += ddy; h -= ddy }
      if (B) h += ddy
      return { x, y, w, h }
    }
    // Locked ratio: pick the new width from the drag, derive the height.
    let nw
    if ((L || R) && (T || B)) {
      const fromX = w + (R ? ddx : -ddx)
      const fromY = (h + (B ? ddy : -ddy)) * rn
      nw = Math.abs(fromX - w) >= Math.abs(fromY - w) ? fromX : fromY
    } else if (L || R) nw = w + (R ? ddx : -ddx)
    else nw = (h + (B ? ddy : -ddy)) * rn
    nw = Math.max(MIN_CROP, nw)
    const nh = nw / rn
    const nx = L ? x + w - nw : R ? x : x + (w - nw) / 2
    const ny = T ? y + h - nh : B ? y : y + (h - nh) / 2
    return { x: nx, y: ny, w: nw, h: nh }
  }
  return constrain(crop, make, frameW, frameH, straighten)
}

// After turning the photo a quarter turn, the crop turns with it (in O-normalized coordinates).
export function rotateCropQuarter(crop, clockwise = true) {
  // A point (a, b) in the old frame goes to (1 - b, a) clockwise, (b, 1 - a) counter-clockwise.
  return clockwise
    ? { x: 1 - crop.y - crop.h, y: crop.x, w: crop.h, h: crop.w }
    : { x: crop.y, y: 1 - crop.x - crop.w, w: crop.h, h: crop.w }
}

export const flipCropH = (crop) => ({ ...crop, x: 1 - crop.x - crop.w })

// The "Rotate" button: turn what's on screen a quarter turn clockwise, crop and all.
// (With flipH on, that is a counter-clockwise turn of the source, because the flip comes after.)
export function rotateRecipe(recipe) {
  const step = recipe.flipH ? 270 : 90
  const swap = ASPECT_SWAP[recipe.aspect]
  return {
    ...recipe,
    rotate: (recipe.rotate + step) % 360,
    crop: rotateCropQuarter(recipe.crop || FULL_CROP, true),
    aspect: swap || recipe.aspect,
  }
}

// The "Flip" button: mirror what's on screen left-right. The tilt mirrors too.
export function flipRecipe(recipe) {
  return { ...recipe, flipH: !recipe.flipH, straighten: recipe.straighten ? -recipe.straighten : 0, crop: flipCropH(recipe.crop || FULL_CROP) }
}

const ASPECT_SWAP = { '4:5': '5:4', '5:4': '4:5', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9' }
export const swappedAspect = (aspect) => ASPECT_SWAP[aspect] || aspect
