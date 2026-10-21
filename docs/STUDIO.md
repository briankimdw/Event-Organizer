# Studio: the Photoshop-style editor

Studio is a full-screen editor with layers, brushes, clone, selections, text, shapes and effects.
It sits next to the non-destructive photo editor (docs/EDITOR.md). Studio works on pixels: what it
returns is a flattened JPEG. A slider recipe can't describe that, so a photo edited in Studio is
saved with `edit_recipe = null`. The original stays in the private bucket, so "Original" (revert)
still works.

## Decision (2026-10-19)

**Chosen: miniPaint v4.14.3** (MIT), rebuilt from its pinned source **without AlertifyJS**, in a
same-origin iframe.

| Candidate | Licence (checked in the upstream LICENSE file) | Maintained | What it can do | Fit |
|---|---|---|---|---|
| **miniPaint** (viliusle/miniPaint) | **MIT** (`MIT-LICENSE.txt`: "Copyright (c) ViliusL"). **But** its prebuilt `dist/bundle.js` contains **AlertifyJS 1.14.0, which is GPL-3.0** (AlertifyJS `LICENSE` = GNU GPL v3, also at tag 1.13.1; the bundle has a "Licensed under GPL 3" header). | Yes: v4.14.3 released 2026-04-20; 3.5k stars | Layers, brush, pencil, eraser, **clone**, blur/sharpen/desaturate brushes, magic eraser, fill, gradient, **selections**, **text**, 20+ **shapes**, crop, resize, rotate, 50+ effects and filters, undo (50 steps). Touch events, mobile layout. | **Chosen.** The only candidate that is really Photoshop-like. We don't ship the GPL part (see Build). |
| Filerobot Image Editor (scaleflex) | MIT (`LICENSE`: "Copyright (c) 2022 scaleflex") | Yes, but `latest` is `5.0.0-beta.159`, which needs **React ≥ 19** (we use 18). The last stable 4.x is 4.9.1. | Crop, fine-tune, filters, annotate (pen, text, shapes), watermark, resize | No layers, clone or selections, and it pulls in styled-components and Konva. An option later for a "markup" mode. |
| TOAST UI Image Editor (nhn) | MIT (`LICENSE`: "Copyright (c) 2019 NHN Cloud Corp.") | **No**: last release 3.15.3 on 2022-04-25; the React wrapper needs React 17 | Draw, shapes, text, icons, mask, filters (Fabric 4) | Not maintained, and it has no layers or clone. |

**Not available anywhere:** a "heal" or content-aware tool. miniPaint has **clone** (Alt/Ctrl-click
to set the source), and the in-app editor's AI tab has "erase objects" (docs/AI_TOOLS.md).

**Why an iframe:** miniPaint is a jQuery app with global CSS, `window.*` singletons and
document-level key handlers. The iframe keeps all of that out of the React app. It is same-origin,
so the bridge is plain JS calls (no postMessage protocol), and it loads only when Studio opens.

## Files

