// Studio (miniPaint, the layers editor; docs/STUDIO.md) in a full-screen modal on iOS / Android.
// The Studio page is loaded in a WebView from EXPO_PUBLIC_STUDIO_URL; ./bridge.ts is the protocol.
// The web target uses StudioSheet.web.tsx (react-native-webview has no web support).
//
//   <StudioSheet
//     visible
//     source={{ uri }}                 a local file:// or a https:// photo; sent in as a JPEG <= 2048 px
//     name="Photo"                     layer name in Studio
//     doneLabel="Apply" | "Save"
//     note="…"                         one line under the title
//     onDone={({ uri, width, height, changed }) => …}   flattened JPEG (file:// in the cache folder);
//         may return a promise (the button shows a spinner); a throw keeps Studio open with the message
//     onCancel={() => …}
//   />
import { StatusBar } from 'expo-status-bar'
import { Check, Layers, RefreshCw, X } from 'lucide-react-native'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'

import { Text } from '@/components'
import { announce, useReduceMotion } from '@/lib/a11y'
import { ExportCollector, exportCommand, openCommands, PAGE_SCRIPT, parseMessage, type StudioMessage } from './bridge'
import { STUDIO_MAX_EDGE, STUDIO_ORIGIN, STUDIO_PAGE, STUDIO_QUALITY, studioUnavailableReason } from './config'
import { prepareForStudio, saveStudioResult } from './files'

export type StudioResult = { uri: string; width: number; height: number; changed: boolean }
export type StudioSheetProps = {
  visible: boolean
  source: { uri: string; width?: number; height?: number }
  name?: string
  doneLabel?: string
  note?: string
  onDone: (result: StudioResult) => void | Promise<void>
  onCancel: () => void
}

// Studio's own colours (tools/studio/studio-overrides.css): always dark, like the page.
const BG = '#0d0d0d'
const BAR = '#161616'
const INK = '#f3f3f3'
const MUTED = '#a8a8a8'
const LINE = '#2a2a2a'
const READY_TIMEOUT = 45000
const EXPORT_TIMEOUT = 60000

type Phase = 'loading' | 'opening' | 'ready' | 'saving' | 'error'

export function StudioSheet({ visible, ...props }: StudioSheetProps) {
  const reduceMotion = useReduceMotion()
  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={() => cancelRef.current?.()}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {visible ? <StudioBody {...props} /> : null}
    </Modal>
  )
}

// Android back / the modal's close request goes to the mounted body's cancel (with the discard check).
const cancelRef: { current: (() => void) | null } = { current: null }

