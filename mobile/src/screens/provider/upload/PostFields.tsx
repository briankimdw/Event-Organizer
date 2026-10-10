// The post's detail fields (native port of the web's components/upload/PostFields.jsx
// and CameraSettings.jsx): title, category, caption, location, date, a disclosure
// section, and the camera settings with show / hide switches.
import { ChevronDown } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { Chip, ChipRow, Text, TextField } from '@/components'
import { makeStyles, useTheme } from '@/theme'
import { FieldHint, ToggleRow } from '../../account/ui'
import type { PhotoItem } from './usePhotoItems'

export const LIMITS = { title: 120, caption: 2200, location: 120 }

const pad = (n: number) => String(n).padStart(2, '0')
export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const prettyDay = (key: string) =>
  key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

// Required fields first. Returns { field: message } for anything that needs fixing.
export function validatePost({ title, categoryId, shotOn }: { title: string; categoryId: string | null; shotOn: string }) {
  const errors: Record<string, string | undefined> = {}
  if (!title.trim()) errors.title = 'Give your post a title.'
  else if (title.trim().length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`
  if (!categoryId) errors.category = 'Pick what kind of work this is.'
  if (shotOn && !/^\d{4}-\d{2}-\d{2}$/.test(shotOn)) errors.shotOn = 'Use the format YYYY-MM-DD, e.g. 2026-06-14.'
  else if (shotOn && Number.isNaN(+new Date(`${shotOn}T12:00:00`))) errors.shotOn = 'That isn’t a real date.'
  else if (shotOn && shotOn > todayKey()) errors.shotOn = 'The date can’t be in the future.'
  for (const k of Object.keys(errors)) if (!errors[k]) delete errors[k]
  return errors
}

const counter = (value: string, max: number) => (value.length > max * 0.8 ? `${value.length}/${max}` : undefined)

export function TitleField({ value, onChange, error, placeholder = 'e.g. Nguyen–Park wedding' }: { value: string; onChange: (v: string) => void; error?: string; placeholder?: string }) {
  const c = counter(value, LIMITS.title)
  return (
    <View>
      <TextField label="Title" labelRight={c ? <Text variant="tiny" color={value.length > LIMITS.title ? 'danger' : 'muted'}>{c}</Text> : undefined}
        maxLength={LIMITS.title} value={value} onChangeText={onChange} placeholder={placeholder} returnKeyType="done" />
      {!!error && <FieldHint error>{error}</FieldHint>}
    </View>
  )
}

export function CategoryField({ value, onChange, services, error }: { value: string | null; onChange: (v: string | null) => void; services: { id: string; name: string }[] | null; error?: string }) {
  const s = useStyles()
  return (
    <View accessibilityLabel="Category">
      <Text variant="small" muted style={s.label}>Category</Text>
      {services === null ? <Text variant="tiny" muted>Loading…</Text> : (
        <ChipRow>
          {services.map((x) => <Chip key={x.id} label={x.name} toggle on={value === x.id} onPress={() => onChange(value === x.id ? null : x.id)} />)}
        </ChipRow>
      )}
      {!!error && <FieldHint error>{error}</FieldHint>}
    </View>
  )
}

export function CaptionField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = useStyles()
  const c = counter(value, LIMITS.caption)
  return (
    <TextField label="Caption" labelRight={c ? <Text variant="tiny" muted>{c}</Text> : undefined} multiline maxLength={LIMITS.caption}
      value={value} onChangeText={onChange} placeholder="The story behind it: the event, the people, the details…" style={s.textarea} />
  )
}

export function PlaceDateFields({ location, onLocation, shotOn, onShotOn, dateError, dateHint }: {
  location: string; onLocation: (v: string) => void; shotOn: string; onShotOn: (v: string) => void; dateError?: string; dateHint?: string | null
}) {
  const s = useStyles()
  return (
    <View>
      <View style={s.pair}>
        <TextField label="Location" containerStyle={s.grow} maxLength={LIMITS.location} value={location} onChangeText={onLocation} placeholder="City or venue" />
        <TextField label="Date" containerStyle={s.date} value={shotOn} onChangeText={(v) => onShotOn(v.replace(/[^0-9-]/g, '').slice(0, 10))}
          placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
      </View>
      {dateError ? <FieldHint error>{dateError}</FieldHint> : dateHint ? <FieldHint>{dateHint}</FieldHint> : shotOn ? <FieldHint>{prettyDay(shotOn)}</FieldHint> : null}
    </View>
  )
}

// A tucked-away section: a row that opens to show its children.
export function Disclosure({ title, summary, open, onToggle, children, badge }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: ReactNode; badge?: string }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <View style={s.disclosure}>
      <Pressable onPress={onToggle} style={s.discHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={s.grow}>
          <Text weight="600">{title}{badge ? <Text variant="tiny" muted>{`  ${badge}`}</Text> : null}</Text>
          {!open && !!summary && <Text variant="tiny" muted numberOfLines={1}>{summary}</Text>}
        </View>
        <ChevronDown size={18} color={c.muted} style={open ? { transform: [{ rotate: '180deg' }] } : undefined} />
      </Pressable>
      {open && <View style={s.discBody}>{children}</View>}
    </View>
  )
}

// ---- camera settings ----

export const SETTING_FIELDS: [string, string][] = [
  ['body', 'Camera'], ['lens', 'Lens'], ['focal', 'Focal length'], ['aperture', 'Aperture'],
  ['shutter', 'Shutter'], ['iso', 'ISO'], ['flash', 'Flash'], ['taken_on', 'Date taken'],
]
const show = (key: string, v: string) => (key === 'taken_on' ? prettyDay(v) : key === 'iso' ? `ISO ${v}` : v)

export type SettingField = { key: string; label: string; values: string[] }

// What the photos' EXIF says, field by field (only fields found).
export function readFields(items: PhotoItem[]): SettingField[] {
  return SETTING_FIELDS.map(([key, label]) => ({
    key, label, values: [...new Set(items.map((it) => it.settings?.[key]).filter(Boolean))] as string[],
  })).filter((f) => f.values.length)
}

// One-line summary of the shown settings, e.g. "Sony ILCE-7M4 · 35mm · f/1.8 · 1/250s · ISO 400".
export function settingsSummary(fields: SettingField[], hidden: Set<string>) {
  const pick = (k: string) => fields.find((f) => f.key === k && !hidden.has(k))
  return ['body', 'focal', 'aperture', 'shutter', 'iso']
    .map((k) => pick(k))
    .filter(Boolean)
    .map((f) => show(f!.key, f!.values[0]) + (f!.values.length > 1 ? '…' : ''))
    .join(' · ')
}

export function CameraSettings({ fields, hidden, onToggle }: { fields: SettingField[]; hidden: Set<string>; onToggle: (k: string) => void }) {
  if (!fields.length) return <Text variant="small" muted>No camera settings found in these photos. That’s fine: they’re optional.</Text>
  return (
    <View>
      <Text variant="tiny" muted>Shown on your post to help clients get a feel for your work. Switch off anything you’d rather keep to yourself.</Text>
      {fields.map(({ key, label, values }) => (
        <ToggleRow
          key={key}
          label={label}
          sub={show(key, values[0]) + (values.length > 1 ? ` +${values.length - 1} more` : '')}
          value={!hidden.has(key)}
          onChange={() => onToggle(key)}
        />
      ))}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  label: { marginBottom: 6 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  date: { width: 132 },
  disclosure: { borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.lg, overflow: 'hidden' },
  discHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  discBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
}))

export function useHiddenSet() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setHidden((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  return { hidden, setHidden, toggle }
}