| Path | What |
|---|---|
| `tools/studio/build.mjs` | Builds `frontend/public/studio/` (see Build) |
| `tools/studio/package.json`, `package-lock.json` | Pinned build-only dependencies (installed in a temp folder, never in the repo) |
| `tools/studio/webpack.config.cjs` | Bundles upstream `src/` (unmodified) + our bridge; swaps AlertifyJS for the shim; writes `bundled-packages.json` |
| `tools/studio/entry.js` | **The bridge** (inside the iframe): config tweaks, then upstream `main.js`, then `window.studioBridge` |
| `tools/studio/alertify-shim.{js,css}` | MIT replacement for AlertifyJS notices (live region) |
| `tools/studio/studio-overrides.css` | Our dark theme and colours over miniPaint's CSS variables, wordmark, focus ring |
| `frontend/public/studio/index.html` | Our iframe page (layout markup adapted from miniPaint's, MIT) |
| `frontend/public/studio/minipaint.js` (+ `.LICENSE.txt`, `bundled-packages.json`, `VERSION.json`, `MINIPAINT-LICENSE.txt`, `images/`, `src/js/libs/gifjs/gif.worker.js`) | Build output. **Generated: don't edit by hand.** |
| `frontend/src/components/studio/Studio.jsx`, `studio.css` | The React wrapper (dialog, Cancel/Done, loading, discard guard) |
| `frontend/src/components/studio/StudioLayer.jsx` | The lazy, portalled entry point the app imports |

## Build

```
node tools/studio/build.mjs            # [--work <dir>] [--keep]
```

1. Downloads miniPaint at commit `a79733eb803fc97084ef0ee4faa96b031e69e1c0` (tag v4.14.3) and checks
   its SHA-256. If the hash doesn't match, it stops. Review the new code before you update the pin.
2. Stages upstream `src/` (unmodified) and our bridge in a temp folder.
3. Runs `npm ci --ignore-scripts` with `tools/studio/package-lock.json`, so no install scripts run.
   hermite-resize is no longer on npm, so it comes from a pinned GitHub tarball. **AlertifyJS is
   not in the manifest at all.**
4. Runs webpack. It fails if the bundle contains AlertifyJS or GPL text, or if any bundled package
   has a licence other than MIT, ISC, BSD or Apache-2.0.
5. Copies the output into `frontend/public/studio/`.

To update miniPaint: change `MINIPAINT` in `build.mjs` (commit + sha256). Re-check its
`package.json` for new dependencies and their licences, rebuild, and update THIRD_PARTY_NOTICES.md.

**What the bridge changes (runtime config only, no upstream file is edited):**

- dark theme only, our colours, and white as the starting brush colour;
- the Pixabay image search tool and menu entries are removed, and the "External" links, "Report
  Issues" and "Open Test Template" are gone;
- Google Fonts are off: the text tool offers only system fonts, and the font-list API key is blanked;
- Escape closes an open miniPaint popup first; otherwise it asks the host to cancel.

Upstream's own Pixabay and Google Fonts API keys are **not** shipped: `tools/studio/strip-keys-loader.js` blanks them in `config.js` while bundling, and the build fails if a key string, an `AIza…` key or a `key=<value>` URL is found in the output.

## Opening Studio (the API)

```jsx
import { StudioLayer, STUDIO_RECIPE_NOTE } from '../studio/StudioLayer.jsx'

<StudioLayer
  source={File | Blob | url}   // a URL must be same-origin or CORS-enabled; prefer a Blob
  name="photo.jpg"
  onDone={async ({ blob, width, height, changed }) => …}  // flattened JPEG, long edge ≤ maxEdge (2048)
  onCancel={() => …}
  doneLabel="Done" | "Save" | "Apply"
  note="…"                   // one line under the title
  maxEdge={2048} quality={0.9}
/>
```

- **Where it renders:** in `document.body`, `position: fixed`, over the whole window. On a phone
  that is the screen, and on desktop it covers the phone frame, because a layers editor needs room.
- **While `onDone` runs,** Studio shows "Saving…". If `onDone` throws, Studio stays open and shows
  the message, so a failed save loses nothing. `changed` is false when nothing was edited.
- **Bundle:** `StudioLayer.jsx` is tiny. `Studio.jsx` is its own chunk (about 4 KB). The 1 MB
  `minipaint.js` loads only inside the iframe.

**Inside the iframe**, `window.studioBridge` offers:

- `ready` (a Promise);
- `open(blobOrUrl, { name })`, which returns `{ width, height }` and starts the undo history fresh;
- `exportImage({ type, quality, maxEdge, background })`, which returns `{ blob, width, height }`
  and flattens every visible layer onto a white background;
- `isDirty()`;
- the callbacks `onChange(dirty)` and `onEscape()`.

## Where Studio is used

### 1. From the photo editor ("Studio" chip, under the preview)

`PhotoEditor.jsx` renders the **current edit** (the base plus crop and sliders) at 2048 px and opens
Studio with it. When you press **Apply**:

- the result is pushed onto the editor's pixel-base stack (`applyBase`, shared with the AI tab);
- the sliders reset to zero, because the render already has them;
- the editor's AI "undo" for that step brings the old base *and* the old sliders back.

**Done** then returns:

```js
{ blob, width, height, recipe: null, pixelEdited: true, pixelBase: { blob, recipe }, makeBeforeAfter? }
```

`pixelBase` is the Studio or AI image plus the recipe on top of it.

**Posting** (`components/upload/editorBridge.jsx`, the documented handoff):

- `usePhotoItems.setEdit` keeps `pixelBase` as `item.pixels`.
- `editorPropsFor(item)` reopens the editor with `source = item.pixels.blob`,
  `initialRecipe = item.pixels.recipe` and `pixelEdited`. With `pixelEdited`, Done keeps returning
  `recipe: null`.
- The post uploads the private original as usual, with `edit_recipe = null` and the edited render
  as its public copy.
- "Edit all" applies a look on top of `item.pixels`. "Back to original" (`clearEdit`) drops it.
- Before & after still uses the untouched original as the "before".
- Helpers: `isPixelEdit(res)` and `editKind(res)` return `'none' | 'recipe' | 'pixels'`.

### 2. From "Edit photos" on a posted photo (ManagePost)

Each photo has a **Studio** button. It opens the public copy, which is what clients see, so it
already includes any slider edits. **Save** calls `saveEdit(photoId, { recipe: null, blob, width,
height })`.

- The header note and a line in the sheet say that this replaces the slider edits, and that **Edit**
  starts again from the original.
- **Original** (revert) is now shown for every photo that has an original. A pixel edit has no
  recipe to flag it as edited, so the button can't depend on one.

## Accessibility

**Our wrapper:**

- It is a modal dialog (`useDialog`): focus moves in, and Tab is trapped. A sentinel after the iframe
  sends focus that tabs out of the iframe back to the top bar.
- Escape cancels. It works from our top bar, and from inside the iframe when no miniPaint popup or
  menu is open.
- If you have unsaved changes, cancelling asks first ("Discard your Studio edits?", an
  `alertdialog`), and closing the tab shows the browser's leave warning.
- The buttons are labelled. Loading, error and saving states are announced in live regions.
- When Studio closes, focus returns to the button that opened it.
- **axe:** 0 violations on the open dialog and on the discard dialog (the iframe is excluded from
  that run; see below).

**miniPaint itself (inside the iframe) is only partly accessible. This is upstream's, not ours:**

- Painting on the canvas needs a pointer.
- Many tool buttons and colour widgets have no accessible name, and some contrast is low.
- Its popups are not modal dialogs: they don't trap focus, and Escape only closes them because of
  our bridge.
- The menus do support the keyboard (arrow keys, Escape).
- An axe run on the iframe document (2026-10-20) found:
  - `aria-required-parent`, `aria-required-children` and `listitem` on the menu bar (critical/serious);
  - `label` on 8 inputs, such as the zoom range and the layer X/Y fields (critical);
  - `aria-input-field-name` on its custom range (serious).

  Our iframe page lets you pinch-zoom; upstream's viewport meta blocked zooming.

Keyboard users can still move through the menus and tool buttons with Tab, apply effects from the
menus, and press Done or Cancel.

## Mobile (Expo app)

The phone loads the same page, `${EXPO_PUBLIC_STUDIO_URL}/studio/index.html`, in a full-screen
`react-native-webview` (included in Expo Go for SDK 57). `EXPO_PUBLIC_STUDIO_URL` is the deployed web
app's origin in production. When it's empty, the Studio buttons are dimmed and say why.

| Path | What |
|---|---|
| `mobile/src/screens/editor/studio/bridge.ts` | The app ↔ page protocol (pure, no imports) |
| `mobile/src/screens/editor/studio/StudioSheet.tsx` | The modal: WebView, Cancel/Done, loading/error/retry, discard check |
| `mobile/src/screens/editor/studio/StudioSheet.web.tsx` | Expo web target: says "Studio is available on the website" (no WebView there) |
| `mobile/src/screens/editor/studio/files.ts` | Photo → base64 JPEG ≤ 2048 px (expo-image-manipulator); result → cache file |
| `mobile/src/screens/editor/studio/config.ts` | Page URL, size, shared wording |

**Bridge.** There is no shared JS realm, so `window.studioBridge` is driven by messages:

- **Startup.** The WebView's `injectedJavaScript` (`PAGE_SCRIPT`) installs `window.__pmStudio`. It waits
  for `studioBridge.ready`, then posts `{ source: 'pm-studio', type: 'ready' }`. It also forwards
  `onChange` as `change` and `onEscape` as `escape`.
- **Opening.** The app sends the image with `injectJavaScript`: `begin(n)`, then `n` ×
  `part(i, "<base64>")` of at most 256 K characters each, then `open(name)`. The page joins the parts
  into a `data:` URL, calls `studioBridge.open`, and posts `opened { width, height }` (or
  `error { stage: 'open' }`).
- **Done.** `exportImage({ id, maxEdge: 2048, quality: 0.9 })` flattens the image to a JPEG and reads it
  as base64. The page posts it back as `export-begin { n, width, height, changed, length }`, then
  `n` × `export-part`, then `export-end`. The app checks the length, writes a `studio-*.jpg` cache
  file and returns `{ uri, width, height, changed }`.
- **Why chunks.** No single `evaluateJavaScript` call or `postMessage` carries megabytes. A
  2048 px photo is about 0.4–2 MB of base64, so 2–8 parts.

**Where it's used:**

- **The photo editor** has a **Studio** pill next to the summary. It opens the current render (the base
  plus crop and sliders, ≤ 2048 px). **Apply** pushes the result onto the AI tab's pixel-base stack
  (`ai.applyStudio`), and the sliders restart from zero. That is one history step, so **Undo** brings
  back the old photo and the old sliders together. "Remove Studio edits" (or "AI & Studio edits")
  restores the sliders from before Studio. Done returns `recipe: null, pixelEdited: true`, the same
  as after an AI step. `aiEdits` contains `"Edited in Studio"`.
- **Posted photos** (My work → a post → **Studio**) open the public copy. **Save** calls
  `saveEdit(id, { recipe: null, … })` (`postApi.saveStudioEdit`), with `STUDIO_RECIPE_NOTE` in the
  header and a line under the tools. **Revert** now shows for every photo that has an original,
  like on the web.

**Safety and behaviour:**

- The WebView stays on the Studio page. Other http(s) links open in the browser.
- miniPaint's own File → Save (a `blob:`/`data:` download) is blocked, because it would navigate away
  and lose the work. Use Done instead.
- A load error after the photo is open is ignored, so it never drops work.
- `keyboardDisplayRequiresUserAction={false}` lets the text tool's hidden textarea raise the keyboard.

**Tests.** `bridge.ts` is plain enough for `node` to import directly. A headless-Chrome run loads the
Studio page and checks the following with the exact injected strings:

- ready;
- a 4-part open, and the size it reports;
- dirty tracking from a brush stroke;
- export at 2048 and 1024, with the base64 decoded and its JPEG SOF size checked;
- incomplete-transfer and empty-open errors.

## Limitations

- **Output size.** The longest edge is 2048 px. Studio works on the display-size render, not on the
  full-resolution original.
- **No heal or content-aware tool.** Clone is the closest tool Studio has; for real object
  removal, use AI "erase objects".
- **Studio edits replace the slider recipe.** To change the sliders again after a Studio save, edit
  in Studio again, or revert and start over from the original.
- **Revert shows on every photo.** "Original" now appears on photos that were never edited too.
  There it re-renders the same copy, so it does no harm.
- **Layers are not kept.** Studio's layers exist only while Studio is open; what gets saved is the
  flattened image. You can use miniPaint's File → Save As → JSON to keep a project file.
- **Mobile accessibility.** Our modal is labelled, the discard question is a native alert, and
  motion follows Reduce Motion. miniPaint's UI inside the WebView has the same gaps as on the web
  (see Accessibility). VoiceOver can reach the menus and buttons, but painting needs a finger.
- **miniPaint's own UI** is desktop-first. On phones it uses its mobile layout, with drawer toggles
  for the tools and the layers. It works with touch, but it is tight at 390 px.
- **Cookies.** miniPaint stores its settings in same-origin cookies (theme, toggles, language).
- **Mobile runs the same page in a WebView** (see Mobile below), so it needs the web app's origin
  (`EXPO_PUBLIC_STUDIO_URL`) and a connection.
- **Undoing a Studio step.** In the photo editor, a Studio result is undone through the AI tab's
  step list (the pixel-base stack), not through the top-bar Undo, which only covers the sliders.
