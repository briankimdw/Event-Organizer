# Photo editor

The in-app editor is **non-destructive**. The untouched original always stays in the private bucket
`portfolio-originals` (`photos.original_path`). The public copy (`display_path`, at most 2048 px on the
long edge, with no metadata) is rendered from the original with an **edit recipe**. The recipe is
stored in `photos.edit_recipe` (`null` means unedited), so the owner can re-edit or revert later.

| File | What it does | Shared with mobile |
|---|---|---|
| `frontend/src/lib/editor/recipe.js` | The recipe format, `normalize`, presets, `describe` | yes (plain JS) |
| `frontend/src/lib/editor/geometry.js` | Crop, rotate, straighten and flip as 3×3 matrices; crop fitting | yes (plain JS) |
| `frontend/src/lib/editor/colorMath.js` | Colour pipeline: math, CPU reference, GLSL and SkSL source, `uniformsFor` | yes (plain JS) |
| `frontend/src/lib/editor/renderWeb.js` | WebGL 1 preview renderer (Canvas2D fallback) and JPEG export | web only (DOM) |
| `frontend/src/api/edits.js` | Load the original, save an edit, revert | yes (plain JS) |
| `frontend/src/components/editor/` | `PhotoEditor.jsx` (the UI), `CropOverlay.jsx`, `useRecipeHistory.js`, `editor.css` | web |
| `supabase/migrations/20261020000000_photo_edits.sql` | `photos.edit_recipe`, its check, grants, stale-analysis trigger | |
| `supabase/tests/photo_edits_test.sql` | 13 checks (rolls back) | |

Tests: `node --test frontend/src/lib/editor/tests/*.test.js` (31 tests: recipe, geometry and colour math).

## The recipe (v1)

```js
{
  v: 1,
  crop: { x, y, w, h },     // 0..1 of the ORIENTED frame (after rotate + flip), axis-aligned
  aspect: 'original' | 'free' | '1:1' | '4:5' | '5:4' | '3:2' | '2:3' | '16:9' | '9:16',
  rotate: 0 | 90 | 180 | 270,   // clockwise quarter turns of the source
  straighten: -45..45,          // degrees, positive = picture turns clockwise, under the crop
  flipH: false,                 // left-right mirror, applied AFTER rotate
  adjust: {                     // integers
    exposure, contrast, highlights, shadows, whites, blacks,   // -100..100 (exposure ±100 = ±2 EV)
    temperature, tint, vibrance, saturation,                   // -100..100
    clarity /* -100..100 */, sharpen /* 0..100 */, vignette /* -100..100 */, grain /* 0..100 */, fade /* 0..100 */
  },
  filter: { id, strength /* 0..100 */ } | null,   // a preset ("look")
}
```

- **What gets rendered:** `effectiveAdjust(r)` = `adjust + preset.adjust × strength/100`, clamped.
  The look sits under the user's sliders. The sliders show the user's own values, and a dot on each
  track shows what the look adds there. "Fine-tune this look in the sliders" (`bakeFilter`) moves the
  look into the slider values.
- **Presets (11):** Vivid, Golden, Portra, Airy, Coastal, Editorial, Moody, Dusk, Expired, Mono and
  Mono Matte (`PRESETS`, also exported as `presets`). Each is a plain set of `adjust` values, so a
  look can be read and edited.
- **Storing:** `toStorable(r)` returns the compact form: zero sliders and the default crop are left
  out, and an identity recipe becomes `null`. That is what goes in the database (about 100–400
  bytes). `normalize(anything)` turns any input back into a full recipe and never throws: it accepts
  null, partial objects, JSON text, out-of-range numbers and unknown keys. It is also where future
  versions get migrated (`migrate()`).
- **Other helpers:** `defaultRecipe()`, `isIdentity(r)`, `sameRecipe(a, b)`, `hasCrop`, `hasGeometry`,
  `hasColor`, `describe(r)` (e.g. `"Portra 60% · Warm · +0.3 EV · cropped 4:5"`),
  `formatAdjust(key, v)` (e.g. `"+0.30 EV"`, `"−12"`), `ADJUSTMENTS` (slider metadata: key, label,
  group, min, max), `ASPECTS` and `aspectRatio(aspect, frameW, frameH)`.

## Geometry (`geometry.js`)

There are three coordinate spaces, all with y pointing down:

