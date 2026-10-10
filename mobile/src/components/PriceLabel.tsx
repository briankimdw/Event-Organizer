// A price as text. Formatting is the shared lib/format.js (priceLabel / fromPriceLabel),
// which knows every price type: fixed "$1,200", hourly "$150/hr", quote "Custom quote",
// and the multi-vertical units per_person "$65 / person", per_item "$85 each", daily "$3,500 / day".
//   <PriceLabel pkg={pkg} />          a package (toPackage shape: { priceType, price, ... })
//   <PriceLabel provider={p} />       "from $65 / person" for a provider card (nothing if unpriced)
import { fromPriceLabel, money, priceLabel } from '@shared/lib/format.js'

import { Text, type AppTextProps } from './Text'

export type PriceType = 'fixed' | 'hourly' | 'quote' | 'per_person' | 'per_item' | 'daily' | (string & {})

/** "$150/hr", "$65 / person", "Custom quote"... for a package-like { priceType, price }. */
export const priceText = (pkg: { priceType?: PriceType | null; price?: number | null }) => priceLabel(pkg as any) as string

/** "from $65 / person", or null when the provider has no priced package. */
export const fromPriceText = (provider: { packages?: any[]; startingPrice?: number | null }): string | null =>
  typeof fromPriceLabel === 'function'
    ? fromPriceLabel(provider)
    : provider.startingPrice != null ? `from ${money(provider.startingPrice)}` : null

type Props = Omit<AppTextProps, 'children'> & {
  pkg?: { priceType?: PriceType | null; price?: number | null } | null
  provider?: { packages?: any[]; startingPrice?: number | null } | null
}

export function PriceLabel({ pkg, provider, variant = 'small', weight = '600', ...rest }: Props) {
  const text = pkg ? priceText(pkg) : provider ? fromPriceText(provider) : null
  if (!text) return null
  return <Text variant={variant} weight={weight} {...rest}>{text}</Text>
}
