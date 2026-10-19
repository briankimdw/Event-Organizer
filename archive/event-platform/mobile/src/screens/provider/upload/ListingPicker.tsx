// "Posting to": which of your listings a post belongs to (native port of the web's
// components/upload/ListingPicker.jsx). Only shown with more than one listing.
import { Check, ChevronDown } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { verticalMeta } from '@shared/verticals/index.js'
import { Sheet, Text, VerticalIcon } from '@/components'
import { makeStyles, useTheme } from '@/theme'

type Listing = { id: string; display_name: string; vertical: string }

export default function ListingPicker({ providers, value, onChange }: { providers: Listing[]; value: string; onChange: (id: string) => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const [open, setOpen] = useState(false)
  if (!providers || providers.length < 2) return null
  const current = providers.find((p) => p.id === value) || providers[0]
  const meta = verticalMeta(current.vertical)
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={s.pill} accessibilityRole="button" accessibilityLabel={`Posting to ${current.display_name}. Change`}>
        <VerticalIcon name={meta.icon} tint={meta.tint} size={13} bubble bubbleSize={26} />
        <Text variant="tiny" muted numberOfLines={1} style={s.grow}>
          Posting to <Text variant="tiny" weight="700">{current.display_name}</Text> · {meta.name}
        </Text>
        <ChevronDown size={16} color={c.muted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Post to which listing?">
        {providers.map((p, i) => {
          const m = verticalMeta(p.vertical)
          const on = p.id === current.id
          return (
            <Pressable key={p.id} onPress={() => { onChange(p.id); setOpen(false) }} style={[s.row, i > 0 && s.rowLine]}
              accessibilityRole="button" accessibilityState={{ selected: on }}>
              <VerticalIcon name={m.icon} tint={m.tint} size={18} bubble bubbleSize={38} />
              <View style={s.grow}>
                <Text variant="small" weight="700" numberOfLines={1}>{p.display_name}</Text>
                <Text variant="tiny" muted>{m.name}</Text>
              </View>
              {on && <Check size={18} color={c.accent} />}
            </Pressable>
          )
        })}
      </Sheet>
    </>
  )
}

const useStyles = makeStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: 999, borderWidth: 1, borderColor: t.c.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: t.c.line },
}))
