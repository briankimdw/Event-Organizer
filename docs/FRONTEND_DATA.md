# Frontend data layer

All data shown in the app comes from Supabase. Screens never build queries themselves: they call functions in `frontend/src/api/` and get plain objects back.

## Where things live

| File | What it does |
|---|---|
| `src/lib/supabase.js` | The browser client (publishable key; Row-Level Security decides what each user sees). |
| `src/lib/useQuery.js` | `const { data, loading, error, reload, setData } = useQuery(() => fn(args), [deps])`. Pass `null` instead of a function to skip loading (e.g. while signed out). |
| `src/lib/format.js` | `money`, `priceLabel`, `startingPrice`, `avatarUrl`, `photoUrl`, `statusLabels`, `bookingSteps`, `policyFromRules`, `toPackage`, `exifLine`, `ACTIVE_STATUSES`, `PAID_STATUSES`. |
| `src/lib/dates.js` | `today()`, `TODAY`, `toKey`/`fromKey` (`YYYY-MM-DD`), `parseDates`, `addDays`, `fmtBooking`, `fmtChip`, `fmtMonth`, `fmtTime`, `ago`, `isPast`. |
| `src/components/States.jsx` | `<Loading/>`, `<EmptyState icon title text action compact/>`, `<ErrorState error onRetry/>`, `<SignInPrompt title text/>`. Use these for every loading, empty and signed-out state. |
| `src/api/catalog.js` | Photographers, categories, reviews, availability, search, "% match". |
| `src/api/portfolio.js` | Albums (read and post), photographer onboarding. |
| `src/api/discover.js` | Swipe feed, swipe logging and undo, taste profile, "Not into this". |
| `src/api/bookings.js` | Bookings as client and as photographer, plus every booking action. |
| `src/api/messages.js` | Conversations, messages, realtime, inquiries. |
| `src/api/social.js` | Follows, shortlist (saved photographers), collections (saved photos). |
| `src/store.jsx` | Signed-in user's app-wide state: `myProvider`, `following`, `shortlist`, `liked`, `saved`, `corrections`, toggles, `toast`, `mode`. |
| `src/auth.jsx` | `useAuth()`: `user`, `profile` (the `profiles` row), `session`, `loading`, `signOut`, `refreshProfile`. |

## The objects screens get

**Provider** (`listProviders()`, `getProvider(id)`, `searchProviders()`):
`{ id, kind: 'provider', profileId, slug, name, username, avatar, cover, covers[], albumCount, city, serviceArea, travelFee, specialties[], categories[], categorySlugs[], bio, rating (null if no reviews), reviewCount, idVerified, pro, tasteMatch (null unless withMatches), distanceKm (always null for now), followers, cancellationPolicy {label, tiers}, gear {bodies, lenses}, packages[], startingPrice, addons[]*, reviews[]*, workingDays[]* }`
`*` only from `getProvider`. `getProvider(id)` accepts a provider id, the owner's profile id, or a slug. `getPerson(id)` returns a provider, or a client `{ kind: 'person', id, name, username, avatar, city, bio, clientRating, clientReviews }`.

**Package**: `{ id, name, priceType 'fixed'|'hourly'|'quote', price (dollars|null), hours, editedPhotos, editingLevel, turnaroundDays, deliverables[], depositPct }`

**Booking** (`listMyBookings()`, `listProviderBookings(providerId)`, `getBooking(id)`):
`{ id, status, role 'client'|'provider', provider {id, name, avatar, ...}, client {id, name, avatar, rating, reviews}, pkg, packageName, addons [{name, price}], start, end, hours, day (Date), dateKey, date "Oct 21, 2026", time "4:00 PM", location, note, subtotal, travelFee, total, deposit, depositPaid, isActive, policy {label, tiers}, conversationId, history [{status, at}], expiresIn "41h", offer {id, total, message}|null, deliveryExpiresDays, reviewWindowOpen, myReview, theirReview }`

**Album** (`toViewerAlbum(row)` on rows from `listAlbums(providerId)`): `{ id, providerId, title, caption, location, date, genre, type 'photo'|'beforeafter', cover, autoTags[], photos [{ id, src, beforeSrc?, exif, autoTags }] }`

**Discover card** (`getFeed({ limit, category })`): `{ id/photoId, albumId, authorId, provider, title, category, photos [{id, src, exif}], tags[], reason, exploration, exif }`

**Conversation** (`listConversations()`): `{ id, kind, title, bookingId, booking, members [{id, profileId, name, avatar}], lastMessage {text, fromMe, at}, lastMessageAt, unread }`. **Message**: `{ id, from, mine, text, sharedAlbum {id, title, cover, providerId}|null, at, time }`.

## IDs and links

- `/u/:id` takes a provider id, a profile id or a username/slug.
- Photographer pages use the **provider id**; clients use their **profile id**.
- Album viewer: `/gallery/:providerId?post=<albumId>` or `&photo=<photoId>`.

## Rules of thumb

- Everything a signed-out visitor can see (photographers, albums, reviews, search, Discover) works without an account. Bookings, Inbox and the Me tab show `<SignInPrompt/>`.
- Every list has an empty state. New accounts have no bookings, messages or likes.
- Booking changes go only through the `api/bookings.js` actions; errors come back as readable messages (`bookingError(err)`).

## Demo data

`supabase/demo/demo_data.sql` fills the dev database with:
- packages, add-ons, gear, working hours and blocked-off days for the 7 test photographers
- 22 bookings in every state, with reviews (these drive ratings)
- chats, follows, and a shortlist for Brian's account.

It's safe to re-run. `supabase/demo/remove_demo_data.sql` undoes it (run that before deleting the test users).
