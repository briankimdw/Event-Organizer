// Text with the app's type scale. Variants mirror the web's h2/h3/h4, .small, .tiny, .muted.
//   <Text variant="h3">Title</Text>  <Text variant="small" muted>Secondary</Text>
import { Text as RNText, type TextProps, type TextStyle } from 'react-native'

import { font, useTheme, type Colors } from '@/theme'

export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'small' | 'tiny' | 'label' | 'caption'

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: font.size.xxl, fontWeight: '800', letterSpacing: -0.6 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  h2: { fontSize: font.size.xl, fontWeight: '700' },
  h3: { fontSize: font.size.lg, fontWeight: '600', letterSpacing: -0.1 },
  h4: { fontSize: font.size.body, fontWeight: '600' },
  body: { fontSize: font.size.md, lineHeight: 20 },
  small: { fontSize: font.size.sm, lineHeight: 18 },
  tiny: { fontSize: font.size.tiny, lineHeight: 15 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  caption: { fontSize: 10.5, fontWeight: '600' },
}

export type AppTextProps = TextProps & {
  variant?: TextVariant
  muted?: boolean
  color?: keyof Colors | (string & {})
  weight?: TextStyle['fontWeight']
  center?: boolean
}

export function Text({ variant = 'body', muted, color, weight, center, style, ...rest }: AppTextProps) {
  const { c } = useTheme()
  const tint = color ? ((c as Record<string, string>)[color] ?? color) : muted ? c.muted : variant === 'label' ? c.muted : c.ink
  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color: tint }, weight != null && { fontWeight: weight }, center && { textAlign: 'center' }, style]}
    />
  )
}
