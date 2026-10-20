// Auto-enhance on the phone: the shared frontend/src/lib/editor/auto.js (same math as the web),
// fed with pixels read from a small Skia render of the working photo with the current crop /
// rotation but no colour changes (what auto.js expects: the photo as shot).
import type { SkImage } from '@shopify/react-native-skia'
import * as A from '@shared/lib/editor/auto.js'

import { defaultRecipe, type Adjust, type EditRecipe } from '../contract'
import { renderToImage } from '../exportImage'
import { rgbaOf } from './files'

type AutoAdjust = Pick<Adjust, 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' | 'temperature' | 'tint' | 'vibrance'>
type Pixels = { data: Uint8ClampedArray; width: number; height: number }

export const AUTO_KEYS = A.AUTO_KEYS as (keyof AutoAdjust)[]
export const AUTO_SAMPLE_EDGE = A.AUTO_SAMPLE_EDGE as number
export const autoEnhance = A.autoEnhance as unknown as (input: Pixels, opts?: { strength?: number }) => { adjust: AutoAdjust; mono: boolean }
export const applyAuto = A.applyAuto as (r: EditRecipe, adjust: AutoAdjust) => EditRecipe
export const isAutoApplied = A.isAutoApplied as (r: EditRecipe, adjust: AutoAdjust | null) => boolean
export const describeAuto = A.describeAuto as (adjust: AutoAdjust | null) => string

/** Suggested sliders for `img` (the working preview) as cropped by `recipe`. */
export function autoFor(img: SkImage, blur: SkImage, recipe: EditRecipe): { adjust: AutoAdjust; mono: boolean } {
  const geometryOnly: EditRecipe = { ...defaultRecipe(), crop: recipe.crop, aspect: recipe.aspect, rotate: recipe.rotate, straighten: recipe.straighten, flipH: recipe.flipH }
  const small = renderToImage(img, geometryOnly, { maxEdge: AUTO_SAMPLE_EDGE, blur })
  try {
    return autoEnhance(rgbaOf(small.image, AUTO_SAMPLE_EDGE))
  } finally {
    small.image.dispose?.()
  }
}
