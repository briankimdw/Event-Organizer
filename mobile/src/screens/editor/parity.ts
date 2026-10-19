// Parity check (dev only, not imported by the app): the Skia shader (what the phone renders) against the shared CPU reference
// colorMath.applyToPixel (what the web's tests and Canvas2D fallback use), pixel by pixel, on a
// synthetic test image, for a set of recipes. Run it in a dev build or the web target:
//   import { runParity } from '@/screens/editor/parity'; const report = runParity()
// Both sides get exactly the same inputs: the same source pixels, the same blurred copy (read
// back from Skia), the same geometry (shared geometryMatrix) and the same uniforms.
import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia'

import { geometryMatrix, normalize, outputSize, type EditRecipe } from './contract'
import { renderToImage } from './exportImage'
import { applyToPixel, colorUniformsFor, LUMA, makeBlur } from './pipeline'
import { effectiveAdjust } from './contract'

export type ParityRow = { name: string; maxDiff: number; meanDiff: number; over: number; pass: boolean }

export const PARITY_CASES: { name: string; recipe: Partial<EditRecipe> & Record<string, unknown> }[] = [
  { name: 'identity', recipe: {} },
  { name: 'light', recipe: { adjust: { exposure: 40, contrast: 30, highlights: -50, shadows: 40, whites: 20, blacks: -20 } as any } },
  { name: 'dark+', recipe: { adjust: { exposure: -60, contrast: -40, highlights: 60, shadows: -50 } as any } },
  { name: 'color', recipe: { adjust: { temperature: 50, tint: -30, vibrance: 60, saturation: -40 } as any } },
  { name: 'matte+vignette', recipe: { adjust: { contrast: -60, fade: 50, vignette: -60 } as any } },
  { name: 'effects', recipe: { adjust: { vignette: 50, grain: 60, clarity: 70, sharpen: 80 } as any } },
  { name: 'grain', recipe: { adjust: { grain: 100 } as any } },
  { name: 'clarity', recipe: { adjust: { clarity: 100 } as any } },
  { name: 'clarity-', recipe: { adjust: { clarity: -100 } as any } },
  { name: 'sharpen', recipe: { adjust: { sharpen: 100 } as any } },
  { name: 'vignette+', recipe: { adjust: { vignette: 100 } as any } },
  { name: 'preset portra', recipe: { filter: { id: 'portra', strength: 100 } } },
  { name: 'preset mono 60%', recipe: { filter: { id: 'mono', strength: 60 }, adjust: { exposure: 10 } as any } },
  { name: 'rotate+flip+warm', recipe: { rotate: 90, flipH: true, adjust: { temperature: 40, exposure: 20 } as any } },
]

/** Deterministic test pattern: ramps, saturated patches, fine detail and a dark / bright band. */
export function makeTestImage(W = 96, H = 64): { image: SkImage; px: Uint8Array } {
  const px = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let r = x / (W - 1), g = y / (H - 1), b = 0.5 + 0.5 * Math.sin(x * 0.7) * Math.cos(y * 0.5)
      if (x < 16 && y < 16) { r = 0.9; g = 0.15; b = 0.1 } // red patch
      if (x >= W - 16 && y < 16) { r = 0.1; g = 0.3; b = 0.85 } // blue patch
      if (y >= H - 8) { const v = x / (W - 1); r = g = b = v } // grey ramp
      if ((x + y) % 7 === 0) { r = Math.min(1, r + 0.2); g = Math.min(1, g + 0.2); b = Math.min(1, b + 0.2) } // detail
      px[i] = Math.round(r * 255); px[i + 1] = Math.round(g * 255); px[i + 2] = Math.round(b * 255); px[i + 3] = 255
    }
  }
  const image = Skia.Image.MakeImage(
    { width: W, height: H, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(px), W * 4,
  )
  if (!image) throw new Error('Could not create the test image')
  return { image, px }
}

function readRGBA(img: SkImage): Uint8Array {
  const out = img.readPixels(0, 0, { width: img.width(), height: img.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul })
  if (!out) throw new Error('readPixels failed')
  return out instanceof Uint8Array ? out : Uint8Array.from(out as ArrayLike<number>, (v) => Math.round(v * 255))
}

// Bilinear sample (Skia Linear filter, Clamp tiling: texel centres at i + 0.5) of an RGBA8 buffer.
function sample(buf: Uint8Array, W: number, H: number, x: number, y: number): [number, number, number] {
  const fx = Math.min(Math.max(x - 0.5, 0), W - 1), fy = Math.min(Math.max(y - 0.5, 0), H - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1)
  const tx = fx - x0, ty = fy - y0
  const at = (xx: number, yy: number, c: number) => buf[(yy * W + xx) * 4 + c] / 255
  const ch = (c: number) => (at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) + (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty
  return [ch(0), ch(1), ch(2)]
}
const luma = (c: number[]) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]

/** Tolerance in 8-bit levels for any channel of any pixel. */
export const PARITY_TOLERANCE = 3

export function runParity(): ParityRow[] {
  const { image: src, px: srcPx } = makeTestImage()
  const sw = src.width(), sh = src.height()
  const blur = makeBlur(src)
  const blurPx = readRGBA(blur)
  const bw = blur.width(), bh = blur.height()
  const rows: ParityRow[] = []
  for (const c of PARITY_CASES) {
    const recipe = normalize(c.recipe)
    const { width: W, height: H } = outputSize(recipe, sw, sh)
    const out = renderToImage(src, recipe, { maxEdge: 100000, blur })
    const gpu = readRGBA(out.image)
    const u = colorUniformsFor(effectiveAdjust(recipe), { width: W, height: H })
    const m = geometryMatrix(recipe, sw, sh)
    const dx = [m[0] / W, m[3] / W], dy = [m[1] / H, m[4] / H]
    let max = 0, sum = 0, over = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x + 0.5, fy = y + 0.5
        const uu = fx / W, vv = fy / H
        const s = Math.min(Math.max(m[0] * uu + m[1] * vv + m[2], 0), 1)
        const t = Math.min(Math.max(m[3] * uu + m[4] * vv + m[5], 0), 1)
        const c0 = sample(srcPx, sw, sh, s * sw, t * sh)
        const yBlur = luma(sample(blurPx, bw, bh, s * bw, t * bh))
        const nb = (ox: number, oy: number) => luma(sample(srcPx, sw, sh, (s + ox) * sw, (t + oy) * sh))
        const yNbr = 0.25 * (nb(dx[0], dx[1]) + nb(-dx[0], -dx[1]) + nb(dy[0], dy[1]) + nb(-dy[0], -dy[1]))
        const ref = applyToPixel(c0, u, { yBlur, yNbr, u: uu, v: vv, px: fx, py: fy })
        const i = (y * W + x) * 4
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(gpu[i + k] - Math.round(ref[k] * 255))
          if (d > max) max = d
          if (d > PARITY_TOLERANCE) over++
          sum += d
        }
      }
    }
    rows.push({ name: c.name, maxDiff: max, meanDiff: Math.round((sum / (W * H * 3)) * 1000) / 1000, over, pass: max <= PARITY_TOLERANCE })
  }
  return rows
}
