// The per-pixel colour pipeline, written three ways that must agree:
//   1. as math (this comment),
//   2. as a CPU reference, applyToPixel() (tests, and the Canvas2D fallback in renderWeb.js),
//   3. as shader source: GLSL ES 1.00 for WebGL (FRAGMENT_SHADER) and SkSL for
//      @shopify/react-native-skia (SKSL_SHADER), both built from the same COLOR_FUNCTIONS body.
// Plain JS (no DOM). Uniform values for both shaders come from uniformsFor(recipe, size).
//
// Pipeline (c = the source pixel, sRGB-encoded 0..1; LUMA = Rec.709 weights 0.2126, 0.7152, 0.0722):
//  1. Linearize:  lin = srgbToLinear(c)                          (exact piecewise sRGB curve)
//  2. White balance + exposure (linear light):
//        lin *= u_wb * u_exposure
//        u_wb = gains / dot(gains, LUMA), gains = (2^(0.60T + 0.20G), 2^(-0.40G), 2^(-0.60T + 0.20G))
//        T = temperature / 100 (warm > 0), G = tint / 100 (magenta > 0); u_exposure = 2^EV, EV = exposure / 50
//  3. Back to sRGB encoding e = linearToSrgb(lin) (values > 1 allowed), then a highlight shoulder
//        when brightening: e = mix(e, shoulder(e), u_shoulder), shoulder(x) = x < k ? x : k + (1-k)(1 - exp(-(x-k)/(1-k))), k = 0.75,
//        u_shoulder = clamp(EV, 0, 1)
//  4. Tone (on luma, applied as an additive shift so it doesn't change colour):
//        Y = dot(e, LUMA); t = (clamp(Y,0,1) - u_black) / (u_white - u_black)
//        u_black = -0.10 * blacks/100, u_white = 1 - 0.20 * whites/100
//        tc = clamp(t, 0, 1)
//        t += u_shadows    * k(u_shadows,    0.40, 0.14) * 6.75 * tc (1-tc)^2   (bump peaking at 1/3)
//        t += u_highlights * k(u_highlights, 0.14, 0.40) * 6.75 * tc^2 (1-tc)    (bump peaking at 2/3)
//        (k picks the first factor for positive values, the second for negative, keeping the curve monotonic)
//        e += t - Y
//  5. Local contrast from the source luma Ys = dot(c, LUMA):
//        clarity: e += u_clarity * 1.1 * (Ys - Yblur) * mid(Y'),  mid(y) = 0.35 + 0.65 (1 - (2y-1)^2)
//                 (Yblur = luma of a heavily blurred copy of the source, ~1.5% of the long edge)
//        sharpen: e += u_sharpen * 1.6 * (Ys - Ynbr)            (Ynbr = mean luma of the 4 neighbours, 1 output px away)
//  6. Contrast (per channel, S-curve around 0.5):
//        > 0: e = mix(e, smoothstep(0, 1, e), 0.75 u_contrast);   < 0: e = 0.5 + (e - 0.5)(1 + 0.45 u_contrast)
//  7. Saturation / vibrance (around luma Y2 = dot(e, LUMA)):
//        e = Y2 + (e - Y2) * (1 + u_saturation) * (1 + u_vibrance * (1 - s)),  s = clamp(max(e) - min(e), 0, 1)
//  8. Fade (matte): e = e * (1 - 0.14 u_fade) + 0.10 u_fade      (blacks lift to 0.10, whites drop to 0.96)
//  9. Vignette, d = |(u,v) - 0.5| * 2 / sqrt(2) (0 centre, 1 corners), m = smoothstep(0.30, 1.05, d)^1.5:
//        < 0: e *= 1 + 0.85 u_vignette m;   > 0: e = mix(e, 1, 0.6 u_vignette m)
// 10. Grain: e += u_grain * 0.14 * (noise - 0.5) * (1 - 0.6 (2Y-1)^2), noise = smooth value noise of
//        hash12 on a grid of u_grainCell output pixels (monochrome, deterministic).
// 11. Clamp to 0..1.

