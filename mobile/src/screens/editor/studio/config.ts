// Studio in the app (docs/STUDIO.md "Mobile"): where the page lives and the shared wording.
import { ENV } from '@/shims/env'

/** The Studio page (frontend/public/studio/index.html, served by the web app). '' = not set up. */
export const STUDIO_PAGE = ENV.studioUrl ? `${ENV.studioUrl}/studio/index.html` : ''
export const STUDIO_ORIGIN = ENV.studioUrl

/** Longest edge of what goes into Studio and what comes back (same as the web). */
export const STUDIO_MAX_EDGE = 2048
export const STUDIO_QUALITY = 0.9

/** Why Studio can't open in this build (null = it can). */
export function studioUnavailableReason(): string | null {
  if (!STUDIO_PAGE) return 'Studio isn’t set up in this version of the app (no Studio address). Use it on the website.'
  return null
}

/** The step name shown in the editor's summary and AI tab for a Studio result. */
export const STUDIO_STEP = 'Edited in Studio'

// Same text as the web's STUDIO_RECIPE_NOTE (frontend/src/components/studio/StudioLayer.jsx).
export const STUDIO_RECIPE_NOTE = 'Studio edits are pixel edits: saving replaces this photo’s slider edits. Your original stays safe, and Revert still works.'
