// A remote photo (expo-image: caching, fade-in) with the web's soft placeholder
// background while loading. With no URL: the soft background, or, given a `vertical`,
// that vertical's tint and icon (listings without photos, like the web's CoverFallback).
import { Image, type ImageContentFit } from 'expo-image'
import { View, type StyleProp, type ViewStyle } from 'react-native'

import { verticalMeta } from '@shared/verticals/index.js'
import { useTheme } from '@/theme'

import { VerticalIcon } from './VerticalIcon'

type PhotoProps = {
  uri?: string | null
  style?: StyleProp<ViewStyle>
  contentFit?: ImageContentFit
  accessibilityLabel?: string
  vertical?: string | null
}

export function Photo({ uri, style, contentFit = 'cover', accessibilityLabel, vertical }: PhotoProps) {
  const { c } = useTheme()
  if (!uri && vertical) {
    const m = verticalMeta(vertical) as { tint: string; icon: string }
    return (
      <View style={[{ backgroundColor: m.tint + '26', alignItems: 'center', justifyContent: 'center' }, style]}>
        <VerticalIcon name={m.icon} size={30} color={m.tint} />
      </View>
    )
  }
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
