// Read-only display of a provider's or package's vertical fields (cuisines, capacity...),
// the web's components/verticals/AttributeList.jsx, from the shared attributeEntries().
import { Check } from 'lucide-react-native'
import { View } from 'react-native'

import { attributeEntries, optionLabel } from '@shared/verticals/index.js'
import { Chip, ChipRow, Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'

type Field = { key: string; label: string; type: string; options?: unknown[] }

export function AttributeList({ fields = [], attrs = {} }: { fields?: Field[]; attrs?: Record<string, any> }) {
  const s = useStyles()
  const { c } = useTheme()
  const entries = attributeEntries(fields as any, attrs) as { key: string; label: string; type: string; value: string; raw: any }[]
  if (!entries.length) return null
  const fieldOf = (key: string) => fields.find((f) => f.key === key)
  return (
    <View style={s.list}>
      {entries.map((e) =>
        e.type === 'boolean' ? (
          <View key={e.key} style={s.bool}>
            <Check size={13} color={c.ok} />
            <Text variant="small">{e.label}</Text>
          </View>
        ) : e.type === 'tags' ? (
          <View key={e.key} style={s.item}>
            <Text variant="tiny" muted>{e.label}</Text>
            <ChipRow>
              {[].concat(e.raw).map((t: string) => <Chip key={t} label={optionLabel(fieldOf(e.key), t)} />)}
            </ChipRow>
          </View>
        ) : (
          <View key={e.key} style={s.row}>
            <Text variant="small" muted style={s.label}>{e.label}</Text>
            <Text variant="small" weight="600" style={s.value}>{e.value}</Text>
          </View>
        ),
      )}
    </View>
  )
}

const useStyles = makeStyles(() => ({
  list: { gap: 8, marginTop: 8 },
  bool: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: { gap: 4 },
  row: { flexDirection: 'row', gap: 10 },
  label: { width: 120 },
  value: { flex: 1 },
}))
