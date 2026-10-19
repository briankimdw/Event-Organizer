// Public types of the photo editor. The recipe's shape is owned by the shared
// frontend/src/lib/editor/recipe.js (same recipe on the web and the phone).
import type { EditRecipe } from './contract'

export type { EditRecipe }

export type PhotoEditorMode = 'post' | 'reedit'

export type PhotoEditorResult = {
  /** Full-resolution JPEG with the edit applied (file:// on iOS / Android, blob: on web). */
  uri: string
  /** The non-destructive edit (store it next to the original to re-edit later). */
  recipe: EditRecipe
  width: number
  height: number
  /** The "Post as before & after" switch (always false unless allowBeforeAfter). */
  makeBeforeAfter: boolean
}

export type PhotoEditorProps = {
  /** The original photo. width / height are optional (read from the file if missing). */
  source: { uri: string; width?: number; height?: number }
  initialRecipe?: EditRecipe | null
  mode?: PhotoEditorMode
  allowBeforeAfter?: boolean
  /** Start with "Post as before & after" on. */
  initialBeforeAfter?: boolean
  onDone: (result: PhotoEditorResult) => void | Promise<void>
  onCancel: () => void
}
