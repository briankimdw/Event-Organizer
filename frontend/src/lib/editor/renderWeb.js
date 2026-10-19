// Rendering edit recipes in the browser: a live preview renderer (WebGL 1, Canvas2D fallback)
// and a full-quality export to a JPEG Blob. Uses the DOM; the plain-JS math lives in recipe.js,
// geometry.js and colorMath.js (shared with mobile).
//
//   const work = await loadWorkingImage(fileOrBlobOrUrl, { maxEdge: 2048 })
//   const r = createRenderer(canvas)          // r.kind: 'webgl' | 'canvas2d'
//   r.setImage(work.canvas)
//   r.render(recipe, { width, height, mode: 'final' | 'crop' | 'original' })
//   const { blob, width, height } = await exportEdit(fileOrBlobOrUrl, recipe)   // 2048px JPEG, metadata stripped
import { normalize, effectiveAdjust, FULL_CROP } from './recipe.js'
import { geometryMatrix, mat3, orientedSize, outputSize, fitEdge } from './geometry.js'
import { applyToPixel, uniformsFor, LUMA, CLARITY_BLUR, VERTEX_SHADER, FRAGMENT_SHADER } from './colorMath.js'
import { MAX_FILE_BYTES } from '../images.js'

// Long edge of the public display copy. Must match MAX_EDGE in lib/images.js (makeDisplayCopy).
export const DISPLAY_EDGE = 2048
export const EXPORT_QUALITY = 0.86
// Hard cap for any export (iOS Safari refuses canvases over ~16.7 MP).
export const MAX_EXPORT_EDGE = 4096
const BG = [0.07, 0.07, 0.07] // what the crop tool shows outside the turned photo

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
const HEIC = (b) => /image\/hei[cf]/i.test(b?.type || '') || /\.hei[cf]$/i.test(b?.name || '')

async function toBlob(source) {
  if (source instanceof Blob) return source
  if (typeof source === 'string') {
    const res = await fetch(source, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error('Couldn’t load the photo. Check your connection and try again.')
    return res.blob()
  }
  throw new Error('Nothing to edit.')
}

// Decode a photo upright (EXIF orientation applied). Returns { bitmap, width, height, blob };
// call bitmap.close() when done.
export async function decodeSource(source) {
  const blob = await toBlob(source)
  if (blob.size > MAX_FILE_BYTES) throw new Error('This photo is over 50 MB and can’t be edited here.')
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { bitmap, width: bitmap.width, height: bitmap.height, blob }
  } catch {
    throw new Error(HEIC(blob)
      ? 'HEIC photos can’t be read in this browser. On iPhone, set Camera → Formats to “Most Compatible”, or export as JPEG.'
      : 'Couldn’t read this photo. Try saving it as a JPEG.')
  }
}

// Draw an image into a new canvas of w x h on white (transparent PNGs don't turn black), stepping
// down by halves first so large reductions stay sharp instead of aliasing.
export function drawScaled(img, w, h) {
  let src = img
  let sw = img.width, sh = img.height
  while (sw / 2 >= w * 1.5 && sh / 2 >= h * 1.5) {
    const c = document.createElement('canvas')
    c.width = Math.round(sw / 2); c.height = Math.round(sh / 2)
    const cx = c.getContext('2d')
    cx.imageSmoothingQuality = 'high'
    cx.drawImage(src, 0, 0, c.width, c.height)
    src = c; sw = c.width; sh = c.height
  }
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return out
}

// A downscaled working copy for the live preview: { canvas, width, height, fullWidth, fullHeight, blob }.
export async function loadWorkingImage(source, { maxEdge = DISPLAY_EDGE } = {}) {
  const { bitmap, width, height, blob } = await decodeSource(source)
  try {
    const fit = fitEdge(width, height, Math.min(maxEdge, maxTextureSize()))
    const canvas = drawScaled(bitmap, fit.width, fit.height)
    return { canvas, width: fit.width, height: fit.height, fullWidth: width, fullHeight: height, blob }
  } finally {
    bitmap.close?.()
  }
}

// The blurred copy used for clarity: ~CLARITY_BLUR of the long edge.
function makeBlurCanvas(img) {
  const canFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype
  const edge = canFilter ? 128 : 64
  const fit = fitEdge(img.width, img.height, edge)
  const small = drawScaled(img, fit.width, fit.height)
  if (!canFilter) return small
  const out = document.createElement('canvas')
  out.width = fit.width; out.height = fit.height
  const ctx = out.getContext('2d')
  // The sharp copy goes underneath: the blur fades to transparent at the borders, and this keeps them from darkening.
  ctx.drawImage(small, 0, 0)
  ctx.filter = `blur(${Math.max(1, CLARITY_BLUR * edge).toFixed(2)}px)`
  ctx.drawImage(small, 0, 0)
  ctx.filter = 'none'
  return out
}

