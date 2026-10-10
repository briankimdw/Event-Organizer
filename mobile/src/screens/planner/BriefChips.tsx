// "What I understood": one chip per brief field (the web's components/planner/BriefChips.jsx).
// Tapping a chip opens a small editor in a sheet; applying it calls onEdit(field, nextBrief).
import { isPast, fromKey } from '@shared/lib/dates.js'
import { CalendarDays, MapPin, Palette, Pencil, Plus, Users, Wallet, X, type LucideIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'

import { Button, Chip, Sheet, Text, TextField } from '@/components'
import DatePicker from '@/screens/bookings/DatePicker'
import { makeStyles, useTheme } from '@/theme'
import { EVENT_TYPES, STYLE_SUGGESTIONS, centsShort, datesLabel, eventTypeName, typeIcon, type Brief } from './brief'

const MAX_DATES = 14

type Field = 'event_type' | 'dates' | 'location_text' | 'budget_total_cents' | 'guest_count' | 'styles'

const SHEET_TITLES: Record<Field, string> = {
  event_type: 'What kind of event?',
  dates: 'When is it?',
  location_text: 'Where is it?',
  budget_total_cents: 'Total budget',
  guest_count: 'How many guests?',
  styles: 'Photo style',
}

export default function BriefChips({ brief, onEdit, disabled = false }: { brief: Brief | null; onEdit: (field: Field, next: Brief) => void; disabled?: boolean }) {
  const s = useStyles()
  const { c } = useTheme()
  const [editing, setEditing] = useState<Field | null>(null)
  if (!brief) return null

  const chips: { field: Field; icon: LucideIcon; label: string | null }[] = [
    { field: 'event_type', icon: typeIcon(brief.event_type), label: brief.event_type ? eventTypeName(brief.event_type) : null },
    { field: 'dates', icon: CalendarDays, label: datesLabel(brief) },
    { field: 'location_text', icon: MapPin, label: brief.location_text },
    { field: 'budget_total_cents', icon: Wallet, label: brief.budget_total_cents != null ? `${centsShort(brief.budget_total_cents)} budget` : null },
    { field: 'guest_count', icon: Users, label: brief.guest_count != null ? `${brief.guest_count} guests` : null },
    { field: 'styles', icon: Palette, label: brief.styles.length ? brief.styles.join(', ') : null },
  ]
  const EMPTY: Record<Field, string> = {
    event_type: 'Event type', dates: 'Add dates', location_text: 'Add location', budget_total_cents: 'Add budget', guest_count: 'Guests', styles: 'Style',
  }

  const apply = (field: Field, patch: Partial<Brief>) => {
    setEditing(null)
    onEdit(field, { ...brief, ...patch })
  }

  return (
    <View>
      <Text variant="label" style={s.label}>
        What I understood <Text variant="small" muted style={s.labelHint}>· tap to change</Text>
      </Text>
      <View style={s.chips}>
        {chips.map(({ field, icon: Icon, label }) => (
          <Pressable
            key={field}
            onPress={() => setEditing(field)}
            disabled={disabled}
            style={({ pressed }) => [s.chip, !label && s.missing, disabled && s.disabled, pressed && { transform: [{ scale: 0.97 }] }]}
            accessibilityRole="button"
            accessibilityLabel={label ? `${label}. Change` : EMPTY[field]}
          >
            {label ? <Icon size={14} color={c.ink} /> : <Plus size={14} color={c.muted} />}
            <Text variant="small" weight={label ? '500' : '400'} muted={!label} numberOfLines={1} style={s.chipText}>{label || EMPTY[field]}</Text>
            {!!label && <Pencil size={11} color={c.faint} />}
          </Pressable>
        ))}
      </View>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? SHEET_TITLES[editing] : ''}>
        {editing && <FieldEditor field={editing} brief={brief} onApply={(patch) => apply(editing, patch)} />}
      </Sheet>
    </View>
  )
}

type EditorProps = { brief: Brief; onApply: (patch: Partial<Brief>) => void }

function FieldEditor({ field, brief, onApply }: EditorProps & { field: Field }) {
  switch (field) {
    case 'event_type':
      return <TypeEditor brief={brief} onApply={onApply} />
    case 'dates':
      return <DatesEditor brief={brief} onApply={onApply} />
    case 'location_text':
      return <LocationEditor brief={brief} onApply={onApply} />
    case 'budget_total_cents':
      return (
        <NumberEditor
          prefix="$"
          value={brief.budget_total_cents != null ? Math.round(brief.budget_total_cents / 100) : ''}
          hint="For the whole event. I’ll split it across photography, venue and the rest."
          onApply={(n) => onApply({ budget_total_cents: n == null ? null : n * 100 })}
        />
      )
    case 'guest_count':
      return <NumberEditor suffix="guests" value={brief.guest_count ?? ''} onApply={(n) => onApply({ guest_count: n })} />
    case 'styles':
      return <StylesEditor brief={brief} onApply={onApply} />
    default:
      return null
  }
}

