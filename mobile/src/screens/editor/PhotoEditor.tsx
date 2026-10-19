// The photo editor (public API; mobile-upload imports this file).
//
//   import { PhotoEditor, PhotoEditorModal } from '@/screens/editor/PhotoEditor'
//
//   <PhotoEditorModal
//     visible={!!editing}
//     source={{ uri, width, height }}        // a local file:// (picker) or https:// original
//     initialRecipe={recipe | null}          // re-edit: the saved recipe; null = fresh
//     mode="post" | "reedit"                 // only changes the Done label ("Next" / "Save")
//     allowBeforeAfter                       // shows the "Post as before & after" switch
//     onDone={({ uri, recipe, width, height, makeBeforeAfter }) => ...}
//     onCancel={() => ...}
//   />
//
// `<PhotoEditor .../>` is the same thing without the Modal (fills its parent; use it in a
// full-screen route). onDone gets a full-resolution JPEG (file:// in the cache folder on
// iOS / Android, a blob: URL on the web target) with the recipe already applied, its pixel
// size, and the recipe itself (non-destructive: keep the original + recipe to re-edit).
// onDone may return a promise: the Done button shows a spinner until it settles.
//
// Rendering is Skia (@shopify/react-native-skia, included in Expo Go). Its modules are only
// loaded through the dynamic import below, after loadSkia(), because on the web target
// CanvasKit has to be downloaded first.
import { Component, lazy, Suspense, type ReactNode } from 'react'
import { ActivityIndicator, Modal, Platform, Pressable, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { Text } from '@/components'
import { useTheme } from '@/theme'
import { EDITOR_BG } from './chrome'
import { loadSkia } from './skia'
import type { PhotoEditorProps } from './types'

export type { EditRecipe, PhotoEditorProps, PhotoEditorResult, PhotoEditorMode } from './types'

const EditorScreen = lazy(() => loadSkia().then(() => import('./EditorScreen')))

export function PhotoEditor(props: PhotoEditorProps) {
  const t = useTheme()
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: EDITOR_BG[t.scheme] }}>
      <SkiaBoundary onCancel={props.onCancel}>
        <Suspense fallback={<Center><ActivityIndicator color={t.c.muted} /></Center>}>
          <EditorScreen {...props} />
        </Suspense>
      </SkiaBoundary>
    </GestureHandlerRootView>
  )
}

/** PhotoEditor in a full-screen Modal (no route needed). */
export function PhotoEditorModal({ visible, ...props }: PhotoEditorProps & { visible: boolean }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={props.onCancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {visible ? <PhotoEditor {...props} /> : null}
    </Modal>
  )
}

export default PhotoEditor

function Center({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</View>
}

// If Skia (or CanvasKit on the web) can't load, or the editor throws while rendering, say so
// (with a way out) instead of a blank screen or a crash of the screen underneath.
class SkiaBoundary extends Component<{ children: ReactNode; onCancel: () => void }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: any) {
    return { error: String(e?.message || e || 'Unknown error') }
  }
  componentDidCatch(e: unknown) {
    console.warn('[editor]', e)
  }
  render() {
    if (!this.state.error) return this.props.children
    return <EditorFailed message={this.state.error} onCancel={this.props.onCancel} />
  }
}

function EditorFailed({ message, onCancel }: { message: string; onCancel: () => void }) {
  const t = useTheme()
  return (
    <Center>
      <Text variant="h3" center>The editor couldn’t start</Text>
      <Text muted center style={{ marginTop: 8 }}>{Platform.OS === 'web' ? 'The graphics engine didn’t load. Check the connection and try again.' : message}</Text>
      <Pressable onPress={onCancel} accessibilityRole="button" style={{ marginTop: 20, padding: 12 }}>
        <Text weight="600" style={{ color: t.c.ink }}>Close</Text>
      </Pressable>
    </Center>
  )
}