- **source:** the upright photo (EXIF orientation applied), normalized as `(s, t)`.
- **oriented frame O:** `flipH(rotate(source))`, of size `W' × H'` (the two sides swap at 90° and 270°).
- **output:** the crop, normalized as `(u, v)`.

The steps from an output pixel to the source are:

1. Take the point under the output pixel: `P = crop.xy + (u, v)·crop.wh`.
2. Undo the straighten turn around O's centre C: `Q = C + R(−θ)(P·[W', H'] − C)`.
3. Undo the flip, then the rotation.

`geometryMatrix(recipe, srcW, srcH, { crop? })` composes these steps into **one affine 3×3 matrix**
(row-major) that maps output uv to source st. `mat3.toColumnMajor` converts it for GL and Skia.

- **Output size:** `outputSize(recipe, srcW, srcH)` gives the edit's size in source pixels;
  `fitEdge(w, h, max)` scales it down.
- **Crop validity:** a valid crop lies inside the frame and inside the turned picture, so it never
  has empty corners. `fitScale` and `isValidCrop` check this; `fitCrop` shrinks a crop about its
  centre until it fits.
- **Aspect presets:** `cropForAspect(aspect, W', H', θ)` gives the largest centred crop of that shape.
- **Dragging:** `moveCrop` and `resizeCrop(crop, handle, dx, dy, ratio, …)` apply a drag as far as it
  can go while the crop stays valid (a binary search in `constrain`). The aspect ratio is kept unless
  it is free.
- **Buttons:**
  - `rotateRecipe` is the Rotate button: it always turns the view clockwise, also when the photo is
    flipped. The crop turns with the picture and the aspect swaps (4:5 becomes 5:4).
  - `flipRecipe` is the Flip button: it mirrors the crop and negates the straighten angle.
- **While straightening:** the editor remembers the crop from before the gesture and fits that crop
  to each new angle. Going back to the old angle restores it.

## Colour pipeline (`colorMath.js`)

The pipeline below is applied per pixel. `c` is the source pixel, sRGB-encoded. LUMA is the Rec.709
weighting `(0.2126, 0.7152, 0.0722)`. The full formulas are in the header comment of `colorMath.js`.

1. **Linearize** with the exact sRGB curve.
2. **White balance and exposure, in linear light:** `lin *= u_wb · 2^EV`.
   - The white-balance gains are `2^(±0.6T ± 0.2G)`, normalized to keep luminance.
   - EV is `exposure / 50`.
3. **Back to sRGB.** When brightening, a soft highlight shoulder above 0.75 keeps highlights from
   clipping hard.
4. **Tone, on luma, applied as an additive shift so colours don't change:**
   - Blacks and whites set the black and white points (`u_black`, `u_white`).
   - Shadows and highlights are smooth bumps that peak at 1/3 and 2/3. Their strength is
     sign-dependent, which keeps the curve monotonic (this is tested).
5. **Local contrast**, from the source luma `Ys`:
   - Clarity uses a blurred copy (`Ys − Yblur`, with a radius of about 1.5% of the long edge),
     weighted toward the midtones.
   - Sharpen uses the 4 neighbours one output pixel away (`Ys − Ynbr`).
6. **Contrast**, per channel: an S-curve around 0.5 above zero, a linear flatten below zero.
7. **Saturation and vibrance** around the luma. Vibrance is weighted by `1 − current saturation`.
8. **Fade:** `e·(1 − 0.14f) + 0.10f`, which lifts blacks to 0.10 and lowers whites to 0.96.
9. **Vignette:** an elliptical mask from the output uv. Negative values darken the corners, positive
   values lighten them.
10. **Grain:** monochrome value noise on a grid of `u_grainCell` output pixels, strongest in the midtones.
11. **Clamp** to 0..1.

Three implementations must agree:

- **`applyToPixel(rgb, u, ctx)`**, the CPU reference. It is used by the tests and by the Canvas2D fallback.
- **`FRAGMENT_SHADER`**, GLSL ES 1.00 for WebGL 1.
- **`SKSL_SHADER`**, for Skia.

Both shaders are built from the same `COLOR_FUNCTIONS` string, which stays in the GLSL/SkSL common
subset: float literals only, no loops, no arrays, no texture calls. `uniformsFor(effectiveAdjust(r),
{ width, height })` gives the uniform values (`u_wb`, `u_exposure`, …) for both shaders and for the
CPU code.

