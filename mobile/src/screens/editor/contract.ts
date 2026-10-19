// Typed view of the shared, plain-JS editor contract (frontend/src/lib/editor/*), which the web
// editor uses too, so a recipe made on the phone renders the same on the web and back.
// Read-only here: never edit frontend/**. The JS is type-inferred, so this file gives the
// recipe a real type and re-exports the functions with typed signatures.
import * as G from '@shared/lib/editor/geometry.js'
import * as R from '@shared/lib/editor/recipe.js'

export type Crop = { x: number; y: number; w: number; h: number }
export type AdjustKey =
  | 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks'
  | 'temperature' | 'tint' | 'vibrance' | 'saturation'
  | 'clarity' | 'sharpen' | 'vignette' | 'grain' | 'fade'
export type Adjust = Record<AdjustKey, number>
export type AspectId = 'original' | 'free' | '1:1' | '4:5' | '5:4' | '3:2' | '2:3' | '16:9' | '9:16'
export type EditRecipe = {
  v: number
  crop: Crop
  aspect: AspectId
  rotate: number // 0 | 90 | 180 | 270
  straighten: number // -45..45
  flipH: boolean
  adjust: Adjust
  filter: { id: string; strength: number } | null
}
export type AdjustmentDef = { key: AdjustKey; label: string; group: 'light' | 'color' | 'effects'; min: number; max: number }
export type AspectDef = { id: AspectId; label: string; ratio: number | 'original' | null; swap?: AspectId; hidden?: boolean }
export type PresetDef = { id: string; name: string; adjust: Partial<Adjust> }
export type Mat3 = number[]

export const ADJUSTMENTS = R.ADJUSTMENTS as AdjustmentDef[]
export const ADJUST_KEYS = R.ADJUST_KEYS as AdjustKey[]
export const ASPECTS = R.ASPECTS as AspectDef[]
export const PRESETS = R.PRESETS as PresetDef[]
export const FULL_CROP = R.FULL_CROP as Crop
export const defaultRecipe = R.defaultRecipe as () => EditRecipe
export const normalize = R.normalize as (input: unknown) => EditRecipe
export const effectiveAdjust = R.effectiveAdjust as (r: EditRecipe) => Adjust
export const describe = R.describe as (r: EditRecipe | null) => string
export const formatAdjust = R.formatAdjust as (key: AdjustKey, v: number) => string
export const isIdentity = R.isIdentity as (r: unknown) => boolean
export const sameRecipe = R.sameRecipe as (a: unknown, b: unknown) => boolean
export const hasCrop = R.hasCrop as (r: EditRecipe) => boolean
export const hasGeometry = R.hasGeometry as (r: EditRecipe) => boolean
export const toStorable = R.toStorable as (r: unknown) => Partial<EditRecipe> | null
export const getPreset = R.getPreset as (id: string) => PresetDef | null
export const aspectRatio = R.aspectRatio as (aspect: AspectId, frameW?: number, frameH?: number) => number | null
export const exposureToEv = R.exposureToEv as (v: number) => number

export const mat3 = G.mat3 as unknown as { apply: (m: Mat3, x: number, y: number) => [number, number]; invert: (m: Mat3) => Mat3; mul: (a: Mat3, b: Mat3) => Mat3 }
export const geometryMatrix = G.geometryMatrix as (r: EditRecipe, srcW: number, srcH: number, opts?: { crop?: Crop }) => Mat3
export const outputSize = G.outputSize as (r: EditRecipe, srcW: number, srcH: number, opts?: { crop?: Crop }) => { width: number; height: number }
export const orientedSize = G.orientedSize as (srcW: number, srcH: number, rotate?: number) => { w: number; h: number }
export const fitEdge = G.fitEdge as (w: number, h: number, maxEdge: number) => { width: number; height: number; scale: number }
export const fitCrop = G.fitCrop as (crop: Crop, frameW: number, frameH: number, straighten: number) => Crop
export const cropForAspect = G.cropForAspect as (aspect: AspectId, frameW: number, frameH: number, straighten?: number) => Crop
export const constrain = G.constrain as (prev: Crop, at: (t: number) => Crop, frameW: number, frameH: number, straighten: number) => Crop
export const moveCrop = G.moveCrop as (crop: Crop, dx: number, dy: number, frameW: number, frameH: number, straighten: number) => Crop
export const resizeCrop = G.resizeCrop as (crop: Crop, handle: string, dx: number, dy: number, ratio: number | null, frameW: number, frameH: number, straighten: number) => Crop
export const isValidCrop = G.isValidCrop as (crop: Crop, frameW: number, frameH: number, straighten: number) => boolean
export const rotateRecipe = G.rotateRecipe as (r: EditRecipe) => EditRecipe
export const flipRecipe = G.flipRecipe as (r: EditRecipe) => EditRecipe
export const swappedAspect = G.swappedAspect as (a: AspectId) => AspectId
