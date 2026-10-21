// Public types of the photo editor. The recipe's shape is owned by the shared
// frontend/src/lib/editor/recipe.js (same recipe on the web and the phone).
import type { EditRecipe } from './contract'

export type { EditRecipe }

export type PhotoEditorMode = 'post' | 'reedit'

export type PhotoEditorResult = {
  /** Full-resolution JPEG with the edit applied (file:// on iOS / Android, blob: on web). */
  uri: string
  /**
   * The non-destructive edit (store it next to the original to re-edit later). null when an AI
   * tool was used: a recipe can't describe that result, so the edit is baked into `uri`.
   */
  recipe: EditRecipe | null
  width: number
  height: number
  /** The "Post as before & after" switch (always false unless allowBeforeAfter). */
  makeBeforeAfter: boolean
  /** AI / Studio steps baked into `uri` ("Background removed", "Erased", "Upscaled 2×", "Edited in Studio"); [] when none. */
  aiEdits: string[]
  /**
   * The pixels changed (an AI tool or Studio, or the editor was opened with pixelEdited): recipe is null.
   * pixelBase is the pixel-edited working photo + the recipe on top of it, to reopen the editor
   * where the user left off (<PhotoEditor source={pixelBase} initialRecipe={pixelBase.recipe} pixelEdited />).
   */
  pixelEdited: boolean
  pixelBase: { uri: string; width: number; height: number; recipe: EditRecipe } | null
}

export type PhotoEditorProps = {
  /** The original photo. width / height are optional (read from the file if missing). */
  source: { uri: string; width?: number; height?: number }
  initialRecipe?: EditRecipe | null
  mode?: PhotoEditorMode
  allowBeforeAfter?: boolean
  /** Start with "Post as before & after" on. */
  initialBeforeAfter?: boolean
  /** `source` is an earlier pixel edit (a result's pixelBase), not the original: the result keeps recipe null. */
  pixelEdited?: boolean
  onDone: (result: PhotoEditorResult) => void | Promise<void>
  onCancel: () => void
}