function TypeEditor({ brief, onApply }: EditorProps) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={s.typeGrid}>
      {EVENT_TYPES.map(([slug, name]) => {
        const Icon = typeIcon(slug)
        const on = brief.event_type === slug
        return (
          <Pressable key={slug} onPress={() => onApply({ event_type: slug })} style={[s.type, on && s.typeOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
            <Icon size={18} color={on ? c.onInk : c.ink} />
            <Text variant="small" weight="600" style={{ color: on ? c.onInk : c.ink }}>{name}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function DatesEditor({ brief, onApply }: EditorProps) {
  const s = useStyles()
  const [dates, setDates] = useState<string[]>(() => [...brief.dates].sort())
  const [month, setMonth] = useState(() => {
    const d = dates[0] ? fromKey(dates[0]) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const toggle = (key: string) => setDates((ds) => (ds.includes(key) ? ds.filter((k) => k !== key) : ds.length >= MAX_DATES ? ds : [...ds, key].sort()))
  return (
    <>
      <DatePicker selected={dates} onToggle={toggle} isDisabled={isPast} month={month} onMonthChange={setMonth} />
      <Text variant="tiny" muted style={s.mtSm}>Pick every day you need covered (up to {MAX_DATES}).</Text>
      <View style={[s.row, s.mt]}>
        {dates.length > 0 && <Button title="Clear" variant="ghost" onPress={() => setDates([])} />}
        <Button
          title={dates.length ? `Use ${dates.length} date${dates.length > 1 ? 's' : ''}` : 'No date yet'}
          grow
          onPress={() => onApply({ dates, start_date: dates[0] ?? null, end_date: dates[dates.length - 1] ?? null })}
        />
      </View>
    </>
  )
}

function LocationEditor({ brief, onApply }: EditorProps) {
  const s = useStyles()
  const [text, setText] = useState(brief.location_text || '')
  const submit = () => {
    const t = text.trim()
    onApply({ location_text: t || null, location: t === (brief.location_text || '') ? brief.location : null })
  }
  return (
    <>
      <TextField autoFocus value={text} onChangeText={setText} placeholder="City, venue or neighborhood" returnKeyType="done" onSubmitEditing={submit} />
      <Button title="Update location" block onPress={submit} style={s.mt} />
    </>
  )
}

function NumberEditor({ value, prefix, suffix, hint, onApply }: { value: number | string; prefix?: string; suffix?: string; hint?: string; onApply: (n: number | null) => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const [text, setText] = useState(String(value))
  const n = text.trim() === '' ? null : Math.max(0, Math.round(Number(text.replace(/[^\d.]/g, ''))))
  const valid = n == null || Number.isFinite(n)
  const submit = () => valid && onApply(n)
  return (
    <>
      <View style={s.number}>
        {!!prefix && <Text style={s.numberText}>{prefix}</Text>}
        <TextInput
          autoFocus
          value={text}
          onChangeText={setText}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={submit}
          placeholder="0"
          placeholderTextColor={c.faint}
          accessibilityLabel={suffix || 'Amount'}
          style={[s.numberText, s.grow]}
        />
        {!!suffix && <Text variant="body" muted>{suffix}</Text>}
      </View>
      {!!hint && <Text variant="tiny" muted style={s.mtSm}>{hint}</Text>}
      <Button title="Update" block disabled={!valid} onPress={submit} style={s.mt} />
    </>
  )
}

function StylesEditor({ brief, onApply }: EditorProps) {
  const s = useStyles()
  const [styles, setStyles] = useState<string[]>(brief.styles)
  const [custom, setCustom] = useState('')
  const toggle = (x: string) => setStyles((xs) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]))
  const options = [...new Set([...STYLE_SUGGESTIONS, ...styles])]
  const addCustom = () => {
    const x = custom.trim().toLowerCase()
    if (x && !styles.includes(x)) setStyles((xs) => [...xs, x])
    setCustom('')
  }
  return (
    <>
      <View style={s.chips}>
        {options.map((x) => (
          <Chip key={x} label={x} toggle on={styles.includes(x)} iconRight={styles.includes(x) ? X : undefined} onPress={() => toggle(x)} />
        ))}
      </View>
      <View style={[s.row, s.mt]}>
        <TextField value={custom} onChangeText={setCustom} placeholder="Something else, e.g. “vintage”" containerStyle={s.grow} returnKeyType="done" onSubmitEditing={addCustom} />
        <Button title="Add" variant="ghost" disabled={!custom.trim()} onPress={addCustom} />
      </View>
      <Button title="Update style" block onPress={() => onApply({ styles })} style={s.mt} />
    </>
  )
}

const useStyles = makeStyles((t) => ({
  label: { marginBottom: 8 },
  labelHint: { textTransform: 'none', letterSpacing: 0, fontWeight: '400', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 7, paddingHorizontal: 11,
    borderRadius: 999, backgroundColor: t.c.soft, borderWidth: 1, borderColor: 'transparent',
  },
  chipText: { flexShrink: 1 },
  missing: { backgroundColor: t.c.bg, borderStyle: 'dashed', borderColor: t.scheme === 'dark' ? t.c.faint : '#cfcfcf' },
  disabled: { opacity: 0.5 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line },
  typeOn: { backgroundColor: t.c.ink, borderColor: t.c.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  mtSm: { marginTop: 8 },
  mt: { marginTop: 16 },
  number: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: t.c.line, paddingBottom: 4 },
  numberText: { fontSize: 26, fontWeight: '700', color: t.c.ink, paddingVertical: 4 },
}))