function StudioBody({ source, name = 'Photo', doneLabel = 'Done', note, onDone, onCancel }: Omit<StudioSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets()
  const web = useRef<WebView>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null) // fatal (phase 'error')
  const [saveError, setSaveError] = useState<string | null>(null) // Done failed: Studio stays open
  const [dirty, setDirty] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const image = useRef<Promise<{ base64: string }> | null>(null)
  const collector = useRef<ExportCollector | null>(null)
  const exportWait = useRef<{ resolve: (r: { base64: string; width: number; height: number; changed: boolean }) => void; reject: (e: Error) => void } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const phaseRef = useRef<Phase>('loading')
  useLayoutEffect(() => {
    phaseRef.current = phase
  })

  const fail = useCallback((message: string) => {
    if (!alive.current) return
    setPhase('error')
    setError(message)
    announce(message)
  }, [])
  // A load error only counts before the photo is open: once the user is editing, never drop their work.
  const loadFailed = useCallback((message: string) => {
    if (phaseRef.current === 'loading' || phaseRef.current === 'opening') fail(message)
  }, [fail])

  // Prepare the photo while the page loads (both are needed before it can open).
  useEffect(() => {
    const reason = studioUnavailableReason()
    if (reason) return fail(reason)
    image.current ??= prepareForStudio(source)
    image.current.catch((e) => fail(e?.message || 'Couldn’t prepare the photo for Studio.'))
  }, [source, fail])

  // Page didn't say "ready" in time (tunnel / server down, very slow network).
  useEffect(() => {
    if (phase !== 'loading') return
    const t = setTimeout(() => fail('Studio took too long to start. Check your connection and try again.'), READY_TIMEOUT)
    return () => clearTimeout(t)
  }, [phase, attempt, fail])

  const sendImage = useCallback(async () => {
    try {
      const { base64 } = await image.current!
      if (!alive.current) return
      setPhase('opening')
      for (const js of openCommands(base64, name)) web.current?.injectJavaScript(js)
    } catch {
      /* fail() already ran from the prepare effect */
    }
  }, [name])

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const m: StudioMessage | null = parseMessage(e.nativeEvent.data)
    if (!m) return
    switch (m.type) {
      case 'ready':
        sendImage()
        break
      case 'opened':
        setPhase('ready')
        setDirty(false)
        announce('Studio is open. The photo is ready to edit.')
        break
      case 'change':
        setDirty(m.dirty)
        break
      case 'escape':
        cancelRef.current?.()
        break
      case 'export-begin':
      case 'export-part':
      case 'export-end': {
        const c = collector.current
        if (!c) break
        try {
          const done = c.add(m)
          if (done) {
            collector.current = null
            exportWait.current?.resolve(done)
          }
        } catch (err: any) {
          collector.current = null
          exportWait.current?.reject(err)
        }
        break
      }
      case 'error':
        if (m.stage === 'export') {
          collector.current = null
          exportWait.current?.reject(new Error(m.message || 'Couldn’t export the image.'))
        } else if (m.stage === 'open') {
          fail(m.message || 'Couldn’t open this photo in Studio.')
        } else {
          fail('Studio couldn’t start. Check your connection and try again.')
        }
        break
    }
  }, [sendImage, fail])

  const exportImage = useCallback(() => new Promise<{ base64: string; width: number; height: number; changed: boolean }>((resolve, reject) => {
    const id = `x${Date.now().toString(36)}`
    collector.current = new ExportCollector(id)
    const timer = setTimeout(() => {
      collector.current = null
      exportWait.current = null
      reject(new Error('Studio didn’t send the image back. Try again.'))
    }, EXPORT_TIMEOUT)
    exportWait.current = {
      resolve: (r) => { clearTimeout(timer); exportWait.current = null; resolve(r) },
      reject: (err) => { clearTimeout(timer); exportWait.current = null; reject(err) },
    }
    web.current?.injectJavaScript(exportCommand(id, STUDIO_MAX_EDGE, STUDIO_QUALITY))
  }), [])

  const done = useCallback(async () => {
    if (phase !== 'ready') return
    setPhase('saving')
    setSaveError(null)
    announce('Saving')
    try {
      const out = await exportImage()
      const uri = out.changed ? saveStudioResult(out.base64) : ''
      await onDone({ uri, width: out.width, height: out.height, changed: out.changed })
      if (alive.current) setPhase('ready')
    } catch (e: any) {
      if (!alive.current) return
      const msg = e?.message || 'Couldn’t save. Try again.'
      setSaveError(msg)
      setPhase('ready')
      announce(msg)
    }
  }, [phase, exportImage, onDone])

  const cancel = useCallback(() => {
    if (phase === 'saving') return
    if (!dirty || phase !== 'ready') return onCancel()
    Alert.alert('Discard your Studio edits?', 'Layers, brush strokes and text you added in Studio will be lost. The photo stays as it was.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard edits', style: 'destructive', onPress: onCancel },
    ])
  }, [phase, dirty, onCancel])
  useEffect(() => {
    cancelRef.current = cancel
    return () => { if (cancelRef.current === cancel) cancelRef.current = null }
  }, [cancel])

  const retry = useCallback(() => {
    setError(null)
    setSaveError(null)
    setDirty(false)
    image.current = prepareForStudio(source)
    image.current.catch((e) => fail(e?.message || 'Couldn’t prepare the photo for Studio.'))
    setPhase('loading')
    setAttempt((n) => n + 1) // remounts the WebView
  }, [source, fail])

  // Keep the WebView on the Studio page: links elsewhere open in the browser; miniPaint's own
  // "Save as" (a blob: / data: download) would navigate away and lose the work, so it's blocked.
  const onNavigate = useCallback((req: { url: string; isTopFrame?: boolean }) => {
    const url = req.url || ''
    if (req.isTopFrame === false) return true
    if (url === 'about:blank' || url.startsWith(STUDIO_PAGE)) return true
    if (/^(blob|data):/i.test(url)) return false
    if (/^https?:/i.test(url) && !url.startsWith(`${STUDIO_ORIGIN}/studio/`)) Linking.openURL(url).catch(() => {})
    return false
  }, [])

  const busy = phase === 'saving'
  const canDone = phase === 'ready'
  const loading = phase === 'loading' || phase === 'opening'

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={s.top}>
        <Pressable onPress={cancel} disabled={busy} hitSlop={8} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Cancel and close Studio" accessibilityState={{ disabled: busy }}>
          <X size={24} color={busy ? MUTED : INK} />
        </Pressable>
        <View style={s.head}>
          <View style={s.titleRow} accessible accessibilityRole="header">
            <Layers size={15} color={INK} />
            <Text weight="700" style={{ color: INK }}>Studio</Text>
          </View>
          {note ? <Text variant="tiny" numberOfLines={2} style={{ color: MUTED, textAlign: 'center' }}>{note}</Text> : null}
        </View>
        <Pressable
          onPress={done}
          disabled={!canDone}
          style={({ pressed }) => [s.done, (!canDone && !busy) && { opacity: 0.4 }, (pressed || busy) && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Saving' : doneLabel}
          accessibilityHint="Flattens your Studio layers into the photo"
          accessibilityState={{ disabled: !canDone, busy }}
        >
          {busy ? <ActivityIndicator size="small" color={BG} /> : <Check size={16} color={BG} />}
          <Text weight="700" style={{ color: BG }}>{busy ? 'Saving…' : doneLabel}</Text>
        </Pressable>
      </View>

      <View style={s.body}>
        {phase !== 'error' ? (
          <WebView
            key={attempt}
            ref={web}
            source={{ uri: STUDIO_PAGE }}
            style={s.web}
            containerStyle={{ backgroundColor: BG }}
            injectedJavaScript={PAGE_SCRIPT}
            onMessage={onMessage}
            onError={() => loadFailed('Studio couldn’t load. Check your connection and try again.')}
            onHttpError={(e) => loadFailed(`Studio couldn’t load (error ${e.nativeEvent.statusCode}). The Studio server may be down. Try again later.`)}
            onContentProcessDidTerminate={() => fail('Studio stopped (the phone ran low on memory). Try again.')}
            onRenderProcessGone={() => fail('Studio stopped (the phone ran low on memory). Try again.')}
            onShouldStartLoadWithRequest={onNavigate}
            originWhitelist={['https://*', 'http://*', 'about:*']}
            // The text tool focuses a hidden textarea from a tap on the canvas: allow the keyboard.
            keyboardDisplayRequiresUserAction={false}
            bounces={false}
            overScrollMode="never"
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
            webviewDebuggingEnabled={__DEV__}
            accessibilityLabel="Studio image editor"
          />
        ) : null}
        {loading ? (
          <View style={[StyleSheet.absoluteFill, s.state]} accessible accessibilityRole="progressbar" accessibilityLabel={phase === 'opening' ? 'Opening the photo in Studio' : 'Opening Studio'} accessibilityLiveRegion="polite">
            <ActivityIndicator color={MUTED} size="large" />
            <Text variant="small" weight="600" style={{ color: MUTED, marginTop: 12 }}>{phase === 'opening' ? 'Opening the photo…' : 'Opening Studio…'}</Text>
          </View>
        ) : null}
        {phase === 'error' ? (
          <View style={[StyleSheet.absoluteFill, s.state]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Text center style={{ color: INK, marginBottom: 16, maxWidth: 320 }}>{error}</Text>
            <View style={s.row}>
              <Pressable onPress={onCancel} style={s.btn} accessibilityRole="button" accessibilityLabel="Close Studio">
                <Text weight="600" style={{ color: INK }}>Close</Text>
              </Pressable>
              {studioUnavailableReason() ? null : (
                <Pressable onPress={retry} style={[s.btn, s.btnSolid]} accessibilityRole="button" accessibilityLabel="Try again" accessibilityHint="Loads Studio again">
                  <RefreshCw size={15} color={BG} />
                  <Text weight="600" style={{ color: BG }}>Try again</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}
      </View>

      {saveError ? (
        <View style={s.saveError} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text variant="small" style={{ color: '#ffb4ab', flex: 1 }}>{saveError}</Text>
          <Pressable onPress={() => setSaveError(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss the error">
            <X size={16} color={MUTED} />
          </Pressable>
        </View>
      ) : null}
      <View style={{ height: insets.bottom, backgroundColor: BG }} />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, minHeight: 52, backgroundColor: BAR, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  head: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 80, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: INK, justifyContent: 'center' },
  body: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  state: { alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BG },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: LINE },
  btnSolid: { backgroundColor: INK, borderColor: INK },
  saveError: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: BAR },
})

export default StudioSheet
