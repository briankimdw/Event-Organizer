// Provider sections on Home, fed by the shared catalog api:
//   ProviderShelf  - a horizontal row of big tiles
//   ProviderList   - a vertical list of rows
// Each takes the providers to show plus its own loading/error state, so Home
// (or a redesigned Home) decides what goes where.
import { ScrollView, View } from 'react-native'

import { ErrorState, Loading, ProviderCard, SectionHeader, Text } from '@/components'
import { makeStyles } from '@/theme'
import type { Provider } from '@/types'

type SectionProps = {
  title: string
  sub?: string
  providers: Provider[]
  loading?: boolean
  error?: { message?: string } | null
  onRetry?: () => void
  onSeeAll?: () => void
  emptyText?: string
}

export function ProviderShelf({ title, sub, providers, loading, error, onRetry, onSeeAll, emptyText }: SectionProps) {
  const s = useStyles()
  return (
    <View>
      <SectionHeader title={title} sub={sub} onSeeAll={onSeeAll} />
      {loading && !providers.length ? <Loading inline /> : null}
      {error ? <ErrorState error={error} onRetry={onRetry} /> : null}
      {!loading && !error && !providers.length && !!emptyText && <Text variant="small" muted style={s.pad}>{emptyText}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} variant="tile" />
        ))}
      </ScrollView>
    </View>
  )
}

export function ProviderList({ title, sub, providers, loading, error, onRetry, onSeeAll, emptyText }: SectionProps) {
  const s = useStyles()
  return (
    <View>
      <SectionHeader title={title} sub={sub} onSeeAll={onSeeAll} />
      <View style={s.pad}>
        {loading && !providers.length ? <Loading inline /> : null}
        {error ? <ErrorState error={error} onRetry={onRetry} /> : null}
        {!loading && !error && !providers.length && !!emptyText && <Text variant="small" muted>{emptyText}</Text>}
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} variant="row" />
        ))}
      </View>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  shelf: { paddingHorizontal: t.space.lg, gap: 10, paddingBottom: 4 },
  pad: { paddingHorizontal: t.space.lg },
}))
