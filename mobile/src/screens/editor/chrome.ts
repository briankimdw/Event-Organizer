// Editing surface colors. The app theme is respected (light = soft grey, dark = black) so the
// editor matches the rest of the app; both are neutral, since photos are judged against them.
export const EDITOR_BG = { light: '#f2f2f2', dark: '#000000' } as const
/** The same colors as 0..1 RGB (painted by the shader around the photo in the crop tool). */
export const EDITOR_BG_RGB: Record<'light' | 'dark', [number, number, number]> = { light: [0xf2 / 255, 0xf2 / 255, 0xf2 / 255], dark: [0, 0, 0] }
