// Credits on a post (native port of the web's components/upload/Credits.jsx): the other
// vendors who worked that event (a florist credits the photographer and the venue).
//   <CreditsField value={credits} onChange={setCredits} exclude={[provider.id]} />  composer / edit sheet
//   <CreditChips credits={album.credits} dark onOpen={(id) => ...} />               the viewer
import { Check, Plus, Search, UserPlus, X } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import { searchVendors } from '@shared/api/portfolio.js'
import { Avatar, Button, Sheet, Text, TextField } from '@/components'
import { makeStyles, useTheme } from '@/theme'

export const MAX_CREDITS = 10

export type CreditItem = { providerId: string; name: string; avatar?: string | null; vertical?: string; label: string; role?: string | null }
type Vendor = { id: string; name: string; avatar: string; vertical: string; label: string; city: string | null }

export const toCreditItem = (v: Vendor): CreditItem => ({ providerId: v.id, name: v.name, avatar: v.avatar, vertical: v.vertical, label: v.label, role: null })

export function CreditsField({ value, onChange, exclude = [] }: { value: CreditItem[]; onChange: (v: CreditItem[]) => void; exclude?: string[] }) {
  const s = useStyles()
  const { c } = useTheme()
  const [picking, setPicking] = useState(false)
  const remove = (id: string) => onChange(value.filter((x) => x.providerId !== id))
  const toggle = (v: Vendor) =>
    onChange(value.some((x) => x.providerId === v.id) ? value.filter((x) => x.providerId !== v.id) : [...value, toCreditItem(v)].slice(0, MAX_CREDITS))
  return (
    <View accessibilityLabel="Credits">
      <Text variant="small" muted>Credits · optional</Text>
      <Text variant="tiny" muted style={s.help}>Tag the other vendors who worked this event. Your post shows on their profile too.</Text>
      <View style={s.list}>
        {value.map((x) => (
          <View key={x.providerId} style={s.chip}>
            <Avatar uri={x.avatar} name={x.name} size={26} />
            <View style={s.chipText}>
              <Text variant="tiny" weight="600" numberOfLines={1}>{x.name}</Text>
              <Text variant="tiny" muted numberOfLines={1} style={s.small}>{x.label}</Text>
            </View>
            <Pressable onPress={() => remove(x.providerId)} hitSlop={8} style={s.remove} accessibilityRole="button" accessibilityLabel={`Remove ${x.name}`}>
              <X size={13} color={c.muted} />
            </Pressable>
          </View>
        ))}
        {value.length < MAX_CREDITS && (
          <Pressable onPress={() => setPicking(true)} style={s.add} accessibilityRole="button">
            <UserPlus size={15} color={c.ink} />
            <Text variant="tiny" weight="600">{value.length ? 'Tag another' : 'Tag a vendor'}</Text>
          </Pressable>
        )}
      </View>
      <VendorPicker open={picking} onClose={() => setPicking(false)} picked={value} exclude={exclude} onToggle={toggle} />
    </View>
  )
}

function VendorPicker({ open, onClose, picked, exclude, onToggle }: {
  open: boolean; onClose: () => void; picked: CreditItem[]; exclude: string[]; onToggle: (v: Vendor) => void
}) {
  const s = useStyles()
  const { c } = useTheme()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Vendor[] | null>(null)
  const [error, setError] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    const n = ++seq.current
    const t = setTimeout(() => {
      searchVendors(q, { exclude, limit: 15 } as any)
        .then((r: Vendor[]) => { if (n === seq.current) { setResults(r); setError('') } })
        .catch(() => { if (n === seq.current) setError('Couldn’t search right now.') })
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const full = picked.length >= MAX_CREDITS
  return (
    <Sheet open={open} onClose={onClose} title="Tag a vendor" scroll={false}>
      <TextField icon={Search} value={q} onChangeText={setQ} placeholder="Search by name" clearable autoFocus returnKeyType="search" accessibilityLabel="Search vendors" />
      <ScrollView style={s.results} keyboardShouldPersistTaps="handled">
        {error ? <Text variant="small" muted center style={s.empty}>{error}</Text>
          : results === null ? <Text variant="small" muted center style={s.empty}>Searching…</Text>
          : results.length === 0 ? <Text variant="small" muted center style={s.empty}>{q ? `No vendors called “${q}”.` : 'No vendors yet.'}</Text>
          : results.map((v, i) => {
            const on = picked.some((x) => x.providerId === v.id)
            return (
              <Pressable key={v.id} onPress={() => onToggle(v)} disabled={!on && full} style={[s.row, i > 0 && s.rowLine, !on && full && s.disabled]}
                accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Avatar uri={v.avatar} name={v.name} size={36} />
                <View style={s.grow}>
                  <Text variant="small" weight="700" numberOfLines={1}>{v.name}</Text>
                  <Text variant="tiny" muted numberOfLines={1}>{[v.label, v.city].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={[s.tick, on && { backgroundColor: c.ink, borderColor: c.ink }]}>
                  {on ? <Check size={15} strokeWidth={3} color={c.onInk} /> : <Plus size={15} color={c.ink} />}
                </View>
              </Pressable>
            )
          })}
      </ScrollView>
      {full && <Text variant="tiny" muted>You can tag up to {MAX_CREDITS} vendors.</Text>}
      <Button title={`Done${picked.length ? ` · ${picked.length} tagged` : ''}`} variant="accent" block onPress={onClose} style={s.done} />
    </Sheet>
  )
}

// Credits on a post in the viewer: tappable vendor chips. dark: on the black viewer.
export function CreditChips({ credits, dark = false, onOpen }: { credits?: CreditItem[]; dark?: boolean; onOpen: (providerId: string) => void }) {
  const s = useStyles()
  if (!credits?.length) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.viewer} accessibilityLabel="Vendors on this event">
      {credits.map((x) => (
        <Pressable key={x.providerId} onPress={() => onOpen(x.providerId)} style={[s.chip, s.viewChip, dark && s.darkChip]} accessibilityRole="link" accessibilityLabel={`${x.name}, ${x.label}`}>
          <Avatar uri={x.avatar} name={x.name} size={24} />
          <View style={s.chipText}>
            <Text variant="tiny" weight="600" numberOfLines={1} style={dark ? s.white : undefined}>{x.name}</Text>
            <Text variant="tiny" muted numberOfLines={1} style={[s.small, dark && s.dim]}>{x.label}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

const useStyles = makeStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  help: { marginTop: 2, marginBottom: 8 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingLeft: 4, paddingRight: 6, borderRadius: 999, backgroundColor: t.c.soft, maxWidth: '100%' },
  chipText: { flexShrink: 1, minWidth: 0 },
  small: { fontSize: 10.5 },
  remove: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.muted },
  results: { maxHeight: 360, minHeight: 120, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: t.c.line },
  disabled: { opacity: 0.45 },
  tick: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: 18 },
  done: { marginTop: 12 },
  viewer: { gap: 6 },
  viewChip: { paddingRight: 12, maxWidth: 220 },
  darkChip: { backgroundColor: 'rgba(255,255,255,0.14)' },
  white: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.72)' },
}))
