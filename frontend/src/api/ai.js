// AI photo tools on the ML service (services/ml): remove background, erase, upscale.
// Contract: docs/AI_TOOLS.md. Plain JS (fetch + FormData + supabase), shared with mobile.
//
//   const caps = await aiCapabilities()                 // never throws; caps.tools.erase.available …
//   const { blob, width, height } = await removeBackground(photoBlob, { signal })
//   const out = await eraseObject(photoBlob, maskPngBlob, { signal })
//   const big = await upscale(photoBlob, 2, { signal })
//
// Every call needs the signed-in user's Supabase access token (sent as a Bearer token).
// Failures throw an AiError whose `code` is one of AI_ERRORS and whose `message` can be shown as is.
// Images can be a Blob / File (web) or a React Native file object { uri, name, type }.
// Expo SDK 57's fetch (expo/fetch) can't encode a bare { uri, name, type } part: pass
// { uri, name, type, size, bytes() } instead (see mobile/src/screens/editor/ai/client.ts).
import { supabase } from '../lib/supabase.js'

// VITE_ML_URL wins (mobile maps EXPO_PUBLIC_ML_URL onto it); otherwise port 8000 on the page's
// host, so a phone on the LAN reaches the dev machine too. Empty (e.g. mobile without it) = off.
const envUrl = (() => {
  try { return import.meta.env?.VITE_ML_URL || '' } catch { return '' }
})()
const pageHost = typeof location !== 'undefined' && location?.hostname ? `http://${location.hostname}:8000` : ''
let baseUrl = String(envUrl || pageHost).trim().replace(/\/+$/, '')
let getToken = async () => {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

// Override where the service is and how the token is read (tests, mobile).
export function configureAi({ url, accessToken } = {}) {
  if (url !== undefined) baseUrl = String(url || '').trim().replace(/\/+$/, '')
  if (accessToken) getToken = accessToken
  capsCache = null
}
export const aiBaseUrl = () => baseUrl

export const AI_ERRORS = ['not_configured', 'signed_out', 'offline', 'timeout', 'cancelled', 'too_large', 'unavailable', 'busy', 'rate_limited', 'bad_input', 'server']

const MESSAGES = {
  not_configured: 'AI tools aren’t set up in this app.',
  signed_out: 'Sign in to use the AI tools.',
  offline: 'AI tools are offline right now. Your other edits still work.',
  timeout: 'The AI tool took too long. Try again, or try a smaller photo or area.',
  cancelled: 'Cancelled.',
  too_large: 'This photo is too large for this tool.',
  unavailable: 'This AI tool isn’t available on the server right now.',
  busy: 'The AI tools are busy. Try again in a moment.',
  rate_limited: 'You’ve used the AI tools a lot in the last few minutes. Try again in a little while.',
  bad_input: 'The AI tool couldn’t read this photo.',
  server: 'The AI tool failed. Try again.',
}

export class AiError extends Error {
  // code: one of AI_ERRORS. serverCode: the service's own code (docs/AI_TOOLS.md), when there is one.
  constructor(code, message, { status = 0, serverCode = null, retryAfter = null } = {}) {
    super(message || MESSAGES[code] || MESSAGES.server)
    this.name = 'AiError'
    this.code = code
    this.status = status
    this.serverCode = serverCode
    this.retryAfter = retryAfter
  }
}
export const isCancel = (e) => e?.code === 'cancelled'

const TIMEOUTS = { capabilities: 8000, removeBackground: 120000, erase: 120000, upscale: 180000 }

function fromStatus(status, detail, headers) {
  const serverCode = typeof detail?.code === 'string' ? detail.code : null
  const msg = typeof detail?.message === 'string' && detail.message ? detail.message : typeof detail === 'string' ? detail : ''
  const retryAfter = Number(headers?.get?.('Retry-After')) || null
  const opts = { status, serverCode, retryAfter }
  if (status === 401) return new AiError('signed_out', MESSAGES.signed_out, opts)
  if (status === 413) {
    return new AiError('too_large', serverCode === 'upscale_input_too_large'
      ? 'Upscaling works on photos up to 1024 px on the long edge.'
      : msg || MESSAGES.too_large, opts)
  }
  if (status === 429) {
    const mins = retryAfter ? Math.max(1, Math.ceil(retryAfter / 60)) : null
    return new AiError('rate_limited', mins ? `You’ve used the AI tools a lot in the last few minutes. Try again in ${mins} min.` : MESSAGES.rate_limited, opts)
  }
  if (status === 503) return serverCode === 'busy' ? new AiError('busy', MESSAGES.busy, opts) : new AiError('unavailable', msg || MESSAGES.unavailable, opts)
  if (status === 400 || status === 422) return new AiError('bad_input', msg || MESSAGES.bad_input, opts)
  return new AiError('server', MESSAGES.server, opts)
}

const appendImage = (form, field, img, name) => {
  if (img && typeof img === 'object' && 'uri' in img && !(typeof Blob !== 'undefined' && img instanceof Blob)) form.append(field, img) // React Native
  else form.append(field, img, img?.name || name)
}

// One request: auth, timeout + caller cancellation, one retry after refreshing an expired token.
async function request(path, { method = 'POST', form = null, signal, timeout, json = false } = {}) {
  if (!baseUrl) throw new AiError('not_configured')
  if (signal?.aborted) throw new AiError('cancelled')
  let token = await getToken()
  if (!token) throw new AiError('signed_out')

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    let timedOut = false
    const onAbort = () => ctrl.abort()
    signal?.addEventListener?.('abort', onAbort)
    const timer = timeout ? setTimeout(() => { timedOut = true; ctrl.abort() }, timeout) : null
    let res
    try {
      res = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: form || undefined, signal: ctrl.signal })
      if (res.ok) {
        if (json) return await res.json()
        const blob = await res.blob()
        const h = (k) => res.headers.get(k)
        return {
          blob,
          width: Number(h('X-Image-Width')) || null,
          height: Number(h('X-Image-Height')) || null,
          downscaled: h('X-Input-Downscaled') === 'true',
          ms: Number(h('X-Processing-Ms')) || null,
        }
      }
    } catch (e) {
      if (signal?.aborted) throw new AiError('cancelled')
      if (timedOut) throw new AiError('timeout')
      if (e instanceof AiError) throw e
      throw new AiError(res ? 'server' : 'offline') // a response that broke mid-read vs no service at all
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
    }
    let detail = null
    try { detail = (await res.json())?.detail } catch { /* not JSON */ }
    if (res.status === 401 && attempt === 0) {
      // Expired token: refresh once and retry.
      try { await supabase.auth.refreshSession() } catch { /* fall through */ }
      const next = await getToken()
      if (next && next !== token) { token = next; continue }
    }
    throw fromStatus(res.status, detail, res.headers)
  }
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------
const TOOL_KEYS = { removeBackground: 'remove_background', erase: 'erase', upscale: 'upscale' }
let capsCache = null // { at, value }
const CAPS_TTL = 60_000

