// Building blocks for the sign-in / sign-up / welcome / new-password screens (the native
// counterparts of frontend/src/components/auth/*): big buttons, labelled fields with a
// focus ring, a password field with a live strength meter, one-time-code boxes, messages.
import { Check, Eye, EyeOff, type LucideIcon } from 'lucide-react-native'
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { CODE_LENGTH, passwordRules, passwordStrength } from '@shared/components/auth/authKit.js'
import { Text } from '@/components'
import { announce, TOGGLE_ROLE } from '@/lib/a11y'
import { makeStyles, useTheme } from '@/theme'

// ---------------------------------------------------------------- buttons

type AuthButtonProps = {
  title: string
  onPress?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  icon?: LucideIcon
  left?: ReactNode
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityHint?: string
}

export function AuthButton({ title, onPress, variant = 'primary', icon: Icon, left, disabled, loading, style, accessibilityHint }: AuthButtonProps) {
  const s = useStyles()
  const { c } = useTheme()
  const fg = variant === 'primary' ? c.onInk : c.ink
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={({ pressed }) => [s.btn, s[variant], disabled && s.disabled, pressed && !loading && s.pressed, style]}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {loading ? <ActivityIndicator size="small" color={fg} /> : left ?? (Icon ? <Icon size={18} color={fg} /> : null)}
      </View>
      <Text variant="body" weight="600" style={[s.btnText, { color: fg }]} numberOfLines={2} maxFontSizeMultiplier={1.6}>
        {title}
      </Text>
    </Pressable>
  )
}

// An inline text button ("Change", "Forgot password?", "Resend code"). hitSlop makes it 44pt tall.
export function TextLink({ title, onPress, disabled, size = 'small', accessibilityLabel }: { title: string; onPress: () => void; disabled?: boolean; size?: 'small' | 'body'; accessibilityLabel?: string }) {
  const s = useStyles()
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}>
      <Text variant={size} weight="700" style={[s.link, disabled && s.disabled]}>{title}</Text>
    </Pressable>
  )
}

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </Svg>
  )
}

// ---------------------------------------------------------------- fields

type FieldProps = TextInputProps & {
  label: string
  labelRight?: ReactNode
  prefix?: string
  right?: ReactNode
  invalid?: boolean
  below?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}

// A labelled input: 52pt tall, focus ring, red border when invalid.
export const AuthField = forwardRef<TextInput, FieldProps>(function AuthField(
  { label, labelRight, prefix, right, invalid, below, containerStyle, style, onFocus, onBlur, ...rest },
  ref,
) {
  const s = useStyles()
  const { c, scheme } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <View style={[s.field, containerStyle]}>
      <View style={s.labelRow}>
        <Text variant="small" weight="600" importantForAccessibility="no" accessibilityElementsHidden>{label}</Text>
        {labelRight}
      </View>
      <View style={[s.box, focused && s.boxFocused, invalid && s.boxInvalid]}>
        {!!prefix && <Text style={s.prefix} importantForAccessibility="no" accessibilityElementsHidden>{prefix}</Text>}
        <TextInput
          ref={ref}
          placeholderTextColor={c.faint}
          keyboardAppearance={scheme}
          cursorColor={c.ink}
          selectionColor={c.id}
          maxFontSizeMultiplier={2}
          accessibilityLabel={label}
          onFocus={(e) => { setFocused(true); onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); onBlur?.(e) }}
          style={[s.input, style]}
          {...rest}
        />
        {right}
      </View>
      {below}
    </View>
  )
})

type PasswordProps = Omit<FieldProps, 'secureTextEntry' | 'right' | 'below'> & {
  show: boolean
  onToggleShow?: () => void
  meter?: boolean
  toggle?: boolean
}

export const PasswordField = forwardRef<TextInput, PasswordProps>(function PasswordField({ show, onToggleShow, meter, toggle = true, value = '', ...rest }, ref) {
  const s = useStyles()
  const { c } = useTheme()
  const eye = toggle ? (
    <Pressable onPress={onToggleShow} hitSlop={8} style={s.eye} accessibilityRole={TOGGLE_ROLE} accessibilityLabel="Show password" accessibilityState={{ checked: show }}>
      {show ? <EyeOff size={20} color={c.muted} /> : <Eye size={20} color={c.muted} />}
    </Pressable>
  ) : undefined
  return (
    <AuthField
      ref={ref}
      value={value}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      right={eye}
      below={meter ? <StrengthMeter password={value} /> : undefined}
      {...rest}
    />
  )
})

