import exifr from 'exifr'

const MAX_EDGE = 2048  // longest side of the public copy, in pixels
const QUALITY = 0.86
const THUMB_EDGE = 480 // longest side of the in-app preview thumbnails

export const MAX_PHOTOS = 10                 // per post
export const MAX_FILE_BYTES = 50 * 1024 * 1024 // portfolio-originals bucket limit
export const LOW_RES_EDGE = 1200             // below this (longest side), warn that it may look soft

const EXIF_TAGS = ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'Flash', 'DateTimeOriginal']

const formatShutter = (t) => {
  if (!t) return null
  return t >= 1 ? `${Number(t.toFixed(1))}s` : `1/${Math.round(1 / t)}s`
}

const isoDate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  // EXIF dates have no time zone; exifr reads them as local time.
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Camera settings from a photo's EXIF data. GPS is never read.
// Returns e.g. { body, lens, focal, aperture, shutter, iso, flash, taken_on }, with missing fields left out.
export async function readCameraSettings(file) {
  let t = null
  try {
    t = await exifr.parse(file, { pick: EXIF_TAGS, gps: false, interop: false, xmp: false, icc: false, iptc: false })
  } catch {
    return {}
  }
  if (!t) return {}
  const model = t.Model?.trim()
  // "NIKON CORPORATION" -> "Nikon", "SONY" -> "Sony" (short all-caps brands like DJI stay as they are).
  let make = t.Make?.trim().replace(/[\s,]+(corporation|corp\.?|co\.?,?\s*ltd\.?|imaging corp\.?|camera ag)$/i, '')
  if (make && make.length > 3 && make === make.toUpperCase()) make = make[0] + make.slice(1).toLowerCase()
  const flash = typeof t.Flash === 'string' ? (/did not fire|no flash|off/i.test(t.Flash) ? 'Off' : 'On') : null
  const settings = {
    body: model && make && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0]) ? `${make} ${model}` : model || make,
    lens: t.LensModel?.trim(),
    focal: t.FocalLength ? `${Math.round(t.FocalLength)}mm` : null,
    aperture: t.FNumber ? `f/${Number(t.FNumber.toFixed(1))}` : null,
    shutter: formatShutter(t.ExposureTime),
    iso: t.ISO ? String(t.ISO) : null,
    flash,
    taken_on: isoDate(t.DateTimeOriginal),
  }
  return Object.fromEntries(Object.entries(settings).filter(([, v]) => v))
}

// ---------------------------------------------------------------------------
// Checking files before they're added to a post
// ---------------------------------------------------------------------------

const RAW_EXT = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|raw|3fr|iiq|x3f|srw)$/i
const HEIC = (file) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)

export const formatBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

// Quick checks that need no decoding. Returns null if the file looks fine, or a
// short, friendly reason it can't be posted.
export function quickCheck(file) {
  if (RAW_EXT.test(file.name)) return 'RAW files can’t be posted. Export a JPEG from your editor first.'
  if (file.type === 'image/gif' || /\.gif$/i.test(file.name)) return 'GIFs aren’t supported. Use a JPEG, PNG or WebP.'
  if (!HEIC(file) && file.type && !file.type.startsWith('image/')) return 'This isn’t a photo. Use a JPEG, PNG or WebP.'
  if (file.size > MAX_FILE_BYTES) return `Too large (${formatBytes(file.size)}). Photos can be up to ${formatBytes(MAX_FILE_BYTES)}.`
  if (file.size === 0) return 'This file is empty.'
  return null
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(
      HEIC(file)
        ? 'HEIC photos can’t be read in this browser. On iPhone, set Camera → Formats to “Most Compatible”, or export as JPEG.'
        : 'Couldn’t read this photo. Try saving it as a JPEG.',
    )
  }
}

const toJpeg = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t process the photo'))), 'image/jpeg', quality),
  )

// Draw a bitmap onto a white canvas (so transparent PNGs don't turn black) at the given size.
function draw(bitmap, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

const fit = (w, h, edge) => {
  const scale = Math.min(1, edge / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

// Decode a photo once and make a small preview for the post composer.
// Returns { thumbUrl, width, height } (width/height = the upright original size).
// Throws a friendly Error if the browser can't read it (e.g. HEIC on desktop Chrome).
export async function makePreview(file) {
  const bitmap = await decode(file)
  try {
    const { width, height } = fit(bitmap.width, bitmap.height, THUMB_EDGE)
    const blob = await toJpeg(draw(bitmap, width, height), 0.8)
    return { thumbUrl: URL.createObjectURL(blob), width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close?.()
  }
}

// The public copy of a photo: upright, at most MAX_EDGE px, re-encoded as JPEG.
// Re-encoding through a canvas drops ALL metadata, including GPS location.
export async function makeDisplayCopy(file) {
  const bitmap = await decode(file).catch((e) => {
    throw new Error(`“${file.name}”: ${e.message}`)
  })
  try {
    const { width, height } = fit(bitmap.width, bitmap.height, MAX_EDGE)
    const blob = await toJpeg(draw(bitmap, width, height), QUALITY)
    return { blob, width, height }
  } finally {
    bitmap.close?.()
  }
}

const fileExtension = (file) => (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase()
export { fileExtension }
