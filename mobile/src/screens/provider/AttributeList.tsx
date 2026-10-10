// Read-only display of a listing's or package's custom fields (the web's
// components/verticals/AttributeList.jsx), using the shared attributeEntries().
import { Check } from 'lucide-react-native'
import { View } from 'react-native'

import { attributeEntries, optionLabel } from '@shared/verticals/index.js'
import { Chip, ChipRow, Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'
import type { FieldDef } from './PackageFields'

export default function AttributeList({ fields = [], attrs = {} }: { fields?: FieldDef[]; attrs?: Record<string, any> }) {
  const s = useStyles()
  const { c } = useTheme()
  const entries = attributeEntries(fields, attrs)
  if (!entries.length) return null
  const fieldOf = (key: string) => fields.find((f) => f.key === key)!
  return (
    <View style={s.list}>
      {entries.map((e) =>
        e.type === 'boolean' ? (
          <View key={e.key} style={s.row}>
            <Check size={13} color={c.ok} />
            <Text variant="small">{e.label}</Text>
          </View>
        ) : e.type === 'tags' ? (
          <View key={e.key} style={s.tags}>
            <Text variant="tiny" muted>{e.label}</Text>
            <ChipRow>{([] as string[]).concat(e.raw).map((t) => <Chip key={t} label={optionLabel(fieldOf(e.key), t)} />)}</ChipRow>
          </View>
        ) : (
          <View key={e.key} style={s.pairRow}>
            <Text variant="small" muted>{e.label}</Text>
            <Text variant="small" weight="600" style={s.value}>{e.value}</Text>
          </View>
        ),
      )}
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  list: { gap: 8, marginTop: t.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { gap: 4 },
  pairRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  value: { flexShrink: 1, textAlign: 'right' },
}))
