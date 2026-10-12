// Small pure helpers for deck cards (no data fetching): what a vendor card shows, and the
// one-element screen-reader label of a card. The facts come from the shared api/discover.js
// (card.lines = vendorFacts(provider).lines) and lib/format.js (priceLabel / fromPriceLabel).
import { cardWords } from '@shared/api/discover.js'
import { providerA11yLabel } from '@/components'
import { fromPriceText } from '@/components/PriceLabel'
import type { Package, Provider } from '@/types'
import type { DeckCard, VendorDeckCard } from './types'

export const isVendor = (c: DeckCard | null | undefined): c is VendorDeckCard => c?.kind === 'vendor'

/** Up to 2 packages for a vendor card (cheapest priced first, quotes last) and how many more. */
export function packagePreview(p: Provider) {
  const all = [...(p.packages || [])] as Package[]
  const packages = all.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)).slice(0, 2)
  return { packages, more: Math.max(0, all.length - packages.length) }
}

/** What a screen reader says for the whole card, in one go. */
export function cardA11yLabel(card: DeckCard, shot: number, match: number | null) {
  const p = card.provider
  if (card.kind === 'vendor') {
    const n = p.packages?.length || 0
    return providerA11yLabel({ ...p, tasteMatch: match } as Provider, [
      card.photos.length > 1 && `photo ${shot + 1} of ${card.photos.length}`,
      card.photos.length === 0 && 'no photos yet',
      (card.lines || []).join(', '),
      n > 0 && `${n} package${n === 1 ? '' : 's'}`,
      card.reason,
    ])
  }
  const words = cardWords(card) as { thing: string; noun: string }
  return [
    `${card.title || words.thing[0].toUpperCase() + words.thing.slice(1)} by ${p.name}`,
    p.vertical !== 'photography' && words.noun,
    card.photos.length > 1 && `photo ${shot + 1} of ${card.photos.length}`,
    card.category,
    card.occasion?.name,
    p.idVerified && 'identity verified',
    p.pro && 'Verified Pro',
    p.rating != null ? `Rated ${p.rating.toFixed(1)} out of 5` : 'New, no reviews yet',
    fromPriceText(p),
    match != null && `${match}% taste match`,
    card.reason,
    card.photos[shot]?.credit,
  ].filter(Boolean).join(', ')
}
