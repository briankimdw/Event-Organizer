// Text input with the web's .input look, an optional label and a leading icon.
//   <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
//   <TextField icon={Search} placeholder="Search" value={q} onChangeText={setQ} clearable />
import { X, type LucideIcon } from 'lucide-react-native'
import { forwardRef, type ReactNode } from 'react'
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'

import { makeStyles, useTheme } from '@/theme'
import { Text } from './Text'

type Props = TextInputProps & {
  label?: string
  labelRight?: ReactNode
  icon?: LucideIcon
  right?: ReactNode
  clearable?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, labelRight, icon: Icon, right, clearable, containerStyle, style, value, onChangeText, ...rest },
  ref,
) {
  const s = useStyles()
  const { c, scheme } = useTheme()
  return (
    <View style={containerStyle}>
      {(label || labelRight) && (
        <View style={s.labelRow}>
          {!!label && <Text variant="small" muted>{label}</Text>}
          {labelRight}
        </View>
      )}
      <View style={s.box}>
        {Icon && <Icon size={16} color={c.muted} />}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={c.faint}
          keyboardAppearance={scheme}
          cursorColor={c.ink}
          style={[s.input, style]}
          {...rest}
        />
        {clearable && !!value && (
          <Pressable onPress={() => onChangeText?.('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear">
            <X size={14} color={c.muted} />
          </Pressable>
        )}
        {right}
      </View>
    </View>
  )
})

const useStyles = makeStyles((t) => ({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.soft, borderWidth: 1, borderColor: t.c.line,
    borderRadius: t.radius.md, paddingHorizontal: 12, minHeight: 44,
  },
  input: { flex: 1, fontSize: 15, color: t.c.ink, paddingVertical: 10 },
}))
