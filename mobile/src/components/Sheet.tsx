// Bottom sheet (the web's components/Sheet.jsx), built on Modal: slides up over a
// dimmed backdrop; tap the backdrop or the X to close. Content scrolls if tall.
//   <Sheet open={open} onClose={() => setOpen(false)} title="Filters">...</Sheet>
import { X } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { makeStyles, useTheme } from '@/theme'
import { Text } from './Text'

type SheetProps = { open: boolean; onClose: () => void; title?: string; children: ReactNode; scroll?: boolean }

export function Sheet({ open, onClose, title, children, scroll = true }: SheetProps) {
  const s = useStyles()
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.handle} />
          <View style={s.head}>
            <Text variant="h3" style={s.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={s.close}>
              <X size={22} color={c.ink} />
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          ) : (
            <View style={s.body}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.backdrop },
  sheet: { maxHeight: '85%', backgroundColor: t.c.bg, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet },
  handle: { width: 40, height: 5, borderRadius: 999, backgroundColor: t.c.line, alignSelf: 'center', marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 4, paddingLeft: 20, paddingRight: 12 },
  title: { flex: 1 },
  close: { padding: 4 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
}))
