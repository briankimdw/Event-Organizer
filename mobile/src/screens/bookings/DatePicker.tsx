// Month calendar where several days can be selected (the web's components/DatePicker.jsx).
// `dots` maps a date key to booking statuses to mark that day with.
//   <DatePicker selected={keys} onToggle={toggle} dots={{ '2026-10-21': ['confirmed'] }} isDisabled={isPast} />
import { TODAY, toKey } from '@shared/lib/dates.js'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { IconButton, Text } from '@/components'
import { makeStyles, useTheme, type Theme } from '@/theme'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

// The web's .cal-dot.s-<status> colors.
const dotColor = (status: string, t: Theme) =>
  ({
    requested: '#f59e0b', countered: '#f59e0b', accepted: t.c.accent, confirmed: '#3b82f6', in_progress: '#3b82f6',
    delivered: '#8b5cf6', completed: '#22c55e', disputed: t.c.danger, declined: t.c.danger,
    cancelled_by_client: t.c.danger, cancelled_by_provider: t.c.danger,
  })[status] ?? t.c.muted

type Props = {
  selected?: string[]
  onToggle: (key: string) => void
  dots?: Record<string, string[]>
  isDisabled?: (d: Date) => boolean
  month?: Date
  onMonthChange?: (d: Date) => void
}

export default function DatePicker({ selected = [], onToggle, dots = {}, isDisabled = () => false, month, onMonthChange }: Props) {
  const s = useStyles()
  const t = useTheme()
  const [ownMonth, setOwnMonth] = useState(() => monthStart(TODAY))
  const shown = month ?? ownMonth
  const setShown = onMonthChange ?? setOwnMonth

  const firstWeekday = shown.getDay()
  const daysInMonth = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(shown.getFullYear(), shown.getMonth(), i + 1)),
  ]
  while (cells.length % 7) cells.push(null)
  const todayKey = toKey(TODAY)

  return (
    <View>
      <View style={s.head}>
        <IconButton icon={ChevronLeft} size={18} label="Previous month" onPress={() => setShown(new Date(shown.getFullYear(), shown.getMonth() - 1, 1))} />
        <Text variant="body" weight="700">{shown.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        <IconButton icon={ChevronRight} size={18} label="Next month" onPress={() => setShown(new Date(shown.getFullYear(), shown.getMonth() + 1, 1))} />
      </View>
      <View style={s.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`w${i}`} style={s.cell}>
            <Text variant="tiny" muted weight="600" center style={s.weekday}>{d}</Text>
          </View>
        ))}
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={s.cell} />
          const key = toKey(d)
          const marks = dots[key] || []
          const on = selected.includes(key)
          const disabled = isDisabled(d)
          const isToday = key === todayKey
          const color = on ? t.c.onInk : disabled ? (marks.length ? t.c.muted : t.c.faint) : isToday ? t.c.accent : t.c.ink
          return (
            <View key={key} style={s.cell}>
              <Pressable
                onPress={() => onToggle(key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={d.toDateString()}
                accessibilityState={{ selected: on, disabled }}
                style={({ pressed }) => [s.day, isToday && !on && s.today, on && s.selected, pressed && !on && s.pressed]}
              >
                <Text style={{ color, fontSize: 13.5, fontWeight: isToday ? '800' : marks.length ? '700' : '400' }}>{d.getDate()}</Text>
                {marks.length > 0 && (
                  <View style={s.dots}>
                    {marks.slice(0, 3).map((st, j) => (
                      <View key={j} style={[s.dot, { backgroundColor: dotColor(st, t) }, on && s.dotOn]} />
                    ))}
                  </View>
                )}
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 1 },
  weekday: { paddingTop: 4, paddingBottom: 6 },
  day: { height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: t.c.accent },
  selected: { backgroundColor: t.c.ink },
  pressed: { backgroundColor: t.c.soft },
  dots: { position: 'absolute', bottom: 4, flexDirection: 'row', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotOn: { borderWidth: 1, borderColor: t.c.onInk, width: 6, height: 6 },
}))
