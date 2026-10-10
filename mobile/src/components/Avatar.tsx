// Round profile picture. The shared avatarUrl() (lib/format.js) returns a generated
// SVG data URL for people without a photo; that's drawn natively here as an
// initials badge in the same color, since not every RN image view renders SVG data URLs.
import { View } from 'react-native'

import { useTheme } from '@/theme'
import { Photo } from './Photo'
import { Text } from './Text'

const SIZES = { sm: 28, md: 36, lg: 72, xl: 84 } as const

const initialsOf = (name = '') =>
  // Words that start with a letter or digit only: "Petal & Stem" -> "PS", not "P&".
  name.split(/\s+/).filter((w) => /^[A-Za-z0-9À-￿]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'

// Same hash as format.js avatarUrl(), so a person's color matches the web.
const hueOf = (name = '') => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

type AvatarProps = { uri?: string | null; name?: string; size?: keyof typeof SIZES | number; ring?: boolean }

export function Avatar({ uri, name = '', size = 'md', ring }: AvatarProps) {
  const { c } = useTheme()
  const px = typeof size === 'number' ? size : SIZES[size]
  const box = {
    width: px, height: px, borderRadius: px / 2, overflow: 'hidden' as const,
    ...(ring ? { borderWidth: 4, borderColor: c.bg } : null),
  }
  if (!uri || uri.startsWith('data:image/svg')) {
    return (
      <View style={[box, { backgroundColor: `hsl(${hueOf(name)}, 35%, 42%)`, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#fff', fontSize: px * 0.38, fontWeight: '600' }}>{initialsOf(name)}</Text>
      </View>
    )
  }
  return <Photo uri={uri} style={box} accessibilityLabel={name ? `${name}'s photo` : undefined} />
}
