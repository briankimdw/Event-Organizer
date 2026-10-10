// Design tokens, mirroring the web app's CSS variables (frontend/src/styles.css :root).
// Light values are the web's; dark values are the native app's own (the web has no
// dark mode yet). Use them through useTheme() / makeStyles(), never hard-coded hex.
import { useMemo } from 'react'
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native'

const light = {
  bg: '#ffffff', // --bg
  ink: '#111111', // --ink (primary text, primary button background)
  onInk: '#ffffff', // text on an ink-colored surface
  muted: '#6b6b6b', // --muted (secondary text)
  faint: '#9a9a9a', // inactive tab labels
  line: '#ececec', // --line (borders, dividers)
  soft: '#f5f5f4', // --soft (chips, inputs, placeholders)
  card: '#ffffff', // card surfaces
  accent: '#ff5a36', // --accent
  accentSoft: '#fff0eb', // --accent-soft
  onAccent: '#ffffff',
  ok: '#16a34a', // --ok
  warn: '#b45309',
  danger: '#dc2626', // --danger
  dangerSoft: '#fef2f2', // --danger-soft
  pro: '#7c3aed', // --pro (Verified Pro badge)
  id: '#2563eb', // --id (ID verified badge)
  star: '#f59e0b', // --star
  backdrop: 'rgba(0,0,0,0.4)', // sheet backdrop
  overlay: 'rgba(0,0,0,0.55)', // badges on photos
}

export type Colors = typeof light

const dark: Colors = {
  bg: '#0b0b0c',
  ink: '#f4f4f5',
  onInk: '#111111',
  muted: '#a1a1aa',
  faint: '#71717a',
  line: '#27272a',
  soft: '#18181b',
  card: '#121214',
  accent: '#ff6a4a',
  accentSoft: '#3b1a12',
  onAccent: '#ffffff',
  ok: '#22c55e',
  warn: '#f59e0b',
  danger: '#f87171',
  dangerSoft: '#3a1414',
  pro: '#8b5cf6',
  id: '#60a5fa',
  star: '#fbbf24',
  backdrop: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.6)',
}

// --radius is 14px; the rest are the radii the web CSS uses repeatedly.
export const radius = { sm: 10, md: 12, lg: 14, xl: 18, sheet: 22, pill: 999 } as const

// The web's spacing steps (.mt-xs 4, .gap-xs 8, .pad 16, .mt-lg 24).
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

// Font: the web uses Inter, falling back to the system UI font. The app uses the
// platform system font (SF / Roboto) for now; load Inter with expo-font later if wanted.
export const font = {
  size: { tiny: 11.5, xs: 12.5, sm: 13, md: 14, body: 15, lg: 17, xl: 20, xxl: 24, hero: 40 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' } as Record<string, TextStyle['fontWeight']>,
}

export const theme = { light, dark }

export type Theme = { scheme: 'light' | 'dark'; c: Colors; radius: typeof radius; space: typeof space; font: typeof font }

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  return useMemo(() => ({ scheme, c: theme[scheme], radius, space, font }), [scheme])
}

// Theme-aware StyleSheets:
//   const useStyles = makeStyles((t) => ({ box: { backgroundColor: t.c.soft } }))
//   function Thing() { const s = useStyles(); return <View style={s.box} /> }
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T) {
  const cache: Partial<Record<'light' | 'dark', T>> = {}
  return function useStyles(): T {
    const t = useTheme()
    return (cache[t.scheme] ??= StyleSheet.create(factory(t)))
  }
}
