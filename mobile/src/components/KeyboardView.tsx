// A flex container that keeps its bottom edge above the on-screen keyboard, on
// both platforms, without react-native-keyboard-controller (not in Expo Go).
//   <KeyboardView style={{ flex: 1 }}>
//     <FlatList ... />
//     <Composer />          // stays right above the keyboard
//   </KeyboardView>
//
// How: when the keyboard shows we know its top edge (endCoordinates.screenY). The
// view measures its own bottom edge in the window and pads itself by the overlap.
// If the OS already resized the window (Android adjustResize without edge-to-edge),
// the overlap is 0 and nothing is added, so it never double-pads. Padding a view
// doesn't change its own frame, so the measurement stays stable.
// `bottomInset`: extra space to keep when the keyboard is hidden (e.g. the home
// indicator, from useSafeAreaInsets().bottom); dropped while the keyboard is up.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native'

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; bottomInset?: number }

export function KeyboardView({ children, style, bottomInset = 0 }: Props) {
  const ref = useRef<View>(null)
  const [kbTop, setKbTop] = useState<number | null>(null)
  const [bottom, setBottom] = useState<number | null>(null)

  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _w, h) => {
      if (h > 0) setBottom(y + h)
    })
  }, [])

  useEffect(() => {
    const ios = Platform.OS === 'ios'
    const animate = (e?: KeyboardEvent) => {
      if (ios && e?.duration) {
        LayoutAnimation.configureNext({ duration: e.duration, update: { type: LayoutAnimation.Types.keyboard ?? 'keyboard' } })
      }
    }
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      animate(e)
      setKbTop(e.endCoordinates.screenY)
      measure()
    })
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      animate(e)
      setKbTop(null)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [measure])

  const overlap = kbTop != null && bottom != null ? Math.max(0, bottom - kbTop) : 0
  const pad = kbTop != null ? overlap : bottomInset
  return (
    <View ref={ref} onLayout={measure} style={[{ flex: 1 }, style, { paddingBottom: pad }]}>
      {children}
    </View>
  )
}
