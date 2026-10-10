// Shows the store's toast message (useStore().toast('Saved')) above the tab bar.
// Mounted once in the root layout.
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useStore } from '@/state/store'
import { makeStyles } from '@/theme'
import { Text } from './Text'

export function ToastHost() {
  const { toastMsg } = useStore()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  if (!toastMsg) return null
  return (
    <View pointerEvents="none" style={[s.wrap, { bottom: insets.bottom + 72 }]} accessibilityLiveRegion="polite">
      <View style={s.toast}>
        <Text variant="small" center style={s.text}>{toastMsg}</Text>
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    backgroundColor: t.c.ink, paddingVertical: 12, paddingHorizontal: 14, borderRadius: t.radius.lg, alignSelf: 'stretch',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  text: { color: t.c.onInk },
}))
