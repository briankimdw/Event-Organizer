// A provider's packages and add-ons (the web Profile's Packages tab). Each card shows the
// package's key facts for its vertical (hours, then the config's headline fields: edited
// photos and turnaround for photography, guests for catering...) and the rest of its fields.
// onSelect makes each card tappable (to start a booking with that package).
import { ChevronRight, Clock, Sparkles } from 'lucide-react-native'
import { View } from 'react-native'

import { attributeLines, verticalConfig } from '@shared/verticals/index.js'
import { Card, PriceLabel, Text } from '@/components'
import { makeStyles, useTheme } from '@/theme'
import type { Package } from '@/types'
import { AttributeList } from './AttributeList'

type Props = {
  packages: Package[]
  addons?: { id: string; name: string; price: number | null }[]
  vertical?: string | null
  onSelect?: (pkg: Package) => void
}

export function PackageList({ packages, addons = [], vertical = 'photography', onSelect }: Props) {
  const s = useStyles()
  const { c } = useTheme()
  const config = verticalConfig(vertical)
  const otherFields = config.packageFields.filter((f: { key: string }) => !config.packageKeys.includes(f.key))
  return (
    <View>
      {packages.map((pkg) => {
        const facts: string[] = attributeLines(config.packageFields, pkg.attributes, config.packageKeys)
        return (
          <Card key={pkg.id} onPress={onSelect ? () => onSelect(pkg) : undefined} style={s.card} accessibilityLabel={pkg.name}>
            <View style={s.between}>
              <Text variant="h4" style={s.grow}>{pkg.name}</Text>
              <PriceLabel pkg={pkg} variant="body" weight="700" />
            </View>
            {!!(pkg.hours || facts.length) && (
              <View style={s.facts}>
                {!!pkg.hours && <Fact icon={<Clock size={13} color={c.ink} />} text={`${pkg.hours}h`} />}
                {facts.map((l) => <Fact key={l} icon={<Sparkles size={13} color={c.ink} />} text={l} />)}
              </View>
            )}
            {!!pkg.description && <Text variant="small">{pkg.description}</Text>}
            <AttributeList fields={otherFields} attrs={pkg.attributes} />
            {pkg.depositPct != null && <Text variant="small" muted>{pkg.depositPct}% deposit to confirm</Text>}
            {onSelect && (
              <View style={s.select}>
                <Text variant="small" weight="600" style={{ color: c.onInk }}>Select</Text>
                <ChevronRight size={14} color={c.onInk} />
              </View>
            )}
          </Card>
        )
      })}
      {addons.length > 0 && (
        <>
          <Text variant="h4" style={s.title}>Add-ons</Text>
          {addons.map((a) => (
            <View key={a.id} style={s.line}>
              <Text variant="small">{a.name}</Text>
              <Text variant="small">{a.price == null ? 'Quote' : `+$${a.price.toLocaleString()}`}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  )
}

function Fact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {icon}
      <Text variant="small" style={{ fontSize: 12.5 }}>{text}</Text>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  card: { marginBottom: 10, gap: 4, padding: 14 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grow: { flex: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 4 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 8, backgroundColor: t.c.ink, paddingVertical: 7, paddingHorizontal: 12, borderRadius: t.radius.sm },
  title: { marginTop: 20, marginBottom: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.c.line },
}))
