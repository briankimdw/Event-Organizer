// A remote photo (expo-image: caching, fade-in) with the web's soft placeholder
// background while loading or when there's no URL.
import { Image, type ImageContentFit } from 'expo-image'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { useTheme } from '@/theme'

type PhotoProps = {
  uri?: string | null
  style?: StyleProp<ViewStyle>
  contentFit?: ImageContentFit
  accessibilityLabel?: string
}

export function Photo({ uri, style, contentFit = 'cover', accessibilityLabel }: PhotoProps) {
  const { c } = useTheme()
  if (!uri) return <View style={[{ backgroundColor: c.soft }, style]} />
  return (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: c.soft }, style as any]}
      contentFit={contentFit}
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
    />
  )
}
