import type { Provider } from '@/types'

// A swipe deck card, as the shared api/discover.js getDeck() returns it. Two kinds:
//   'photo'  a portfolio photo - verticals with posts
//   'vendor' the vendor itself (album covers as photos when they have any) - vendors with no
//            posts, incl. the non-visual verticals (DJs, planners, officiants, staff...).
//            Swipes are logged on swipes.provider_id with no photo.
export type DeckPhoto = { id: string; src: string; exif: Record<string, any>; credit?: string | null }
type CardBase = {
  id: string
  authorId: string // provider id
  providerId: string
  provider: Provider
  vertical: string
  occasion: { slug: string; name: string } | null
  title: string | null
  category: string | null
  categorySlug: string | null
  photos: DeckPhoto[]
  tags: string[]
  reason: string | null
  exploration: boolean
  score: number
  exif: string
}
export type PhotoDeckCard = CardBase & { kind: 'photo'; photoId: string; albumId: string }
export type VendorDeckCard = CardBase & { kind: 'vendor'; photoId: null; albumId: null; lines: string[] }
export type DeckCard = PhotoDeckCard | VendorDeckCard

export type SwipeAction = 'like' | 'pass' | 'save'
// One swipe this session (the store's discoverHistory entries).
export type HistoryEntry = {
  id: string
  action: SwipeAction
  swipeId: string | null
  providerId: string
  card: DeckCard
  addedToShortlist: boolean
}
