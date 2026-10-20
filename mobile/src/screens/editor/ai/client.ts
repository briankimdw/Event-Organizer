// The phone's side of the shared AI client (frontend/src/api/ai.js, used unchanged).
// ai.js reads its base URL from import.meta.env.VITE_ML_URL, which shims/env.ts maps from
// EXPO_PUBLIC_ML_URL, and the token from the shared Supabase client. Two React Native adapters:
//
// 1. Uploads. On iOS / Android the global fetch is expo/fetch, whose FormData encoder does NOT
//    accept React Native's { uri, name, type } file parts (it throws, which ai.js would report as
//    "offline"). So a part here is { uri, name, type, bytes() }: expo/fetch reads bytes(), and
//    React Native's own fetch (EXPO_PUBLIC_USE_RN_FETCH=1) would read uri. Web target: a Blob.
// 2. Results. ai.js returns res.blob(); a React Native Blob has no arrayBuffer(), so the bytes are
//    read back with FileReader (web: blob.arrayBuffer()).
import { File } from 'expo-file-system'
import { Platform } from 'react-native'
import * as AI from '@shared/api/ai.js'

import type { ImageFile } from './files'

export type ToolKey = 'removeBackground' | 'erase' | 'upscale'
export type ToolCaps = { available: boolean; reason: string | null; maxInputEdge: number | null; model: string | null; scales?: number[] }
export type AiCaps = {
  ok: boolean
  error?: AiError
  tools: Record<ToolKey, ToolCaps>
  limits: { maxUploadBytes?: number; maxPixels?: number }
}
export type AiError = Error & { code: string; status?: number; serverCode?: string | null; retryAfter?: number | null }
type Raw = { blob: Blob; width: number | null; height: number | null; downscaled: boolean; ms: number | null }
export type AiResult = { bytes: Uint8Array; type: 'image/png' | 'image/jpeg'; width: number | null; height: number | null; downscaled: boolean; ms: number | null }

const api = AI as unknown as {
  aiCapabilities: (o?: { signal?: AbortSignal; force?: boolean }) => Promise<AiCaps>
  removeBackground: (img: unknown, o?: { output?: 'cutout' | 'mask'; signal?: AbortSignal }) => Promise<Raw>
  eraseObject: (img: unknown, mask: unknown, o?: { format?: 'jpeg' | 'png'; signal?: AbortSignal }) => Promise<Raw>
  upscale: (img: unknown, scale: number, o?: { format?: 'jpeg' | 'png'; signal?: AbortSignal }) => Promise<Raw>
  aiBaseUrl: () => string
  isCancel: (e: unknown) => boolean
  UPSCALE_MAX_INPUT_EDGE: number
  AiError: new (code: string, message?: string) => AiError
}

export const aiCapabilities = (o?: { force?: boolean; signal?: AbortSignal }) => api.aiCapabilities(o)
export const aiBaseUrl = () => api.aiBaseUrl()
export const isCancel = (e: unknown) => api.isCancel(e)
export const UPSCALE_MAX_INPUT_EDGE = api.UPSCALE_MAX_INPUT_EDGE ?? 1024
export const makeAiError = (code: string, message?: string) => new api.AiError(code, message)

/** A file we wrote (ai/files.ts) as something ai.js can append to its FormData. */
async function part(f: ImageFile, name: string): Promise<unknown> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(f.uri)).blob()
    return Object.assign(blob, { name }) // ai.js uses img.name as the filename
  }
  return { uri: f.uri, name, type: f.type, size: f.bytes, bytes: () => new File(f.uri).bytes() }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  if (typeof (blob as any).arrayBuffer === 'function') {
    try {
      return new Uint8Array(await (blob as any).arrayBuffer())
    } catch {}
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(makeAiError('server', 'Couldn’t read the AI result.'))
    reader.readAsArrayBuffer(blob)
  })
}

async function finish(raw: Raw): Promise<AiResult> {
  const bytes = await bytesOf(raw.blob)
  // PNG signature: 89 50 4E 47
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg'
  return { bytes, type, width: raw.width, height: raw.height, downscaled: raw.downscaled, ms: raw.ms }
}

const ext = (f: ImageFile) => (f.type === 'image/png' ? 'png' : 'jpg')

export async function removeBackground(img: ImageFile, signal: AbortSignal): Promise<AiResult> {
  return finish(await api.removeBackground(await part(img, `photo.${ext(img)}`), { output: 'cutout', signal }))
}

export async function eraseObject(img: ImageFile, mask: ImageFile, signal: AbortSignal): Promise<AiResult> {
  return finish(await api.eraseObject(await part(img, `photo.${ext(img)}`), await part(mask, 'mask.png'), { format: 'jpeg', signal }))
}

export async function upscale(img: ImageFile, scale: number, signal: AbortSignal): Promise<AiResult> {
  return finish(await api.upscale(await part(img, `photo.${ext(img)}`), scale, { format: 'jpeg', signal }))
}
