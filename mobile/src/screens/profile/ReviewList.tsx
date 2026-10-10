// Client reviews (the web's components/Reviews.jsx): tap the reviewer to open their
// profile, tap the review to read it in full (ReviewSheet, with what it was for when the
// viewer may see the booking).
import { useRouter } from 'expo-router'
import { ChevronRight, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { reviewBooking } from '@shared/api/catalog.js'
import { Avatar, Button, Sheet, Stars, Text } from '@/components'
import useQuery from '@/hooks/useQuery'
import { makeStyles, useTheme } from '@/theme'
import type { Review } from '@/types'

type About = { id: string; name: string; avatar?: string | null }

// provider: who the reviews are about. here: we're on that provider's page.
export function ReviewList({ reviews, provider, here = false }: { reviews: Review[]; provider?: About; here?: boolean }) {
  const s = useStyles()
  const router = useRouter()
  const [open, setOpen] = useState<Review | null>(null)
  return (
    <View>
      {reviews.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => setOpen(r)}
          style={({ pressed }) => [s.review, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${r.rating}-star review by ${r.name}, ${r.date}. Read the full review`}
        >
          <View style={s.head}>
            <Pressable onPress={r.authorId ? () => router.push(`/u/${r.username || r.authorId}`) : undefined} style={s.author} accessibilityRole={r.authorId ? 'link' : undefined}>
              <Avatar uri={r.avatar} name={r.name} size="sm" />
              <Text variant="small" weight="700" numberOfLines={1}>{r.name}</Text>
            </Pressable>
            <Stars value={r.rating} size={12} />
            <Text variant="tiny" muted style={s.date}>{r.date}</Text>
          </View>
          {r.text ? <Text variant="small" numberOfLines={4}>{r.text}</Text> : <Text variant="small" muted>Rated {r.rating} out of 5, no written comment.</Text>}
        </Pressable>
      ))}
      <ReviewSheet review={open} provider={provider} here={here} onClose={() => setOpen(null)} />
    </View>
  )
}

const fullDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null)

export function ReviewSheet({ review: r, provider, here = false, onClose }: { review: Review | null; provider?: About; here?: boolean; onClose: () => void }) {
  const s = useStyles()
  const { c } = useTheme()
  const router = useRouter()
  // What it was for: only the booking's client and provider can see that.
  const { data: booking } = useQuery<{ packageName: string | null; completed: string | null } | null>(
    r?.bookingId ? () => reviewBooking(r.bookingId!).catch(() => null) : null,
    [r?.bookingId],
  )
  const first = (r?.name || '').split(' ')[0]
  const go = (to: string) => {
    onClose()
    router.push(to as any)
  }
  return (
    <Sheet open={!!r} onClose={onClose} title="Review">
      {r && (
        <View>
          <View style={s.detailHead}>
            <Avatar uri={r.avatar} name={r.name} size="lg" />
            <View style={s.grow}>
              <Text variant="h4">{r.name}</Text>
              <View style={s.inline}>
                <Stars value={r.rating} size={18} />
                <Text variant="small"><Text variant="small" weight="700">{r.rating}</Text><Text variant="small" muted> / 5</Text></Text>
              </View>
              <Text variant="tiny" muted>{fullDate(r.createdAt) || r.date}</Text>
            </View>
          </View>

          {r.text ? <Text variant="body" style={s.full}>{r.text}</Text> : <Text variant="small" muted style={s.full}>No written comment, just a {r.rating}-star rating.</Text>}

          {provider && (
            <Pressable onPress={here ? undefined : () => go(`/u/${provider.id}`)} style={s.for} accessibilityRole={here ? undefined : 'link'}>
              <Avatar uri={provider.avatar} name={provider.name} size="sm" />
              <Text variant="small" style={s.grow}>
                Review of <Text variant="small" weight="700">{provider.name}</Text>
                {!!booking?.packageName && <Text variant="small" muted> · {booking.packageName}</Text>}
                {!!booking?.completed && <Text variant="small" muted> · {booking.completed}</Text>}
              </Text>
              {!here && <ChevronRight size={16} color={c.muted} />}
            </Pressable>
          )}

          <View style={[s.inline, s.mt]}>
            <ShieldCheck size={13} color={c.muted} />
            <Text variant="tiny" muted style={s.grow}>From a completed booking. Only clients who booked can leave a review.</Text>
          </View>

          {!!r.authorId && (
            <Button title={`View ${first ? `${first}’s` : 'their'} profile`} block onPress={() => go(`/u/${r.username || r.authorId}`)} style={s.mt} />
          )}
        </View>
      )}
    </Sheet>
  )
}

const useStyles = makeStyles((t) => ({
  review: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.c.line, gap: 6 },
  pressed: { opacity: 0.75 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  date: { flex: 1, textAlign: 'right' },
  grow: { flex: 1, minWidth: 0 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  full: { marginTop: 14, lineHeight: 22 },
  for: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 10, borderRadius: t.radius.md, backgroundColor: t.c.soft },
  mt: { marginTop: 14 },
}))
