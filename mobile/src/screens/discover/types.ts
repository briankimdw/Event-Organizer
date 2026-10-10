import type { Provider } from '@/types'

// A swipe deck card, as the shared api/discover.js getFeed() returns it.
export type DeckPhoto = { id: string; src: string; exif: Record<string, any> }
export type DeckCard = {
  id: string
  photoId: string
  albumId: string
  authorId: string
  provider: Provider
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