export const LUMA = [0.2126, 0.7152, 0.0722]

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (x) => x - Math.floor(x)

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
export const linearToSrgb = (c) => {
  const x = Math.max(c, 0)
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}
const SHOULDER_K = 0.75
const shoulder = (x) => (x < SHOULDER_K ? x : SHOULDER_K + (1 - SHOULDER_K) * (1 - Math.exp(-(x - SHOULDER_K) / (1 - SHOULDER_K))))

// Dave Hoskins' hash without sine (portable across GPUs).
export function hash12(x, y) {
  let p0 = fract(x * 0.1031), p1 = fract(y * 0.1031), p2 = fract(x * 0.1031)
  const d = p0 * (p1 + 33.33) + p1 * (p2 + 33.33) + p2 * (p0 + 33.33)
  p0 += d; p1 += d; p2 += d
  return fract((p0 + p1) * p2)
}
export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
  return mix(mix(hash12(ix, iy), hash12(ix + 1, iy), fx), mix(hash12(ix, iy + 1), hash12(ix + 1, iy + 1), fx), fy)
}

// ---------------------------------------------------------------------------
// Uniforms: the recipe's effective adjustments as shader-ready numbers.
// ---------------------------------------------------------------------------
// adjust: effective adjustments (recipe.js effectiveAdjust()). size: the output in pixels.
export function uniformsFor(adjust, { width = 1000, height = 1000 } = {}) {
  const a = (k) => (Number(adjust?.[k]) || 0) / 100
  const T = a('temperature'), G = a('tint')
  const gains = [Math.pow(2, 0.6 * T + 0.2 * G), Math.pow(2, -0.4 * G), Math.pow(2, -0.6 * T + 0.2 * G)]
  const gl = gains[0] * LUMA[0] + gains[1] * LUMA[1] + gains[2] * LUMA[2]
  const ev = a('exposure') * 2
  return {
    u_wb: gains.map((g) => g / gl),
    u_exposure: Math.pow(2, ev),
    u_shoulder: clamp(ev, 0, 1),
    u_black: -0.1 * a('blacks'),
    u_white: 1 - 0.2 * a('whites'),
    u_highlights: a('highlights'),
    u_shadows: a('shadows'),
    u_clarity: a('clarity'),
    u_sharpen: a('sharpen'),
    u_contrast: a('contrast'),
    u_saturation: a('saturation'),
    u_vibrance: a('vibrance'),
    u_fade: a('fade'),
    u_vignette: a('vignette'),
    u_grain: a('grain'),
    u_grainCell: Math.max(1, Math.max(width, height) / 1200),
  }
}

// Blur radius for the clarity copy, as a fraction of the long edge (renderers make the blurred copy).
export const CLARITY_BLUR = 0.015

