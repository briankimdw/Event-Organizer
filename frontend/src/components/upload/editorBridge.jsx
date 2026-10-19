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