**Verified in headless Chrome:** WebGL and the CPU reference differ by a mean of about 0.5/255 for
every slider group, the geometry and all 11 presets. The largest single difference is 2–8, or 20
with grain because the noise hash is sensitive to float precision.

## Rendering on the web (`renderWeb.js`)

- **`loadWorkingImage(source, { maxEdge = 2048 })`:** decodes a File, Blob or URL upright. It rejects
  files over 50 MB (`MAX_FILE_BYTES`) and returns a downscaled copy for the preview, as
  `{ canvas, width, height, fullWidth, fullHeight, blob }`.
- **`createRenderer(canvas)`:** returns a renderer whose `kind` is `'webgl'`, or `'canvas2d'` when
  WebGL is not available.
  - `setImage(canvas)` also builds the blurred copy used for clarity.
  - `render(recipe, { width, height, mode })` draws one of three modes:
    - `'final'`: the edit.
    - `'crop'`: the whole straightened frame, with the empty area painted dark.
    - `'original'`: the untouched photo, for compare.
  - `renderAspect(recipe, mode, w, h)` gives the output ratio, so the canvas can be sized before rendering.
- **`exportEdit(source, recipe, { maxEdge = DISPLAY_EDGE (2048), quality = 0.86 })`:** returns
  `{ blob, width, height }` as a JPEG. Re-encoding strips all metadata, the same as `makeDisplayCopy`.
  - Only as much of the original is decoded as the output needs.
  - Exports are capped at `MAX_EXPORT_EDGE` (4096).
  - If WebGL fails, the export falls back to the CPU.
  - `DISPLAY_EDGE` must match `MAX_EDGE` in `lib/images.js`.
- **Measured:** a 24 MP (6000 × 4000) JPEG opens in about 0.4 s. Exporting it takes about 0.4 s at
  2048 px and about 0.9 s at 4096 px. These numbers are from headless Chrome with software
  WebGL (SwiftShader); a real GPU is faster.

## The editor UI

```jsx
<PhotoEditor
  source={File | Blob | url}
  initialRecipe={recipe | null}
  onDone={({ blob, recipe, width, height, makeBeforeAfter }) => …}
  onCancel={() => …}
  mode="post" | "new" | "reedit"   // "reedit" labels the button Save
  allowBeforeAfter                  // shows "Post as before & after"
/>
```

Render the editor inside the phone frame: it fills its nearest positioned ancestor. `Upload.jsx`
portals it into `#phone` through `components/upload/editorBridge.jsx`.

- **What `onDone` receives:**
  - `blob`: a 2048 px JPEG display copy.
  - `recipe`: the compact form, or `null` when nothing changed. A `blob` is still returned in that case.
  - `makeBeforeAfter: true`: only when the box is ticked and there is an actual edit.
  - `pixelEdited: true` + `pixelBase { blob, recipe }`: after an AI tool or **Studio** changed the
    pixels; `recipe` is then `null`. Reopen with `pixelEdited` (prop) on `pixelBase`
    (`editorBridge.jsx` `editorPropsFor`).
- **Studio** (the chip under the preview): opens the current render in the layers editor
  (docs/STUDIO.md); its result becomes the new working base and the sliders restart from zero.

**Layout** (dark, like Lightroom mobile and VSCO):