// ---------------------------------------------------------------------------
// CPU reference
// ---------------------------------------------------------------------------
// rgb: [r, g, b] sRGB-encoded 0..1. u: uniformsFor(...).
// ctx (optional): { yBlur, yNbr } (lumas, see step 5; default = this pixel's own luma, i.e. no local
// contrast), { u, v } output position 0..1 (vignette; default centre), { px, py } output pixel (grain).
// Returns a new [r, g, b] in 0..1.
export function applyToPixel(rgb, u, ctx = {}) {
  const ys = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2]
  let r = srgbToLinear(rgb[0]) * u.u_wb[0] * u.u_exposure
  let g = srgbToLinear(rgb[1]) * u.u_wb[1] * u.u_exposure
  let b = srgbToLinear(rgb[2]) * u.u_wb[2] * u.u_exposure
  r = linearToSrgb(r); g = linearToSrgb(g); b = linearToSrgb(b)
  if (u.u_shoulder > 0) {
    r = mix(r, shoulder(r), u.u_shoulder); g = mix(g, shoulder(g), u.u_shoulder); b = mix(b, shoulder(b), u.u_shoulder)
  }

  // 4. tone
  const Y = r * LUMA[0] + g * LUMA[1] + b * LUMA[2]
  let t = (clamp01(Y) - u.u_black) / (u.u_white - u.u_black)
  const tc = clamp01(t)
  t += u.u_shadows * (u.u_shadows > 0 ? 0.4 : 0.14) * 6.75 * tc * (1 - tc) * (1 - tc)
  t += u.u_highlights * (u.u_highlights > 0 ? 0.14 : 0.4) * 6.75 * tc * tc * (1 - tc)
  const dy = t - Y
  r += dy; g += dy; b += dy

  // 5. local contrast
  const mid = 0.35 + 0.65 * (1 - (2 * clamp01(t) - 1) ** 2)
  const lc = u.u_clarity * 1.1 * (ys - (ctx.yBlur ?? ys)) * mid + u.u_sharpen * 1.6 * (ys - (ctx.yNbr ?? ys))
  r += lc; g += lc; b += lc

  // 6. contrast
  if (u.u_contrast > 0) {
    const k = 0.75 * u.u_contrast
    r = mix(r, smoothstep(0, 1, r), k); g = mix(g, smoothstep(0, 1, g), k); b = mix(b, smoothstep(0, 1, b), k)
  } else if (u.u_contrast < 0) {
    const k = 1 + 0.45 * u.u_contrast
    r = 0.5 + (r - 0.5) * k; g = 0.5 + (g - 0.5) * k; b = 0.5 + (b - 0.5) * k
  }

  // 7. saturation / vibrance
  const y2 = r * LUMA[0] + g * LUMA[1] + b * LUMA[2]
  const s = clamp01(Math.max(r, g, b) - Math.min(r, g, b))
  const f = (1 + u.u_saturation) * (1 + u.u_vibrance * (1 - s))
  r = y2 + (r - y2) * f; g = y2 + (g - y2) * f; b = y2 + (b - y2) * f

  // 8. fade
  if (u.u_fade > 0) {
    const m = 1 - 0.14 * u.u_fade, o = 0.1 * u.u_fade
    r = r * m + o; g = g * m + o; b = b * m + o
  }

  // 9. vignette
  if (u.u_vignette !== 0) {
    const du = (ctx.u ?? 0.5) - 0.5, dv = (ctx.v ?? 0.5) - 0.5
    const d = Math.sqrt(du * du + dv * dv) * 2 / Math.SQRT2
    const m = Math.pow(smoothstep(0.3, 1.05, d), 1.5)
    if (u.u_vignette < 0) {
      const k = 1 + 0.85 * u.u_vignette * m
      r *= k; g *= k; b *= k
    } else {
      const k = 0.6 * u.u_vignette * m
      r = mix(r, 1, k); g = mix(g, 1, k); b = mix(b, 1, k)
    }
  }

  // 10. grain
  if (u.u_grain > 0) {
    const yy = clamp01(r * LUMA[0] + g * LUMA[1] + b * LUMA[2])
    const n = valueNoise((ctx.px ?? 0) / u.u_grainCell, (ctx.py ?? 0) / u.u_grainCell) - 0.5
    const k = u.u_grain * 0.14 * n * (1 - 0.6 * (2 * yy - 1) ** 2)
    r += k; g += k; b += k
  }
  return [clamp01(r), clamp01(g), clamp01(b)]
}

// ---------------------------------------------------------------------------
// Shader source. COLOR_FUNCTIONS uses only the GLSL ES 1.00 / SkSL common subset:
// float/vec2/vec3 math, mix, clamp, smoothstep, step, pow, exp, floor, fract, dot, max, min,
// sqrt; float literals everywhere (no int -> float conversion); no loops, arrays or textures.
// ---------------------------------------------------------------------------
export const COLOR_UNIFORMS = `
uniform vec3 u_wb;
uniform float u_exposure;
uniform float u_shoulder;
uniform float u_black;
uniform float u_white;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_clarity;
uniform float u_sharpen;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_fade;
uniform float u_vignette;
uniform float u_grain;
uniform float u_grainCell;
`

