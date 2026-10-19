// The swipe deck's "which kind of vendor" switch (the web's components/discover/VerticalPicker.jsx):
// a tinted chip that opens a sheet with "Everything" and all 18 verticals, grouped like the
// catalog (shared api/home.js deckChoices()). Verticals with posts swipe through their work;
// the others (incl. the non-visual ones) swipe through the vendors themselves. Verticals with
// nobody yet are listed under "Coming soon" and can't be picked.
// TintChip is also used for the quick-switch and occasion chips in the deck.
import { Check, ChevronDown } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'

import { nounFor } from '@shared/verticals/index.js'
import { Loading, Sheet, Text, VerticalIcon } from '@/components'
import { makeStyles, useReadableTint, useTheme } from '@/theme'
import type { Vertical } from '@/types'

export type DeckChoice = Vertical & { count: number; posts: number; mode: 'photos' | 'vendors' | 'empty' }
export type DeckChoices = {
  everything: { slug: string; name: string; icon: string; tint: string; count: number; posts: number }
  groups: { slug: string; name: string; verticals: DeckChoice[] }[]
}

type ChipInfo = { slug: string; name: string; icon: string; tint: string }

export function VerticalPickerChip({ vertical, onPress }: { vertical: ChipInfo; onPress: () => void }) {
  return <TintChip info={vertical} label={vertical.name} a11yLabel={`Showing ${vertical.slug === 'all' ? 'everything' : vertical.name}`} hint="Choose another kind of vendor" onPress={onPress} />
}

/** A chip tinted with a vertical's / occasion's colour. With `on` it's a toggle (filled when on);
 *  with `hint` (the picker) it has a chevron. */
export function TintChip({ info, label, a11yLabel, hint, on, onPress }: { info: ChipInfo; label: string; a11yLabel?: string; hint?: string; on?: boolean; onPress: () => void }) {
  const s = useStyles()
  const { c, scheme } = useTheme()
  const readable = useReadableTint()
  const ink = readable(info.tint, 5) // 5:1 against the page, so 4.5:1+ on the 10% tinted chip
  // On: the tint (darkened for light, lightened for dark) as the fill, page colour as the text.
  const fill = on ? readable(info.tint, 5) : null
  const fg = on ? c.bg : ink
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, fill ? { borderColor: fill, backgroundColor: fill } : { borderColor: `${info.tint}4d`, backgroundColor: `${info.tint}1a` }]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={on != null ? { selected: on } : undefined}
    >
      <VerticalIcon name={info.icon} size={14} color={fg} />
      <Text variant="small" weight="600" style={{ color: fg }} maxFontSizeMultiplier={1.6}>{label}</Text>
      {!!hint && <ChevronDown size={14} color={fg} />}
    </Pressable>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Row({ on, label, sub, icon, onPress }: { on: boolean; label: string; sub: string; icon: ReactNode; onPress: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  return (
    <Pressable onPress={onPress} style={[s.row, on && s.rowOn]} accessibilityRole="button" accessibilityLabel={`${label}, ${sub}`} accessibilityState={{ selected: on }}>
      {icon}
      <View style={s.grow}>
        <Text variant="body" weight="700">{label}</Text>
        <Text variant="tiny" muted>{sub}</Text>
      </View>
      {on && <Check size={18} color={c.ink} />}
    </Pressable>
  )
}

// "8 photographers · 17 posts", "2 caterers · profiles to swipe", "None yet. Be the first" (the web's choiceCountText).
export function choiceCountText(v: { slug: string; count: number; posts: number }) {
  const posts = v.posts ? ` · ${plural(v.posts, 'post', 'posts')}` : ''
  if (v.slug === 'all') return `${v.count} ${nounFor(null, v.count)}${posts}`
  if (!v.count) return 'None yet. Be the first'
  return `${v.count} ${nounFor(v.slug, v.count)}${posts || ' · profiles to swipe'}`
}

type SheetProps = { open: boolean; onClose: () => void; choices: DeckChoices; loading: boolean; value: string; onPick: (slug: string) => void }

// Every vertical can be picked; one with nobody yet shows an invite in the deck.
export function VerticalPickerSheet({ open, onClose, choices, loading, value, onPick }: SheetProps) {
  const s = useStyles()
  const e = choices.everything
  return (
    <Sheet open={open} onClose={onClose} title="Swipe through">
      {loading ? (
        <Loading inline />
      ) : (
        <>
          <Row
            on={value === e.slug}
            label="For you: everything"
            sub={choiceCountText(e)}
            icon={<VerticalIcon name={e.icon} tint={e.tint} size={18} bubble bubbleSize={40} />}
            onPress={() => onPick(e.slug)}
          />
          {choices.groups.map((g) => (
            <View key={g.slug}>
              <Text variant="label" style={s.label}>{g.name}</Text>
              <View accessibilityRole="list">
                {g.verticals.map((v) => (
                  <View key={v.slug}>
                    <Row
                      on={v.slug === value}
                      label={v.name}
                      sub={choiceCountText(v)}
                      icon={<VerticalIcon name={v.icon} tint={v.tint} size={18} bubble bubbleSize={40} />}
                      onPress={() => onPick(v.slug)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </Sheet>
  )
}

const useStyles = makeStyles((t) => ({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, minHeight: 34, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: t.radius.lg, minHeight: 56 },
  rowOn: { backgroundColor: t.c.soft },
  grow: { flex: 1, minWidth: 0 },
  label: { marginTop: 16, marginBottom: 6 },
}))