- **Top bar:** Cancel, Undo, Redo, and Done (labelled Save in re-edit mode).
- **Preview:** a big preview. Hold the photo, or the `\` key, to see the original. A Compare toggle
  does the same.
- **Status line:** the `describe()` summary and Reset all.
- **Tool panel and bottom tabs:**
  - **Presets:** live thumbnails of each look on the current crop and sliders, a strength slider, and
    "fine-tune in sliders".
  - **Light, Color and Effects:** the sliders.
  - **Crop:** aspect chips (Original, Free, Square, 4:5, 3:2, 16:9, plus an orientation swap), a
    straighten slider, Rotate, Flip and Reset. The crop box has rule-of-thirds lines and 44 px
    handles; drag inside it to move it.

**Sliders** are real `<input type=range>` elements with labels and an `aria-valuetext` (for example
"+0.30 EV"). The fill grows from zero. To reset a slider, double-tap or double-click it, or press its
value button ("Reset Contrast").

**Undo and redo:** a burst of changes, such as one slider drag, becomes a single step. Shortcuts are
Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y).

**Accessibility:**

- The editor is a modal dialog (`useDialog`): focus is trapped and Escape cancels. If there are
  edits, Escape first asks "Discard your edits?".
- The tabs are a tablist with arrow-key navigation. Looks and aspects are radiogroups with roving
  focus.
- The crop box can be focused: arrow keys move it, Shift + arrows resize it, Alt makes the steps finer.
- A polite live region announces Undo, Rotated and Showing the original.
- `prefers-reduced-motion` is respected.
- axe reports 0 violations on every tab and on the discard sheet.

**Performance:** the preview is a working copy of at most 2048 px. Each frame is a single GPU pass
at screen resolution, and the preset thumbnails render from a 200 px copy.

## Persistence

### Migration (`20261020000000_photo_edits.sql`)

- **New column:** `photos.edit_recipe jsonb`.
- **Shape check:** `public.edit_recipe_ok()` accepts only:
  - an object with a numeric `v` and only the known keys;
  - adjustments that are numbers in −100..100;
  - correct types for crop, filter, aspect, rotate, straighten and flipH;
  - at most 4 KB.
- **Grants:** `insert (edit_recipe)` and `update (edit_recipe)` for `authenticated`. `display_path`,
  `width` and `height` were already updatable by owners, and the AI-check columns stay off-limits.
- **Trigger `photos_display_changed`:** when `display_path` changes, it deletes the photo's SigLIP
  embedding, so the ML worker analyses the new copy, and clears `phash`.
- **Re-runnable:** yes.
- **Tested offline in PGlite:**
  - the migration runs twice cleanly;
  - `photo_edits_test.sql` passes 13 of 13 checks;
  - 600 random recipes produced by the client all pass the DB check.
- **Not applied to the hosted DB yet.** Until it is, the app detects the missing column
  (`editRecipeSupported()`) and saves edits without the recipe.

### API (`frontend/src/api/edits.js`)

```js
editRecipeSupported()                                -> Promise<boolean>
getEditablePhoto(photoId)                            -> { id, albumId, ownerId, originalPath, displayPath, width, height, pairRole, recipe }
loadOriginalUrl(photo | photoId, { expiresIn = 3600 }) -> signed URL (throws err.code === 'no_original')
loadEditSource(photo | photoId)                      -> { url, recipe, fromOriginal, photo }   // open the editor with this
saveEdit(photoId, { recipe, blob, width?, height? }) -> { id, displayPath, src, width, height, recipe }
revertEdit(photoId, { blob?, width?, height? })      -> same; on web it renders the plain copy itself
```

`saveEdit`:

1. Uploads the new copy to `portfolio/{uid}/{albumId}/{uuid}.jpg`, so the new path also busts caches.
2. Updates the row (`display_path`, `width`, `height` and, when the column exists, `edit_recipe`).
3. Removes the old copy, but only if it is in the owner's folder.

If any step fails, the new file is removed again. A photo with no original (old demo data) is edited
from its public copy; its recipe is saved as `null`, because a recipe only makes sense relative to
the original.

## How mobile reuses this

`mobile-editor` builds the native editor with `@shopify/react-native-skia`:

- **Imports:** `recipe.js`, `geometry.js` and `colorMath.js` come through the Metro shared-code
  bridge, and so does `api/edits.js` (it uses only `supabase` and plain JS).
- **Shader:** `Skia.RuntimeEffect.Make(SKSL_SHADER)`. Its uniforms are
  `uniformsFor(effectiveAdjust(r), { width, height })` plus the ones the shader adds:
  - `u_geo`: `mat3.toColumnMajor(geometryMatrix(...))`, 9 numbers.
  - `u_dx` and `u_dy`: the matrix's linear part ÷ the output size, as `renderWeb.js` computes them.
  - `u_outSize`, `u_srcSize`, `u_bg`, `u_showBg` and `u_bypass`.
- **Child shaders:**
  - `u_img`: the image shader, with clamp tiling and linear filtering.
  - `u_blur`: a heavily blurred copy of the same image, about 1.5% of the long edge (for example a
    128 px downscale with a blur), given a local matrix so it shares `u_img`'s pixel coordinates.
- **Colour space:** draw into an sRGB, non-linear surface so `eval()` returns sRGB-encoded values.
- **Not verified on a device:** `SKSL_SHADER` was checked only for portable syntax. mobile-editor owns
  compiling and checking it on a phone; `applyToPixel` is the reference to compare against.
- **Saving:** pass an `ArrayBuffer` or `Uint8Array` as `blob` to `saveEdit` and `revertEdit`, with
  explicit `width` and `height` (there is no `createImageBitmap` on React Native). `crypto.randomUUID`
  falls back to `Math.random` on Hermes.

## AI tab and auto-enhance

| File | What it does | Shared with mobile |
|---|---|---|
| `frontend/src/lib/editor/auto.js` | Auto-enhance: pixels in, slider values out (`autoEnhance`, `applyAuto`, `describeAuto`) | yes (plain JS) |
| `frontend/src/api/ai.js` | Client for the ML service's AI tools (contract: `docs/AI_TOOLS.md`) | yes (plain JS) |
| `frontend/src/components/editor/ai/` | `AiPanel.jsx` (the tab), `MaskPainter.jsx` (erase brush / area), `aiImage.js` (canvas helpers) | web |

Tests: `node --test frontend/src/lib/editor/tests/auto.test.js` (synthetic photos: well exposed, −2 EV,
+1.3 EV, warm / blue / green casts, B&W, transparency, crop region).

**Auto-enhance** (`auto.js`, also the **Auto** chip at the top of Light): give it a ~256 px RGBA copy
(`AUTO_SAMPLE_EDGE`) and optionally the crop's region; it returns integer values for exposure,
contrast, highlights, shadows, whites, blacks, temperature, tint and vibrance. `applyAuto` sets only
those sliders (clarity, effects, the look and the crop stay). It measures through `applyToPixel`, so
its numbers mean what the renderer does. Conservative by design:
- White balance from "grey pixels" (pixels whose local contrast is equal in R, G and B are neutral
  surfaces whatever the light); no neutral surface found → no correction; half strength in low-key
  scenes; capped at ±35 temperature / ±20 tint; B&W photos get none.
- Exposure only when the median luma is outside 0.40–0.55; brightening goes 70% of the way (max +1 EV)
  and stops before the brightest 0.5% passes 0.97, so lights stay lights (shadows are lifted instead).
- Highlights / shadows / whites / blacks / contrast / vibrance only when the histogram calls for it
  (never saturation); a final simulated render scales things back if clipping got worse.

**AI tools** (`api/ai.js`): `aiCapabilities({ force })` never throws and returns
`{ ok, error?, tools: { removeBackground, erase, upscale: { available, reason, maxInputEdge, scales? } }, limits }`;
`removeBackground(image, { output, signal })`, `eraseObject(image, mask, { signal })` and
`upscale(image, scale, { signal })` resolve to `{ blob, width, height, downscaled, ms }` and throw an
`AiError` whose `code` is `not_configured | signed_out | offline | timeout | cancelled | too_large |
unavailable | busy | rate_limited | bad_input | server` and whose `message` can be shown as is.
The base URL is `VITE_ML_URL` (else port 8000 on the page's host); the token is the Supabase session's
(refreshed and retried once on 401). `configureAi({ url, accessToken })` overrides both.

**How AI results fit the non-destructive model:**
- AI tools work on the upright, **uncropped** working photo (≤ 2048 px; the AI tab shows the whole
  photo while painting a mask or previewing a cut-out). Each result becomes the editor's new
  **working base**; the recipe (crop, sliders, look) keeps applying on top, so nothing is reset.
- The base is a stack: "Undo AI edit" / "Remove all" in the AI tab. Compare shows the real original.
- `onDone` returns `recipe: null` and `pixelEdited: true` (see above): a recipe can't reproduce the
  result alone. The private original is never touched, so Revert still returns to it, and "Post as
  before & after" uses the original as the before and the AI edit as the after.
- Remove background: preview on a checkerboard, then a colour, a blurred copy of the photo, or a
  transparent PNG download (posts are JPEGs, so transparent can't be posted).
- Erase: brush (size 1–12% of the photo, undo strokes, clear) or, for keyboard and screen-reader
  users, an **area** box (arrows move it, Shift + arrows resize, Enter adds it). Repeatable.
- Upscale ×2 / ×4 with the output size shown; disabled with the reason when the photo is over the
  service's 1024 px input limit (it is then already enough for a 2048 px post).
