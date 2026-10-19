# Frontend data layer

All data shown in the app comes from Supabase. Screens never build queries themselves: they call functions in `frontend/src/api/` and get plain objects back.

## Posting rework (2026-10-19): editing, before & after, retry, resume

Shared plain-JS changes (the Expo app imports `api/portfolio.js` directly; `lib/images.js` is swapped for `mobile/src/shims/images.ts`, and `api/portfolio.js` still only needs `fileExtension`, `makeDisplayCopy`, `readCameraSettings` from it). Nothing old changed meaning except that new posts start hidden:

- **`postAlbum()`** (same signature, all additive): the album is created with `status: 'hidden'` and set to `'published'` (plus `cover_photo_id`) once every photo is up, so clients never see half a post; on failure it is deleted as before. File items may now carry `recipe` (saved as `photos.edit_recipe` when the column exists, silently dropped when it doesn't) and `pairRole` ('before' | 'after'); a ready-made `display` ({ blob, width, height }, e.g. an edited render) is used as the public copy. Items sharing **the same `file` object** upload that original once (a before & after made from one edit: both rows point at one `original_path`). New options `coverIndex`, `signal` (AbortSignal; the thrown error has `.cancelled`). Network / 5xx hiccups are retried twice per photo.
- **Step by step** (per-photo progress, retry, cancel, resume): `createPostDraft(meta) → albumId` (hidden), `uploadPostPhoto({ userId, albumId, position, item, hiddenFields, originalPath?, onProgress, signal, retries }) → { photoId, displayPath, originalPath, width, height }` (cleans up its own files on failure), `publishPost(albumId, { coverPhotoId })`, `discardPostDraft(albumId)`. Helpers: `originalOwners(items)`, `isCancelled(err)`, `editRecipeSupported()`.
- **A posted post's photos:** `getPostPhotos(albumId)` (rows + `edit_recipe` + `src`), `reorderPostPhotos(albumId, photoIds, { kind })` (first = cover), `setPostCover(albumId, photoIds, coverId)`, `replacePostPhoto({ userId, albumId, photo, photos, item })` (same position / pair role / hidden settings), `removePostPhoto(albumId, photo, photos)`, `convertPost(albumId, 'before_after' | 'album', { beforeId, afterId, photoIds })`. Re-editing and reverting are in `api/edits.js` (`saveEdit`, `revertEdit`, `loadEditSource`, `loadOriginalUrl`).
- **Pure helpers:** `suggestPostTitle({ service, shotOn, location })` → "Wedding in Los Angeles, Sep 2026"; `photoHints({ width, height, size, duplicateOf })` → `[{ kind: 'lowres' | 'large' | 'duplicate', text }]` (non-blocking notes).
- **`lib/images.js` (web only):** HEIC/HEIF is converted to JPEG in the browser with `heic-to` (lazy chunk, only when the browser can't decode it; the HEIC original is still what's uploaded privately). New `isHeic`, `toDecodable`, `displayFromRender`, `previewFromBlob`, `fingerprint` (duplicate check), `LARGE_FILE_BYTES`; `makePreview` / `makeDisplayCopy` accept any Blob.
- **Web only:** `components/upload/usePostQueue.js` + `uploadQueue.js` save the post being uploaded in IndexedDB (`pm-posting`), so `/upload` offers "Finish posting …?" after the tab closed; My Work marks that hidden draft "Unfinished".

## Removed in the photography pivot (2026-10-18)

photomatch is photography only again: **one vertical, `photography` ("Photo & video")**, whose creators sell photo and/or video work. The multi-vendor code is kept, not built, in `archive/event-platform/frontend/src/` (same relative paths) and in the git tag `multi-vendor-snapshot`. Shared plain-JS changes (the Expo app imports these):

- **Files gone** (archived): `api/events.js` (incl. `eventForConversation`, `eventIdForConversation`), `api/planner.js`, `lib/planBrief.js`, `verticals/fields.js`, `verticals/<slug>/config.js` for every vertical except photography (videography's fields merged into `verticals/photography/config.js`).
- **`verticals/catalog.js`** (rewritten): `VERTICALS` has one entry (`photography`, name "Photo & video", noun "photographer", plural "Photographers", new `pluralLong` "Photographers & videographers"). Its services are the photo services plus the video ones (`wedding-film`, `event-recap`, `social-reels`, `music-video`, `drone`); each service now has `kind` ('photo' | 'video') and `icon`. **New:** `PHOTO_VERTICAL`, `LEGACY_VERTICALS` (`{ videography: 'photography' }`), `normalizeVertical(slug)`, `isPhotoVertical(slug)`, `SERVICE_CHIPS` (services for browse chips, without coaching/meetups). **Deprecated, harmless:** `OCCASIONS` is `[]`, `GROUPS` has one group, `getOccasion()` returns `undefined`, `verticalsInGroup()`.
- **`verticals/index.js`**: same API. `verticalMeta(null)` and `'videography'` give photography; `GENERIC` now says "photographer"; `occasionsFor()` returns `[]`; `autoPostTitle({ service })` ignores `occasion`; `matchesFilters` has no guests filter; `sessionNoun` → 'shoot', `deliversMedia` → true. The package editor offers only `fixed` / `hourly` / `quote` (`PRICE_TYPES` still labels old per-person / per-item / daily packages).
- **`api/catalog.js`**: every query keeps only photo & video listings (the live DB may still hold caterers, venues...). `getCategories()` returns `[photography]`; `getServices()` ignores its argument; `countProvidersByVertical()` returns `{ photography: n }`; `listProviders({ vertical })` / `searchProviders({ vertical })` give `[]` for any other vertical; `getProvider(id)` returns null for a non-photo listing.
- **`api/portfolio.js`**: removed `creditsSupported`, `listCredits`, `setAlbumCredits`, `searchVendors`, `listTaggedAlbums`, `setAlbumOccasion` (archived in `archive/.../api/portfolio.credits-and-occasions.js`). Albums no longer have `credits`; `postAlbum` / `updateAlbum` ignore `occasion` and `credits`. `getMyProviders` returns only photo & video listings; `getServicesOf()` returns photo + video services matched by slug; `becomeProvider` always creates a photography listing.
- **`api/home.js`**: removed `buildVerticalPage`, `liveVerticals`, `buildOccasionChecklist`, `occasionPrompt`, `readCovered`, `writeCovered`, `deckVerticals`, `deckChoices`, `verticalsWithPosts`. `buildHomeFeed()` returns `{ counts, services, shelves }` (no `live` / `soon`); `exploreFilters()` returns `{ services }` (plus empty `verticals`, `allVerticals`, `occasions`). New: `serviceCounts(providers, posts?)`.
- **`api/discover.js`**: no vertical picker. `getDeck({ service })` works on the whole photo & video deck (`vertical` "all"/"photography" = everything, any other vertical gives `[]`; `occasion` still filters old occasion-tagged posts). `normalizeDeckChoice` returns `{ vertical: 'all', service, occasion: null }`.
- **`api/messages.js`**: events can't be shared any more (`shareSupport().event` is false, `shareToChats({ kind: 'event' })` throws). Old event cards come back as `{ kind: 'event', title, available: false }` and render as a "Shared an event" stub; `shareLink()` returns null for events and plans. Event conversations (`kind 'event'`) are plain group chats.
- **`api/bookings.js`**: `requestBooking` no longer takes `eventId`; booking lists hide bookings with non-photo listings.

## Where things live

| File | What it does |
|---|---|
| `src/lib/supabase.js` | The browser client (publishable key; Row-Level Security decides what each user sees). |
| `src/lib/useQuery.js` | `const { data, loading, error, reload, setData } = useQuery(() => fn(args), [deps])`. Pass `null` instead of a function to skip loading (e.g. while signed out). |
| `src/lib/format.js` | `money`, `priceLabel`, `startingPrice`, `avatarUrl`, `photoUrl`, `statusLabels`, `bookingSteps`, `policyFromRules`, `toPackage`, `exifLine`, `ACTIVE_STATUSES`, `PAID_STATUSES`. |
| `src/lib/dates.js` | `today()`, `TODAY`, `toKey`/`fromKey` (`YYYY-MM-DD`), `parseDates`, `addDays`, `fmtBooking`, `fmtChip`, `fmtMonth`, `fmtTime`, `ago`, `isPast`. |
| `src/components/States.jsx` | `<Loading/>`, `<EmptyState icon title text action compact/>`, `<ErrorState error onRetry/>`, `<SignInPrompt title text/>`. Use these for every loading, empty and signed-out state. |
| `src/api/catalog.js` | Photographers (photo & video listings only), services, reviews, availability, search, "% match". |
| `src/verticals/` | `catalog.js` (the one vertical, `photography` "Photo & video", and its photo + video services) and `index.js`, the registry: `verticalMeta`, `verticalConfig` (package/provider fields, filters, price types, booking quantity), `priceSuffix`, `quantityFor`, `attributeLines`, `cleanAttributes`, `nounFor`/`countLabel`. Plain JS (shared with mobile). |
| `src/components/verticals/` | Web pieces: `VerticalIcon` (lucide name → icon), `PackageFields` (form from a field config), `AttributeList` (display). |
| `src/api/portfolio.js` | Albums (read, post step by step, manage a post's photos), photographer onboarding. |
| `src/api/discover.js` | Swipe feed, swipe logging and undo, taste profile, "Not into this". |
| `src/api/bookings.js` | Bookings as client and as photographer, plus every booking action. |
| `src/api/messages.js` | Conversations, messages, realtime, inquiries, sharing posts and photographers. |
| `src/api/home.js` | Home feed, Explore grid, post index, service counts. |
| `src/api/social.js` | Follows, shortlist (saved photographers), collections (saved photos). |
| `src/store.jsx` | Signed-in user's app-wide state: `myProvider`, `following`, `shortlist`, `liked`, `saved`, `corrections`, toggles, `toast`, `mode`. |
| `src/auth.jsx` | `useAuth()`: `user`, `profile` (the `profiles` row), `session`, `loading`, `signOut`, `refreshProfile`. |

## The objects screens get

### Photo & video (the one vertical)

Every provider is a **photographer** (photo and/or video work) in the vertical `photography`, named "Photo & video". The live database may still hold listings from the multi-vendor days (caterers, venues...) until the pivot's DB cleanup runs: the API filters them out everywhere (`isPhotoVertical`), and a listing still filed under `videography` reads as photography.

**Wording** (decided once): a creator is a "photographer" in compact UI (counts, card kinds, "Find a photographer"); headline copy says "photographers & videographers" (`verticalMeta().pluralLong`); the vertical's name is "Photo & video"; a booking is a "shoot". The web wordmark stays "photomatch".

| Function | Returns |
|---|---|
| `getCategories()` | `[photography]` merged with the database by slug: `{ id\|null, slug, name, noun, plural, pluralLong, icon, tint, priceUnit, visual, tagline, live, services: [{ id\|null, slug, name, kind 'photo'\|'video', icon, vertical, live }] }`. |
| `getVerticalInfo(slug)` | `getCategories()[0]` for `'photography'` / `'videography'`, else null. |
| `getServices()` | Services in the database, for pickers: `[{ id, slug, name, vertical }]` (photo + video, matched by slug). |
| `listProviders()` | Active photo & video providers. |
| `searchProviders({ service, dates, maxPrice, minRating, proOnly })` | `service` is a service slug (`category` still works as the old name). |
| `serviceCounts(providers, posts?)` (`api/home.js`) | `SERVICE_CHIPS` with `providers` / `posts` counts, for chips. |
| `getMyProviders(userId)` / `getMyProvider(userId, pick)` (`api/portfolio.js`) | The user's photo & video listings (normally one; old accounts may have two). The store exposes `myProviders`, `myProvider` and `selectProvider(id)`. |
| `becomeProvider({ displayName, slug, city, serviceIds })` | Creates a photography listing. |
| `updateProviderAttributes(providerId, attrs)` (`api/provider.js`) | Saves a listing's custom fields. |

Field config: `verticals/photography/config.js`. Package fields are grouped (`group: 'photo'|'video'`, none = delivery): `edited_photos`, `editing_level` (photo); `film_minutes`, `highlight_minutes`, `raw_footage` (video); `turnaround_days`, `deliverables`, `second_shooter_included`. The keys must exist in the photography JSON Schema in `supabase/seed.sql` (it rejects unknown keys; the video keys need the pivot's DB update). The package editor offers `fixed` / `hourly` / `quote`. Old per-person / per-item / daily packages from the multi-vendor days still display (`priceLabel`, `quantityFor`).

Onboarding: `/new-listing` ("Set up your photography listing": name, link, city, what you shoot) then `/upload`. `/upload` uses the same form the first time someone posts. Camera settings (EXIF) are always offered.

Prices: `priceLabel(pkg)` gives "$1,200", "$150/hr", "Custom quote". `fromPriceLabel(provider)` gives "from $350".

**Provider** (`listProviders()`, `getProvider(id)`, `searchProviders()`):
`{ id, kind: 'provider', vertical ('photography'), verticalInfo { slug, name, noun, plural, icon, tint, group, priceUnit, visual, concurrent }, attributes {}, profileId, slug, name, shortName ("Maya" when the listing uses the owner's name, else the whole business name; use it in sentences like "Book …"), username, avatar, cover, covers[], albumCount, city, serviceArea, travelFee, specialties[], categories[], categorySlugs[], bio, rating (null if no reviews), reviewCount, idVerified, pro, tasteMatch (null unless withMatches), distanceKm (always null for now), followers, cancellationPolicy {label, tiers}, gear {bodies, lenses}, packages[], startingPrice, addons[]*, reviews[]*, workingDays[]* }`
`*` only from `getProvider`. `getProvider(id)` accepts a provider id, the owner's profile id, or a slug. `getPerson(id)` returns a provider, or a client `{ kind: 'person', id, name, username, avatar, city, bio, clientRating, clientReviews }`.

**Package**: `{ id, name, description, priceType 'fixed'|'hourly'|'quote' (old rows may also be 'per_person'|'per_item'|'daily'), price (dollars|null), hours, attributes {}, editedPhotos, editingLevel, turnaroundDays, deliverables[], depositPct }`. `quantityFor(pkg, vertical)` is null for photo & video packages.

**Booking** (`listMyBookings()`, `listProviderBookings(providerId)`, `getBooking(id)`):
`{ id, status, role 'client'|'provider', vertical ('photography'), quantity (null except on old per-person bookings), provider {id, vertical, name, avatar, ...}, client {id, name, avatar, rating, reviews}, pkg, packageName, addons [{name, price}], start, end, hours, day (Date), dateKey, date "Oct 21, 2026", time "4:00 PM", location, note, subtotal, travelFee, total, deposit, depositPaid, isActive, policy {label, tiers}, conversationId, history [{status, at}], expiresIn "41h", offer {id, total, message}|null, deliveryExpiresDays, reviewWindowOpen, myReview, theirReview }`

**Album** (`toViewerAlbum(row)` on rows from `listAlbums(providerId)`): `{ id, providerId, title, caption, location, date, genre, type 'photo'|'beforeafter', cover, autoTags[], occasion ({slug, name}, old posts only), photos [{ id, src, beforeSrc?, exif, autoTags }] }`. No `credits` any more.

**Discover card** (`getDeck({ service, limit, exclude, seen })`; the full API is listed at the top of `api/discover.js`): `{ kind: 'photo'|'vendor', id, photoId, albumId, authorId, providerId, provider, vertical, title, category, categorySlug, photos [{id, src, exif}], tags[], reason, exploration, score, exif }`. Photo cards (`getFeed({ limit, category })`) come from `discover_feed`, then posts it can't rank yet. Vendor cards (`id` `'v:<providerId>'`, `photoId`/`albumId` null, `lines` = key facts) are photographers with no posts, ranked by `discover_vendors()` or by `rankVendors()` in the browser. Swiping one logs `swipes.provider_id` only. Chips: `serviceCounts(listProviders(), listPostIndex())`.

**Conversation** (`listConversations()`, `getConversation(id)`):
`{ id, kind 'direct'|'group'|'booking'|'inquiry', isGroup, fromEvent (an old event chat, shown as a group whose members/name can't be changed), title, bookingId, booking, members [{id, profileId, name, avatar, username, isPhotographer, lastReadAt}], lastMessage {text, fromMe, at, senderId}, lastMessageAt, unread }`. `members` excludes me.

**Message** (`listMessages(id)`, `sendMessage(id, {text, sharedAlbumId})`): `{ id, from, mine, text, sharedAlbum {id, title, cover, providerId}|null, at, time }`.

**Starting conversations:**
- `startDirectMessage(profileId)` opens a one-to-one thread with anyone.
- `startInquiry(providerId)` asks a photographer a question.
- `createGroup(title, profileIds)` needs at least 2 other people.
- `addGroupMembers`, `renameGroup` and `leaveGroup` manage a group.
- `searchPeople(q)` finds people to message; with an empty query it returns people you've talked to.

All of these run as database functions, which enforce blocks: a blocked person can't message you in one-to-one threads.

**Live:**
- `openChat(id, { onMessage, onRead, onTyping })` returns `{ typing(), close() }`.
- `subscribeToInbox(onChange)` updates the inbox list and tab badge.

Errors for display come from `messageError(err)`.

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
- packages, add-ons, gear, working hours and blocked-off days for the test photographers
- 22 bookings in every state, with reviews (these drive ratings)
- chats, follows, and a shortlist for Brian's account.

It's safe to re-run. `supabase/demo/remove_demo_data.sql` undoes it (run that before deleting the test users).