const offlineCaps = (error) => ({
  ok: false,
  error,
  tools: Object.fromEntries(Object.keys(TOOL_KEYS).map((k) => [k, { available: false, reason: error.message }])),
  limits: {},
})

/**
 * What the server can do: never throws.
 * -> { ok, error?: AiError, tools: { removeBackground, erase, upscale }, limits: { maxUploadBytes, maxPixels } }
 *    each tool: { available, reason?, maxInputEdge?, scales? (upscale), model? }
 */
export async function aiCapabilities({ signal, force = false } = {}) {
  if (!force && capsCache && Date.now() - capsCache.at < CAPS_TTL) return capsCache.value
  let raw
  try {
    raw = await request('/ai/capabilities', { method: 'GET', signal, timeout: TIMEOUTS.capabilities, json: true })
  } catch (e) {
    return offlineCaps(e instanceof AiError ? e : new AiError('offline'))
  }
  const tools = {}
  for (const [k, key] of Object.entries(TOOL_KEYS)) {
    const t = raw?.tools?.[key] || {}
    tools[k] = {
      available: !!t.available,
      reason: t.available ? null : (t.reason ? `Not available: ${String(t.reason).replace(/\s*\(run .*\)$/i, '')}` : 'Not available on this server.'),
      maxInputEdge: Number(t.max_input_edge) || null,
      model: t.model || null,
      ...(k === 'upscale' ? { scales: Array.isArray(t.scales) && t.scales.length ? t.scales.map(Number) : [2, 4] } : {}),
    }
  }
  const value = {
    ok: true,
    tools,
    limits: { maxUploadBytes: Number(raw?.limits?.max_upload_bytes) || 30 * 1024 * 1024, maxPixels: Number(raw?.limits?.max_pixels) || 50e6 },
  }
  capsCache = { at: Date.now(), value }
  return value
}

const checkSize = (img) => {
  const max = capsCache?.value?.limits?.maxUploadBytes
  if (max && typeof img?.size === 'number' && img.size > max) {
    throw new AiError('too_large', `This photo is over ${Math.round(max / 1024 / 1024)} MB, the most the AI tools take.`)
  }
}

// ---------------------------------------------------------------------------
// Tools. Each resolves to { blob, width, height, downscaled, ms }.
// ---------------------------------------------------------------------------

// output 'cutout' (PNG with a transparent background, default) or 'mask' (8-bit PNG, white = subject).
export async function removeBackground(image, { output = 'cutout', signal, timeout = TIMEOUTS.removeBackground } = {}) {
  checkSize(image)
  const form = new FormData()
  appendImage(form, 'image', image, 'photo.jpg')
  form.append('output', output)
  return request('/ai/remove-background', { form, signal, timeout })
}

// mask: PNG, white = remove, black / transparent = keep, same aspect ratio as the (upright) image.
export async function eraseObject(image, mask, { format = 'jpeg', signal, timeout = TIMEOUTS.erase } = {}) {
  checkSize(image)
  const form = new FormData()
  appendImage(form, 'image', image, 'photo.jpg')
  appendImage(form, 'mask', mask, 'mask.png')
  form.append('format', format)
  return request('/ai/erase', { form, signal, timeout })
}

// scale: 2 or 4. The input's long edge must be at most 1024 px (UPSCALE_MAX_INPUT_EDGE).
export const UPSCALE_MAX_INPUT_EDGE = 1024
export async function upscale(image, scale = 2, { format = 'jpeg', signal, timeout = TIMEOUTS.upscale } = {}) {
  checkSize(image)
  const form = new FormData()
  appendImage(form, 'image', image, 'photo.jpg')
  form.append('scale', String(scale))
  form.append('format', format)
  return request('/ai/upscale', { form, signal, timeout })
}
