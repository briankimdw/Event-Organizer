import { Suspense, lazy } from 'react'
import { BeforeAfter as SharedBeforeAfter } from '../Media.jsx'

// Pieces owned by other parts of the app, loaded on demand (the editor is big, and the posting
// flow must keep working on its own):
//   components/editor/PhotoEditor.jsx       <PhotoEditor source initialRecipe onDone onCancel mode allowBeforeAfter />
//   api/edits.js                           saveEdit, loadOriginalUrl, revertEdit
//   lib/editor/renderWeb.js                 renders a recipe (used by "Edit all")
// import.meta.glob resolves to {} when a file doesn't exist, so a missing piece just turns
// its feature off instead of breaking the build.
const editorMods = import.meta.glob('../editor/PhotoEditor.jsx')
const editsMods = import.meta.glob('../../api/edits.js')
const renderMods = import.meta.glob('../../lib/editor/renderWeb.js')
const recipeMods = import.meta.glob('../../lib/editor/recipe.js')

const only = (mods) => Object.values(mods)[0] || null
const asDefault = (load, name) => () => load().then((m) => ({ default: m.default || m[name] }))

export const editorAvailable = !!only(editorMods)
const LazyEditor = editorAvailable ? lazy(asDefault(only(editorMods), 'PhotoEditor')) : null

export const loadEditsApi = () => (only(editsMods) ? only(editsMods)() : Promise.resolve(null))
export const loadRenderer = () => (only(renderMods) ? only(renderMods)() : Promise.resolve(null))
export const loadRecipes = () => (only(recipeMods) ? only(recipeMods)() : Promise.resolve(null))

function EditorLoading() {
  return (
    <div className="ue-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Opening the editor…</span>
    </div>
  )
}

// ---- Pixel edits (AI tools, Studio) — the handoff between the editor and the posting code ----
// PhotoEditor's onDone result: { blob, width, height, recipe, makeBeforeAfter?, pixelEdited?, pixelBase? }.
//   recipe set            -> a slider/crop edit of the original (stored in photos.edit_recipe)
//   pixelEdited (recipe null) -> the pixels changed (AI result or Studio): blob is still the public
//                            copy; pixelBase { blob, recipe } is the pixel-edited working image and the
//                            recipe on top of it, kept so the editor reopens where you left off
//   neither               -> nothing changed: back to the original
// Studio itself (components/studio/StudioLayer.jsx) can also be opened directly; its result is a
// flattened JPEG { blob, width, height, changed } to save with saveEdit(id, { recipe: null, ... }).
export const isPixelEdit = (res) => !!res?.pixelEdited
export const editKind = (res) => (!res?.blob ? 'none' : res.pixelEdited ? 'pixels' : res.recipe ? 'recipe' : 'none')

// What to open the editor with for a composer item (usePhotoItems): its pixel edit if it has one,
// else the decodable original plus its recipe.
export const editorPropsFor = (item) => (item?.pixels
  ? { source: item.pixels.blob, initialRecipe: item.pixels.recipe ?? null, pixelEdited: true }
  : { source: item?.source || item?.file, initialRecipe: item?.recipe ?? null, pixelEdited: false })

// The photo editor, full screen over the composer. props: as PhotoEditor's.
export function EditorLayer(props) {
  if (!LazyEditor) return null
  return (
    <div className="ue-layer">
      <Suspense fallback={<EditorLoading />}>
        <LazyEditor {...props} />
      </Suspense>
    </div>
  )
}

// The before/after slider (Media.jsx's BeforeAfter wraps the shared components/beforeafter one).
export function PairPreview({ before, after, alt = 'Before and after', aspect = '4 / 5' }) {
  return <SharedBeforeAfter src={after} beforeSrc={before} alt={alt} aspect={aspect} hint="once" />
}