let maxTex = 0
export function maxTextureSize() {
  if (maxTex) return maxTex
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    maxTex = gl ? Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192) : 4096
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    maxTex = 4096
  }
  return maxTex
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
// render(recipe, { width, height, mode }) draws into the canvas at width x height pixels.
//   mode 'final'    the edit as it will be saved
//   mode 'crop'     the whole straightened frame (no crop), with the empty area painted (crop tool)
//   mode 'original' the untouched photo, upright, uncropped (compare)
export function createRenderer(canvas, { preferCanvas2d = false } = {}) {
  if (!preferCanvas2d) {
    try {
      const r = createWebGLRenderer(canvas)
      if (r) return r
    } catch { /* fall through */ }
  }
  return createCanvasRenderer(canvas)
}

// Geometry for a render mode: { m (output uv -> source st), outW, outH (in source px) }.
function frameFor(recipe, mode, srcW, srcH) {
  if (mode === 'original') {
    const id = { ...recipe, crop: FULL_CROP, rotate: 0, straighten: 0, flipH: false }
    return { r: id, m: geometryMatrix(id, srcW, srcH), size: { width: srcW, height: srcH } }
  }
  const crop = mode === 'crop' ? FULL_CROP : recipe.crop
  return { r: recipe, m: geometryMatrix(recipe, srcW, srcH, { crop }), size: outputSize(recipe, srcW, srcH, { crop }) }
}

