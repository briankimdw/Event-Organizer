// A form for a vertical's custom fields (native port of the web's
// components/verticals/PackageFields.jsx). Same field configs (verticals/<slug>/config.js):
//   fields:   [{ key, label, type: 'number'|'text'|'select'|'tags'|'boolean', ... }]
//   values:   the attributes object being edited
//   onChange: (nextValues) => void
// Values stay as typed (numbers are strings while editing); run them through
// cleanAttributes(fields, values) from @shared/verticals before saving.
// Selects are chips (tap again to clear), since a native dropdown adds a dependency.
import { Plus, X } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { optionLabel, optionsOf } from '@shared/verticals/index.js'
import { Button, Chip, ChipRow, Text, TextField } from '@/components'
import { makeStyles } from '@/theme'
import { ToggleRow } from '../account/ui'

export type FieldDef = {
  key: string
  label: string
  type: 'number' | 'text' | 'select' | 'tags' | 'boolean'
  options?: (string | { value: string; label: string })[]
  min?: number
  max?: number
  step?: number
  unit?: string
  short?: string
  placeholder?: string
  maxLength?: number
  custom?: boolean
}

type Values = Record<string, any>

export default function PackageFields({ fields = [], values = {}, onChange }: { fields?: FieldDef[]; values?: Values; onChange: (v: Values) => void }) {
  const s = useStyles()
  if (!fields.length) return null
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v })
  // Short number fields sit two to a row.
  const rows: FieldDef[][] = []
  for (const f of fields) {
    const last = rows[rows.length - 1]
    if (f.type === 'number' && last?.length === 1 && last[0].type === 'number') last.push(f)
    else rows.push([f])
  }
  return (
    <View>
      {rows.map((row) => (
        <View key={row[0].key} style={[s.mt, row.length > 1 && s.pair]}>
          {row.map((f) => (
            <View key={f.key} style={row.length > 1 ? s.grow : undefined}>
              <Field field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Field({ field: f, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void }) {
  const s = useStyles()
  if (f.type === 'boolean') return <ToggleRow label={f.label} value={!!value} onChange={onChange} />
  if (f.type === 'tags') return <TagsField field={f} value={value} onChange={onChange} />
  if (f.type === 'select') {
    const options = optionsOf(f) as { value: string; label: string }[]
    const extra = value && !options.some((o) => o.value === value) ? [{ value, label: String(value) }] : []
    return (
      <View>
        <Text variant="small" muted style={s.label}>{f.label}</Text>
        <ChipRow>
          {[...extra, ...options].map((o) => (
            <Chip key={o.value} label={o.label} toggle on={value === o.value} onPress={() => onChange(value === o.value ? '' : o.value)} />
          ))}
        </ChipRow>
      </View>
    )
  }
  if (f.type === 'number') {
    return (
      <TextField
        label={f.label}
        keyboardType={f.step && !Number.isInteger(f.step) ? 'decimal-pad' : 'number-pad'}
        value={value == null ? '' : String(value)}
        onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
        placeholder={f.unit ? f.unit : undefined}
      />
    )
  }
  return <TextField label={f.label} maxLength={f.maxLength || 120} placeholder={f.placeholder} value={value ?? ''} onChangeText={onChange} />
}

// Suggested options as toggle chips, plus free text when the field allows it.
function TagsField({ field: f, value, onChange }: { field: FieldDef; value: any; onChange: (v: string[]) => void }) {
  const s = useStyles()
  const [draft, setDraft] = useState('')
  const list: string[] = Array.isArray(value) ? value : []
  const full = f.max != null && list.length >= f.max
  const toggle = (t: string) => onChange(list.includes(t) ? list.filter((x) => x !== t) : full ? list : [...list, t])
  const add = () => {
    const t = draft.trim()
    if (t && !list.includes(t) && !full) onChange([...list, t])
    setDraft('')
  }
  const options = optionsOf(f) as { value: string; label: string }[]
  const extra = list.filter((t) => !options.some((o) => o.value === t))
  return (
    <View>
      <Text variant="small" muted style={s.label}>{f.label}</Text>
      {(options.length > 0 || extra.length > 0) && (
        <ChipRow>
          {options.map((o) => <Chip key={o.value} label={o.label} toggle on={list.includes(o.value)} onPress={() => toggle(o.value)} />)}
          {extra.map((t) => <Chip key={t} label={optionLabel(f, t)} toggle on iconRight={X} onPress={() => toggle(t)} />)}
        </ChipRow>
      )}
      {f.custom && !full && (
        <View style={[s.pair, s.mtXs]}>
          <TextField
            containerStyle={s.grow}
            maxLength={80}
            placeholder={f.placeholder || 'Add your own'}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <Button title="Add" icon={Plus} variant="ghost" size="sm" disabled={!draft.trim()} onPress={add} accessibilityLabel={`Add to ${f.label}`} style={s.addBtn} />
        </View>
      )}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  mt: { marginTop: t.space.md },
  mtXs: { marginTop: t.space.xs },
  pair: { flexDirection: 'row', gap: t.space.sm, alignItems: 'flex-start' },
  grow: { flex: 1 },
  label: { marginBottom: 6 },
  addBtn: { alignSelf: 'center' },
}))
