// Design tokens, mirroring the web app's CSS variables (frontend/src/styles.css :root).
// Light values are the web's; dark values are the native app's own (the web has no
// dark mode yet). Use them through useTheme() / makeStyles(), never hard-coded hex.
//
// Light / dark is the user's choice (Settings > Appearance), not the phone's:
// preference 'light' (default, the web's black-and-white look) | 'dark' | 'system',
// saved in AsyncStorage under THEME_KEY. <AppThemeProvider> (root layout) holds it;
// useThemePreference() reads / changes it; useTheme() / makeStyles() follow it.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SystemUI from 'expo-system-ui'
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Appearance, StyleSheet, useColorScheme, type TextStyle } from 'react-native'

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

export type Scheme = 'light' | 'dark'
export type ThemePreference = Scheme | 'system'
export const THEME_KEY = 'pm:theme'
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'light'

const isPreference = (v: unknown): v is ThemePreference => v === 'light' || v === 'dark' || v === 'system'

const themes: Record<Scheme, Theme> = {
  light: { scheme: 'light', c: light, radius, space, font },
  dark: { scheme: 'dark', c: dark, radius, space, font },
}

type ThemeState = {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  scheme: Scheme // what's on screen
  ready: boolean // the saved preference has been read
}

const ThemeContext = createContext<ThemeState | null>(null)

// Native chrome (keyboard, alerts, date pickers, Apple Maps) follows the chosen scheme too.
// 'unspecified' hands it back to the OS. No-op where unsupported (web).
function applyNativeAppearance(pref: ThemePreference) {
  try {
    if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref)
  } catch {}
}

// Started at import so it's usually done before the first render.
let saved: ThemePreference | null = null
const loading: Promise<ThemePreference> = AsyncStorage.getItem(THEME_KEY)
  .then((v) => (saved = isPreference(v) ? v : DEFAULT_THEME_PREFERENCE))
  .catch(() => (saved = DEFAULT_THEME_PREFERENCE))

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(saved ?? DEFAULT_THEME_PREFERENCE)
  const [ready, setReady] = useState(saved != null)
  const system = useColorScheme()

  useEffect(() => {
    if (ready) return
    let done = false
    const finish = (p: ThemePreference) => {
      if (done) return
      done = true
      setPref(p)
      setReady(true)
    }
    loading.then(finish)
    const timer = setTimeout(() => finish(DEFAULT_THEME_PREFERENCE), 1000) // never hold the app on storage
    return () => clearTimeout(timer)
  }, [ready])

  // While the override is on, useColorScheme() reports it; with 'system' it's the OS value.
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference

  useEffect(() => {
    applyNativeAppearance(preference)
  }, [preference])

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(themes[scheme].c.bg).catch(() => {})
  }, [scheme])

  const setPreference = useCallback((p: ThemePreference) => {
    saved = p
    setPref(p)
    AsyncStorage.setItem(THEME_KEY, p).catch(() => {})
  }, [])

  const value = useMemo(() => ({ preference, setPreference, scheme, ready }), [preference, setPreference, scheme, ready])
  return createElement(ThemeContext.Provider, { value }, children)
}

// The preference and its setter (Settings > Appearance).
export function useThemePreference(): ThemeState {
  return (
    useContext(ThemeContext) ?? { preference: DEFAULT_THEME_PREFERENCE, setPreference: () => {}, scheme: 'light', ready: true }
  )
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext)
  return themes[ctx?.scheme ?? 'light']
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