export const COLOR_FUNCTIONS = `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 pm_toLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}

vec3 pm_toSrgb(vec3 c) {
  vec3 x = max(c, vec3(0.0));
  vec3 lo = x * 12.92;
  vec3 hi = 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), x));
}

vec3 pm_shoulder(vec3 x) {
  vec3 over = 0.75 + 0.25 * (1.0 - exp(-(x - 0.75) / 0.25));
  return mix(x, over, step(vec3(0.75), x));
}

float pm_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float pm_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = pm_hash12(i);
  float b = pm_hash12(i + vec2(1.0, 0.0));
  float c = pm_hash12(i + vec2(0.0, 1.0));
  float d = pm_hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// c: source pixel (sRGB-encoded). yBlur / yNbr: see step 5. uv: output position 0..1. px: output pixel.
vec3 pm_color(vec3 c, float yBlur, float yNbr, vec2 uv, vec2 px) {
  float ys = dot(c, LUMA);
  vec3 e = pm_toSrgb(pm_toLinear(c) * u_wb * u_exposure);
  e = mix(e, pm_shoulder(e), u_shoulder);

  float Y = dot(e, LUMA);
  float t = (clamp(Y, 0.0, 1.0) - u_black) / (u_white - u_black);
  float tc = clamp(t, 0.0, 1.0);
  float ks = u_shadows > 0.0 ? 0.4 : 0.14;
  float kh = u_highlights > 0.0 ? 0.14 : 0.4;
  t += u_shadows * ks * 6.75 * tc * (1.0 - tc) * (1.0 - tc);
  t += u_highlights * kh * 6.75 * tc * tc * (1.0 - tc);
  e += vec3(t - Y);

  float m2 = 2.0 * clamp(t, 0.0, 1.0) - 1.0;
  float mid = 0.35 + 0.65 * (1.0 - m2 * m2);
  e += vec3(u_clarity * 1.1 * (ys - yBlur) * mid + u_sharpen * 1.6 * (ys - yNbr));

  if (u_contrast > 0.0) {
    vec3 ec = clamp(e, 0.0, 1.0);
    e = mix(e, ec * ec * (3.0 - 2.0 * ec), 0.75 * u_contrast);
  } else {
    e = 0.5 + (e - 0.5) * (1.0 + 0.45 * u_contrast);
  }

  float y2 = dot(e, LUMA);
  float s = clamp(max(e.r, max(e.g, e.b)) - min(e.r, min(e.g, e.b)), 0.0, 1.0);
  e = vec3(y2) + (e - vec3(y2)) * ((1.0 + u_saturation) * (1.0 + u_vibrance * (1.0 - s)));

  e = e * (1.0 - 0.14 * u_fade) + 0.1 * u_fade;

  vec2 dv = uv - 0.5;
  float d = sqrt(dot(dv, dv)) * 1.41421356;
  float vm = pow(smoothstep(0.3, 1.05, d), 1.5);
  if (u_vignette < 0.0) {
    e *= 1.0 + 0.85 * u_vignette * vm;
  } else {
    e = mix(e, vec3(1.0), 0.6 * u_vignette * vm);
  }

  float yy = clamp(dot(e, LUMA), 0.0, 1.0);
  float gm = 2.0 * yy - 1.0;
  e += vec3(u_grain * 0.14 * (pm_noise(px / u_grainCell) - 0.5) * (1.0 - 0.6 * gm * gm));

  return clamp(e, 0.0, 1.0);
}
`

// ---------------------------------------------------------------------------
// WebGL 1 (GLSL ES 1.00)
// ---------------------------------------------------------------------------
export const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

