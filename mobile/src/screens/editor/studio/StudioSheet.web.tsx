// Web target twin of StudioSheet.tsx: react-native-webview doesn't run on the web, and the Expo
// web build isn't a product target (the real website has Studio itself). Same props; it only says
// where Studio is. Keeps react-native-webview out of the web bundle.
import { Layers } from 'lucide-react-native'
import { Modal, Pressable, StyleSheet, View } from 'react-native'

import { Text } from '@/components'
import { useReduceMotion } from '@/lib/a11y'

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

export function StudioSheet({ visible, onCancel }: StudioSheetProps) {
  const reduceMotion = useReduceMotion()
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.card} accessibilityRole="alert" aria-modal accessibilityLabel="Studio is available on the website">
          <Layers size={22} color="#f3f3f3" />
          <Text weight="700" style={s.title}>Studio is available on the website</Text>
          <Text variant="small" style={s.text}>
            Layers, brushes, clone, text and shapes open in the iPhone and Android apps, and on the photomatch website.
          </Text>
          <Pressable onPress={onCancel} style={s.btn} accessibilityRole="button" accessibilityLabel="Close">
            <Text weight="600" style={{ color: '#0d0d0d' }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { maxWidth: 360, width: '100%', backgroundColor: '#161616', borderRadius: 16, padding: 20, alignItems: 'center', gap: 10 },
  title: { color: '#f3f3f3', textAlign: 'center' },
  text: { color: '#a8a8a8', textAlign: 'center' },
  btn: { marginTop: 6, height: 40, paddingHorizontal: 24, borderRadius: 20, backgroundColor: '#f3f3f3', alignItems: 'center', justifyContent: 'center' },
})

export default StudioSheet