function StrengthMeter({ password }: { password: string }) {
  const s = useStyles()
  const { c } = useTheme()
  const { score, label } = passwordStrength(password)
  const tint = score <= 1 ? c.danger : score === 2 ? c.warn : c.ok
  const rules = passwordRules(password)
  return (
    <View style={s.meterWrap}>
      <View style={s.meterRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={s.meterBars}>
          {[1, 2, 3, 4].map((n) => <View key={n} style={[s.meterBar, score >= n && { backgroundColor: tint }]} />)}
        </View>
        <Text variant="tiny" weight="600" style={[s.meterLabel, { color: score ? tint : c.muted }]}>{label}</Text>
      </View>
      {rules.map((r) => (
        <View key={r.id} style={s.rule} accessible accessibilityLabel={`${r.label}${r.required ? '' : ', recommended'}: ${r.ok ? 'done' : 'not yet'}`}>
          <View style={[s.ruleDot, r.ok && { backgroundColor: c.ok, borderColor: c.ok }]}>
            {r.ok && <Check size={11} strokeWidth={3} color={c.bg} />}
          </View>
          <Text variant="small" style={{ color: r.ok ? c.ok : c.muted, flexShrink: 1 }}>
            {r.label}
            {!r.required && <Text variant="small" muted> (recommended)</Text>}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- one-time code

// Six boxes drawn over ONE real input (autofill "one-time-code", paste, screen readers see a
// single field). Typing fills the next box; onComplete fires when the last digit lands.
export function CodeInput({ value, onChange, onComplete, invalid, autoFocus, label }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; invalid?: boolean; autoFocus?: boolean; label: string
}) {
  const s = useStyles()
  const { c, scheme } = useTheme()
  const ref = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const set = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(v)
    if (v.length === CODE_LENGTH && v !== value) onComplete?.(v)
  }
  // After a wrong code the boxes are cleared: put the cursor back.
  useEffect(() => {
    if (!value && invalid) ref.current?.focus()
  }, [value, invalid])
  const active = Math.min(value.length, CODE_LENGTH - 1)
  return (
    <View style={s.otp}>
      <View style={s.otpBoxes} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <View key={i} style={[s.otpBox, !!value[i] && s.otpFilled, invalid && s.boxInvalid, focused && i === active && s.boxFocused]}>
            <Text style={s.otpDigit} maxFontSizeMultiplier={1.4}>{value[i] ?? ''}</Text>
            {focused && i === value.length && <View style={[s.caret, { backgroundColor: c.ink }]} />}
          </View>
        ))}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={set}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        caretHidden
        keyboardAppearance={scheme}
        accessibilityLabel={label}
        accessibilityHint={value ? `${value.length} of ${CODE_LENGTH} digits entered` : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={s.otpInput}
      />
    </View>
  )
}

// ---------------------------------------------------------------- messages & bits

// Errors are spoken when they appear (accessibilityRole "alert" alone isn't announced on iOS).
export function AuthMessage({ children, tone = 'error' }: { children: string; tone?: 'error' | 'notice' }) {
  const s = useStyles()
  useEffect(() => {
    if (children) announce(children)
  }, [children])
  return (
    <View style={[s.msg, tone === 'error' ? s.msgError : s.msgNotice]} accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
      <Text variant="small" color={tone === 'error' ? 'danger' : 'ink'}>{children}</Text>
    </View>
  )
}

export function Badge({ icon: Icon, tone = 'accent' }: { icon: LucideIcon; tone?: 'accent' | 'ok' }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={[s.badge, tone === 'ok' && s.badgeOk]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Icon size={26} color={tone === 'ok' ? c.ok : c.accentInk} />
    </View>
  )
}

export function Legal() {
  return (
    <Text variant="tiny" muted center style={{ marginTop: 28 }}>
      By continuing, you agree to our <Text variant="tiny" weight="600">Terms of Service</Text> and <Text variant="tiny" weight="600">Privacy Policy</Text>.
    </Text>
  )
}

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object

const useStyles = makeStyles((t) => ({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52,
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: t.radius.lg, alignSelf: 'stretch',
  },
  btnText: { fontSize: 16, flexShrink: 1, textAlign: 'center' },
  primary: { backgroundColor: t.c.ink },
  outline: { backgroundColor: t.scheme === 'dark' ? t.c.card : '#ffffff', borderWidth: 1, borderColor: t.scheme === 'dark' ? '#3f3f46' : '#c7c7c7' },
  ghost: { backgroundColor: t.c.soft },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  link: { textDecorationLine: 'underline', color: t.c.ink },

  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 22 },
  box: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, paddingLeft: 14, paddingRight: 4,
    borderRadius: t.radius.lg, backgroundColor: t.c.soft, borderWidth: 1, borderColor: t.scheme === 'dark' ? '#3f3f46' : '#dedede',
  },
  boxFocused: { borderColor: t.scheme === 'dark' ? t.c.id : '#1d4ed8', borderWidth: 2, backgroundColor: t.c.bg },
  boxInvalid: { borderColor: t.c.danger },
  prefix: { fontSize: 16, color: t.c.muted },
  // The box draws the focus ring; no second browser outline on the web target.
  input: { flex: 1, minWidth: 0, fontSize: 16, color: t.c.ink, paddingVertical: 13, paddingRight: 10, ...NO_OUTLINE },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },

  meterWrap: { gap: 7, marginTop: 4 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meterBars: { flex: 1, flexDirection: 'row', gap: 4 },
  meterBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.c.line },
  meterLabel: { minWidth: 64, textAlign: 'right' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: t.scheme === 'dark' ? '#71717a' : '#8f8f8f',
    alignItems: 'center', justifyContent: 'center',
  },

  otp: { position: 'relative' },
  otpBoxes: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1, height: 58, borderRadius: t.radius.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.c.soft, borderWidth: 1, borderColor: t.scheme === 'dark' ? '#3f3f46' : '#dedede',
  },
  otpFilled: { backgroundColor: t.c.bg, borderColor: t.scheme === 'dark' ? '#71717a' : '#8f8f8f' },
  otpDigit: { fontSize: 24, fontWeight: '700', color: t.c.ink, fontVariant: ['tabular-nums'] },
  caret: { position: 'absolute', width: 2, height: 26 },
  otpInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.015, color: 'transparent', fontSize: 16, ...NO_OUTLINE },

  msg: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: t.radius.md },
  msgError: { backgroundColor: t.c.dangerSoft },
  msgNotice: { backgroundColor: t.scheme === 'dark' ? '#0f2e1a' : '#dcfce7' },
  badge: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.accentSoft, marginBottom: 6 },
  badgeOk: { backgroundColor: t.scheme === 'dark' ? '#0f2e1a' : '#dcfce7' },
}))