// u_geo: output uv -> source st (geometry.js geometryMatrix, column-major). u_dx / u_dy: the source
// st step for one output pixel along x / y (sharpen taps). u_bg / u_showBg: paint pixels that fall
// outside the photo (only the crop tool shows those; otherwise edges are clamped).
export const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_img;
uniform sampler2D u_blur;
uniform mat3 u_geo;
uniform vec2 u_dx;
uniform vec2 u_dy;
uniform vec2 u_outSize;
uniform vec3 u_bg;
uniform float u_showBg;
uniform float u_bypass;
${COLOR_UNIFORMS}
${COLOR_FUNCTIONS}
void main() {
  vec2 st = (u_geo * vec3(v_uv, 1.0)).xy;
  vec2 lim = abs(u_dx) + abs(u_dy);
  if (u_showBg > 0.5 && (st.x < -lim.x || st.y < -lim.y || st.x > 1.0 + lim.x || st.y > 1.0 + lim.y)) {
    gl_FragColor = vec4(u_bg, 1.0);
    return;
  }
  vec3 c = texture2D(u_img, st).rgb;
  if (u_bypass > 0.5) {
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  float yBlur = dot(texture2D(u_blur, st).rgb, LUMA);
  float yNbr = 0.25 * (dot(texture2D(u_img, st + u_dx).rgb, LUMA) + dot(texture2D(u_img, st - u_dx).rgb, LUMA)
                     + dot(texture2D(u_img, st + u_dy).rgb, LUMA) + dot(texture2D(u_img, st - u_dy).rgb, LUMA));
  gl_FragColor = vec4(pm_color(c, yBlur, yNbr, v_uv, v_uv * u_outSize), 1.0);
}
`

// ---------------------------------------------------------------------------
// SkSL (react-native-skia Skia.RuntimeEffect.Make). Same uniforms plus u_srcSize; the two images are
// child shaders sampled in pixel coordinates. NOT verified on a device here: mobile-editor owns that.
// Differences from the GLSL version:
//  - main(float2 fragCoord) returns half4; no varyings: uv = fragCoord / u_outSize.
//  - textures are `uniform shader` children: u_img.eval(st * u_srcSize). Make u_img with
//    image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None), and
//    u_blur from the blurred copy with a local matrix scaling it to u_srcSize, so both share coordinates.
//  - vecN -> floatN, mat3 -> float3x3 (Skia passes a mat3 uniform as 9 numbers, column-major).
//  - colour management: draw into an sRGB (non-linear) surface so eval() returns sRGB-encoded values.
// ---------------------------------------------------------------------------
const toSksl = (src) => src.replace(/\bvec([234])\b/g, 'float$1').replace(/\bmat3\b/g, 'float3x3')
export const SKSL_SHADER = toSksl(`
uniform shader u_img;
uniform shader u_blur;
uniform vec2 u_srcSize;
uniform mat3 u_geo;
uniform vec2 u_dx;
uniform vec2 u_dy;
uniform vec2 u_outSize;
uniform vec3 u_bg;
uniform float u_showBg;
uniform float u_bypass;
${COLOR_UNIFORMS}
${COLOR_FUNCTIONS.replace('const vec3 LUMA', 'const vec3 LUMA')}
half4 main(vec2 fragCoord) {
  vec2 uv = fragCoord / u_outSize;
  vec2 st = (u_geo * vec3(uv, 1.0)).xy;
  vec2 lim = abs(u_dx) + abs(u_dy);
  if (u_showBg > 0.5 && (st.x < -lim.x || st.y < -lim.y || st.x > 1.0 + lim.x || st.y > 1.0 + lim.y)) {
    return half4(half3(u_bg), 1.0);
  }
  st = clamp(st, vec2(0.0), vec2(1.0));
  vec3 c = vec3(u_img.eval(st * u_srcSize).rgb);
  if (u_bypass > 0.5) {
    return half4(half3(c), 1.0);
  }
  float yBlur = dot(vec3(u_blur.eval(st * u_srcSize).rgb), LUMA);
  float yNbr = 0.25 * (dot(vec3(u_img.eval((st + u_dx) * u_srcSize).rgb), LUMA) + dot(vec3(u_img.eval((st - u_dx) * u_srcSize).rgb), LUMA)
                     + dot(vec3(u_img.eval((st + u_dy) * u_srcSize).rgb), LUMA) + dot(vec3(u_img.eval((st - u_dy) * u_srcSize).rgb), LUMA));
  return half4(half3(pm_color(c, yBlur, yNbr, uv, fragCoord)), 1.0);
}
`)