// The output's aspect ratio (w / h) for a mode, so callers can size the canvas before rendering.
export function renderAspect(recipe, mode, srcW, srcH) {
  const r = normalize(recipe)
  if (mode === 'original') return srcW / srcH
  if (mode === 'crop') {
    const o = orientedSize(srcW, srcH, r.rotate)
    return o.w / o.h
  }
  const s = outputSize(r, srcW, srcH)
  return s.width / s.height
}

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Shader: ${log}`)
  }
  return sh
}

function createWebGLRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) return null
  let prog, loc, uloc, texImg, texBlur, img = null, lost = false

  const init = () => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link: ${gl.getProgramInfoLog(prog)}`)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    uloc = new Map()
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)
      uloc.set(info.name, { loc: gl.getUniformLocation(prog, info.name), type: info.type })
    }
    texImg = gl.createTexture()
    texBlur = gl.createTexture()
    gl.uniform1i(uloc.get('u_img').loc, 0)
    gl.uniform1i(uloc.get('u_blur').loc, 1)
    if (img) upload(img)
  }

  const setTex = (unit, tex, source) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }
  const upload = (source) => {
    setTex(0, texImg, source)
    setTex(1, texBlur, makeBlurCanvas(source))
  }

  const set = (name, value) => {
    const u = uloc.get(name)
    if (!u) return
    if (Array.isArray(value)) {
      if (value.length === 9) gl.uniformMatrix3fv(u.loc, false, value)
      else if (value.length === 3) gl.uniform3fv(u.loc, value)
      else if (value.length === 2) gl.uniform2fv(u.loc, value)
    } else gl.uniform1f(u.loc, value)
  }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true })
  canvas.addEventListener('webglcontextrestored', () => { lost = false; init() })
  init()

  return {
    kind: 'webgl',
    canvas,
    setImage(source) {
      img = source
      if (!lost) upload(source)
    },
    render(recipeIn, { width, height, mode = 'final' } = {}) {
      if (!img || lost) return false
      const recipe = normalize(recipeIn)
      const srcW = img.width, srcH = img.height
      const { m } = frameFor(recipe, mode, srcW, srcH)
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      gl.viewport(0, 0, width, height)
      const u = uniformsFor(effectiveAdjust(recipe), { width, height })
      for (const [k, v] of Object.entries(u)) set(k, v)
      set('u_geo', mat3.toColumnMajor(m))
      // st step for one output pixel along x and y (the matrix's linear part scaled by 1 / size).
      set('u_dx', [m[0] / width, m[3] / width])
      set('u_dy', [m[1] / height, m[4] / height])
      set('u_outSize', [width, height])
      set('u_bg', BG)
      set('u_showBg', mode === 'crop' ? 1 : 0)
      set('u_bypass', mode === 'original' ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      return true
    },
    destroy() {
      img = null
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

// CPU fallback: geometry with canvas transforms, colour with applyToPixel().
function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let img = null, blur = null
  const scratch = document.createElement('canvas')
  return {
    kind: 'canvas2d',
    canvas,
    setImage(source) {
      img = source
      blur = makeBlurCanvas(source)
    },
    render(recipeIn, { width, height, mode = 'final' } = {}) {
      if (!img) return false
      const recipe = normalize(recipeIn)
      const srcW = img.width, srcH = img.height
      const { m } = frameFor(recipe, mode, srcW, srcH)
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      // source px -> output px = inverse(output px -> source px)
      const T = mat3.invert(mat3.mul(mat3.scale(srcW, srcH), mat3.mul(m, mat3.scale(1 / width, 1 / height))))
      const draw = (c, source) => {
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.fillStyle = mode === 'crop' ? `rgb(${BG.map((v) => Math.round(v * 255)).join(',')})` : '#fff'
        c.fillRect(0, 0, width, height)
        c.setTransform(T[0], T[3], T[1], T[4], T[2], T[5])
        c.imageSmoothingEnabled = true
        c.imageSmoothingQuality = 'high'
        c.drawImage(source, 0, 0, srcW, srcH)
        c.setTransform(1, 0, 0, 1, 0, 0)
      }
      draw(ctx, img)
      if (mode === 'original') return true
      const u = uniformsFor(effectiveAdjust(recipe), { width, height })
      const identity = Object.values(effectiveAdjust(recipe)).every((v) => v === 0)
      if (identity) return true
      scratch.width = width; scratch.height = height
      const sctx = scratch.getContext('2d', { willReadFrequently: true })
      draw(sctx, blur)
      const px = ctx.getImageData(0, 0, width, height)
      const bl = sctx.getImageData(0, 0, width, height).data
      const d = px.data
      const src = new Uint8ClampedArray(d)
      const lum = (i) => (src[i] * LUMA[0] + src[i + 1] * LUMA[1] + src[i + 2] * LUMA[2]) / 255
      const rgb = [0, 0, 0]
      const cx = {}
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4
          rgb[0] = src[i] / 255; rgb[1] = src[i + 1] / 255; rgb[2] = src[i + 2] / 255
          cx.yBlur = (bl[i] * LUMA[0] + bl[i + 1] * LUMA[1] + bl[i + 2] * LUMA[2]) / 255
          if (u.u_sharpen > 0) {
            const l = x > 0 ? i - 4 : i, r = x < width - 1 ? i + 4 : i
            const t = y > 0 ? i - width * 4 : i, b = y < height - 1 ? i + width * 4 : i
            cx.yNbr = 0.25 * (lum(l) + lum(r) + lum(t) + lum(b))
          } else cx.yNbr = undefined
          cx.u = (x + 0.5) / width; cx.v = (y + 0.5) / height; cx.px = x + 0.5; cx.py = y + 0.5
          const o = applyToPixel(rgb, u, cx)
          d[i] = o[0] * 255 + 0.5; d[i + 1] = o[1] * 255 + 0.5; d[i + 2] = o[2] * 255 + 0.5
        }
      }
      ctx.putImageData(px, 0, 0)
      return true
    },
    destroy() { img = null; blur = null },
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const encode = (canvas, type, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t save the edited photo.'))), type, quality))

// Render a recipe at full quality: { blob, width, height }. The photo is re-encoded through a
// canvas, so ALL metadata (including GPS) is dropped, like makeDisplayCopy().
// maxEdge: longest side of the result (DISPLAY_EDGE for the public copy; capped at MAX_EXPORT_EDGE).
export async function exportEdit(source, recipeIn, { maxEdge = DISPLAY_EDGE, quality = EXPORT_QUALITY, type = 'image/jpeg' } = {}) {
  const recipe = normalize(recipeIn)
  const { bitmap, width: fullW, height: fullH } = await decodeSource(source)
  let work
  let out
  try {
    const full = outputSize(recipe, fullW, fullH)
    out = fitEdge(full.width, full.height, Math.min(maxEdge, MAX_EXPORT_EDGE))
    // Only decode as much of the photo as the output needs (plus a little for resampling).
    const need = Math.min(1, out.scale * 1.25)
    const fit = fitEdge(fullW, fullH, Math.min(Math.ceil(Math.max(fullW, fullH) * need), maxTextureSize()))
    work = drawScaled(bitmap, fit.width, fit.height)
  } finally {
    bitmap.close?.()
  }
  const canvas = document.createElement('canvas')
  let r = createRenderer(canvas)
  try {
    r.setImage(work)
    if (!r.render(recipe, { width: out.width, height: out.height })) throw new Error('render failed')
  } catch (e) {
    // WebGL can fail on very large textures or a lost context: redo it on the CPU.
    r.destroy()
    r = createRenderer(canvas, { preferCanvas2d: true })
    r.setImage(work)
    r.render(recipe, { width: out.width, height: out.height })
  }
  try {
    const blob = await encode(canvas, type, quality)
    return { blob, width: out.width, height: out.height }
  } finally {
    r.destroy()
    canvas.width = canvas.height = 0
  }
}
