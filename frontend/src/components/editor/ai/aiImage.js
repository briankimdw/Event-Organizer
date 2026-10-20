// Canvas helpers for the editor's AI tab (web only: uses the DOM). The plain-JS parts live in
// lib/editor/auto.js and api/ai.js.
import { AUTO_SAMPLE_EDGE } from '../../../lib/editor/auto.js'
import { geometryMatrix, mat3, fitEdge } from '../../../lib/editor/geometry.js'

export const canvasToBlob = (canvas, type = 'image/jpeg', quality = 0.95) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t prepare the photo.'))), type, quality))

const newCanvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  return c
}

// Decode a blob into a canvas, KEEPING transparency (renderWeb's drawScaled paints white under it).
export async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob)
  try {
    const c = newCanvas(bmp.width, bmp.height)
    c.getContext('2d').drawImage(bmp, 0, 0)
    return c
  } finally {
    bmp.close?.()
  }
}

// Pixels for auto-enhance: the image downscaled to ~AUTO_SAMPLE_EDGE, as ImageData.
export function autoPixels(canvas, maxEdge = AUTO_SAMPLE_EDGE) {
  const fit = fitEdge(canvas.width, canvas.height, maxEdge)
  const c = newCanvas(fit.width, fit.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, c.width, c.height)
  return ctx.getImageData(0, 0, c.width, c.height)
}

// The part of the source the recipe's crop shows, as a bounding box { x, y, w, h } in 0..1
// (auto-enhance should judge what will be posted, not what was cropped away).
export function cropRegion(recipe, srcW, srcH) {
  try {
    const m = geometryMatrix(recipe, srcW, srcH)
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => mat3.apply(m, u, v))
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys))
    const w = Math.min(1, Math.max(...xs)) - x, h = Math.min(1, Math.max(...ys)) - y
    return w > 0.01 && h > 0.01 ? { x, y, w, h } : null
  } catch {
    return null
  }
}

const canFilter = () => typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype

// A blurred copy of `img` at w x h. radius: fraction of the long edge.
export function blurredCopy(img, w, h, radius = 0.02) {
  const out = newCanvas(w, h)
  const ctx = out.getContext('2d')
  if (canFilter()) {
    // Blur a smaller copy (fast), then scale it up: the upscale smooths it further.
    const small = fitEdge(w, h, 512)
    const s = newCanvas(small.width, small.height)
    const sx = s.getContext('2d')
    sx.drawImage(img, 0, 0, s.width, s.height)
    const t = newCanvas(small.width, small.height)
    const tx = t.getContext('2d')
    tx.drawImage(s, 0, 0) // under the blur so the edges don't fade to transparent
    tx.filter = `blur(${Math.max(1, radius * Math.max(s.width, s.height)).toFixed(1)}px)`
    tx.drawImage(s, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(t, 0, 0, w, h)
  } else {
    // Safari without ctx.filter: shrink a lot, then scale up with smoothing (a box-ish blur).
    const tiny = fitEdge(w, h, Math.max(8, Math.round(1 / Math.max(radius, 0.004))))
    const s = newCanvas(tiny.width, tiny.height)
    s.getContext('2d').drawImage(img, 0, 0, s.width, s.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(s, 0, 0, w, h)
  }
  return out
}

// The cutout (RGBA) over a new background, at the cutout's size.
// bg: { kind: 'color', color } | { kind: 'blur', original (canvas/image), amount 0..1 } | { kind: 'transparent' }
export function compositeCutout(cutout, bg) {
  const w = cutout.width, h = cutout.height
  const out = newCanvas(w, h)
  const ctx = out.getContext('2d')
  if (bg.kind === 'color') {
    ctx.fillStyle = bg.color || '#ffffff'
    ctx.fillRect(0, 0, w, h)
  } else if (bg.kind === 'blur' && bg.original) {
    ctx.drawImage(blurredCopy(bg.original, w, h, 0.008 + 0.03 * (bg.amount ?? 0.5)), 0, 0)
  }
  ctx.drawImage(cutout, 0, 0, w, h)
  return out
}

// ---------------------------------------------------------------------------
// Erase masks. Strokes are in image-normalized coordinates (0..1 of width / height), so the same
// strokes draw the on-screen overlay and the full-size PNG mask:
//   { kind: 'brush', size (fraction of the long edge), points: [[u, v], …] }
//   { kind: 'rect', x, y, w, h }
// ---------------------------------------------------------------------------
export function drawStrokes(ctx, strokes, w, h, color) {
  const long = Math.max(w, h)
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    if (s.kind === 'rect') {
      ctx.fillRect(s.x * w, s.y * h, s.w * w, s.h * h)
    } else if (s.points.length) {
      ctx.lineWidth = s.size * long
      ctx.beginPath()
      const [u0, v0] = s.points[0]
      ctx.moveTo(u0 * w, v0 * h)
      if (s.points.length === 1) ctx.lineTo(u0 * w + 0.01, v0 * h)
      for (const [u, v] of s.points.slice(1)) ctx.lineTo(u * w, v * h)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// The PNG the erase endpoint wants: black = keep, white = remove, at w x h.
export function maskBlob(strokes, w, h) {
  const c = newCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height)
  drawStrokes(ctx, strokes, c.width, c.height, '#fff')
  return canvasToBlob(c, 'image/png')
}

// Share of the image the strokes cover (0..1), measured on a small copy.
export function maskCoverage(strokes) {
  if (!strokes.length) return 0
  const c = newCanvas(96, 96)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  drawStrokes(ctx, strokes, 96, 96, '#fff')
  const d = ctx.getImageData(0, 0, 96, 96).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++
  return n / (96 * 96)
}

// Start a download of a blob (the transparent PNG).
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
