import exifr from 'exifr'

const MAX_EDGE = 2048  // longest side of the public copy, in pixels
const QUALITY = 0.86

const EXIF_TAGS = ['Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO', 'Flash', 'DateTimeOriginal']

const formatShutter = (t) => {
  if (!t) return null
  return t >= 1 ? `${Number(t.toFixed(1))}s` : `1/${Math.round(1 / t)}s`
}

const isoDate = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null)

// Camera settings from a photo's EXIF data. GPS is never read.
// Returns e.g. { body, lens, focal, aperture, shutter, iso, flash, taken_on }, with missing fields left out.
export async function readCameraSettings(file) {
  let t = null
  try {
    t = await exifr.parse(file, { pick: EXIF_TAGS, gps: false })
  } catch {
    return {}
  }
  if (!t) return {}
  const model = t.Model?.trim()
  const make = t.Make?.trim()
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

// The public copy of a photo: upright, at most MAX_EDGE px, re-encoded as JPEG.
// Re-encoding through a canvas drops ALL metadata, including GPS location.
export async function makeDisplayCopy(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`Couldn’t read “${file.name}”. Try a JPEG or PNG.`)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t process the photo'))), 'image/jpeg', QUALITY),
  )
  return { blob, width, height }
}

const fileExtension = (file) => (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase()
export { fileExtension }
