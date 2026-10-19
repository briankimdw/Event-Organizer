// The render pipeline: the shared SkSL shader (frontend/src/lib/editor/colorMath.js SKSL_SHADER,
// built from the same COLOR_FUNCTIONS as the web's WebGL shader), used unchanged, so the phone
// and the web run identical math. One pass does geometry + color:
//
//   fragCoord (local px of the output) -> uv -> u_geo (shared geometryMatrix) -> source st
//   -> sample the photo (+ a blurred copy for clarity, + 4 neighbours for sharpen) -> pm_color()
//
// The shader's uv is fragCoord / u_outSize, so the output must start at the local origin: the
// preview draws it inside a translated <Group>, the export into an offscreen surface of that size.
// The same function feeds the on-screen preview, the preset thumbnails and the full-size export.
import { FilterMode, ImageFormat, MipmapMode, Skia, TileMode, type SkImage, type SkRuntimeEffect } from '@shopify/react-native-skia'
import { makeSurface, quiet } from './surface'
import * as CM from '@shared/lib/editor/colorMath.js'

import { effectiveAdjust, fitEdge, geometryMatrix, type Adjust, type Crop, type EditRecipe } from './contract'

export type Frame = { x: number; y: number; w: number; h: number }

export const SKSL_SHADER = CM.SKSL_SHADER as string
export const CLARITY_BLUR = CM.CLARITY_BLUR as number
export const colorUniformsFor = CM.uniformsFor as (adjust: Partial<Adjust>, size?: { width?: number; height?: number }) => Record<string, number | number[]>
export const applyToPixel = CM.applyToPixel as (
  rgb: number[], u: Record<string, number | number[]>,
  ctx?: { yBlur?: number; yNbr?: number; u?: number; v?: number; px?: number; py?: number },
) => number[]
export const LUMA = CM.LUMA as number[]

let cached: SkRuntimeEffect | null = null
export function getEffect(): SkRuntimeEffect {
  if (cached) return cached
  const fx = Skia.RuntimeEffect.Make(SKSL_SHADER)
  if (!fx) throw new Error('Photo editor shader failed to compile')
  cached = quiet(fx)
  return fx
}

// Row-major 3x3 -> column-major (SkSL float3x3 uniform order).
const colMajor = (m: number[]) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

export type UniformInput = {
  recipe: EditRecipe
  /** Size of the image the shader samples (preview or full-size decode), px. */
  imgW: number
  imgH: number
  /** Size of the output in the shader's local units (points on screen, px offscreen). */
  outW: number
  outH: number
  /** Physical pixels per local unit (PixelRatio on screen, 1 offscreen): sharpen taps 1 device px apart. */
  density?: number
  /** Override the crop (the crop tool shows the whole frame: FULL_CROP). */
  crop?: Crop
  bypass?: boolean
  /** Paint pixels outside the photo with bg (crop tool), 0..1 RGB. */
  bg?: [number, number, number] | null
  /** Grain cell in local units (default: the shared rule for an output of outW x outH px). */
  grainCell?: number
}

export function uniformsFor({ recipe, imgW, imgH, outW, outH, density = 1, crop, bypass, bg, grainCell }: UniformInput) {
  const m = geometryMatrix(recipe, imgW, imgH, crop ? { crop } : undefined)
  const pw = outW * density, ph = outH * density
  const u: Record<string, number | number[]> = {
    ...colorUniformsFor(effectiveAdjust(recipe), { width: Math.round(pw), height: Math.round(ph) }),
    u_srcSize: [imgW, imgH],
    u_geo: colMajor(m),
    u_dx: [m[0] / pw, m[3] / pw],
    u_dy: [m[1] / ph, m[4] / ph],
    u_outSize: [outW, outH],
    u_bg: bg ?? [0, 0, 0],
    u_showBg: bg ? 1 : 0,
    u_bypass: bypass ? 1 : 0,
  }
  if (grainCell != null) u.u_grainCell = grainCell
  return u
}

// ---------------------------------------------------------------------------
// The clarity source: a small, blurred copy (same recipe as the web's makeBlurCanvas: long edge
// 128 px, Gaussian sigma CLARITY_BLUR * 128, drawn over the sharp copy so borders don't darken).
// ---------------------------------------------------------------------------
export const BLUR_EDGE = 128

export function makeBlur(img: SkImage): SkImage {
  const fit = fitEdge(img.width(), img.height(), BLUR_EDGE)
  const surface = makeSurface(fit.width, fit.height)
  if (!surface) return img
  const canvas = surface.getCanvas()
  const src = Skia.XYWHRect(0, 0, img.width(), img.height())
  const dst = Skia.XYWHRect(0, 0, fit.width, fit.height)
  canvas.drawImageRectOptions(img, src, dst, FilterMode.Linear, MipmapMode.Linear, Skia.Paint())
  const small = surface.makeImageSnapshot()
  const paint = Skia.Paint()
  const sigma = Math.max(1, CLARITY_BLUR * BLUR_EDGE)
  paint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null))
  canvas.drawImage(small, 0, 0, paint)
  surface.flush()
  const snap = surface.makeImageSnapshot()
  return quiet(snap.makeNonTextureImage() ?? snap)
}

/** Child shaders for the effect: the photo (pixel coords) and the blur stretched to the same coords. */
export function childShaders(img: SkImage, blur: SkImage, mipmap: boolean) {
  const photo = img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, mipmap ? MipmapMode.Linear : MipmapMode.None)
  const m = Skia.Matrix()
  m.scale(img.width() / blur.width(), img.height() / blur.height())
  const b = blur.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None, m)
  return [photo, b]
}

export { ImageFormat }
