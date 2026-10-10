// Shapes of the objects the shared api/* functions return, inferred from the JS
// (tsconfig allowJs), so they follow the web code automatically.
import type { getPerson, listProviders } from '@shared/api/catalog.js'

export type Provider = Awaited<ReturnType<typeof listProviders>>[number] & {
  freeDates?: string[]
  addons?: { id: string; name: string; price: number | null }[]
  reviews?: Review[]
  workingDays?: number[]
}
export type Person = NonNullable<Awaited<ReturnType<typeof getPerson>>>
export type Package = Provider['packages'][number]
export type Review = {
  id: string
  authorId?: string
  username: string | null
  bookingId?: string | null
  createdAt: string
  name: string
  avatar: string
  rating: number
  text: string
  date: string
}

// A vertical / occasion from verticals/catalog.js (the 18 service types, the occasions).
export type Vertical = (typeof import('@shared/verticals/catalog.js'))['VERTICALS'][number]
export type Occasion = (typeof import('@shared/verticals/catalog.js'))['OCCASIONS'][number]
