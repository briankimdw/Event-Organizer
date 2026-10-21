## Web app source (frontend/src)

The web app is a React 18 + Vite single-page app styled as a phone-sized frame on desktop. It talks straight to Supabase (Postgres + Row-Level Security + Storage + Realtime) through a small plain-JS data layer, plus two Python services for things the database can't do (the ML service in `services/ml` for AI photo tools and Discover ranking, and the FastAPI backend in `backend/` for booking gallery uploads).

**How it boots.** `frontend/index.html` loads `/src/main.jsx`, which wraps `<App />` in `BrowserRouter` → `AuthProvider` (`auth.jsx`, the Supabase session + the user's `profiles` row) → `StoreProvider` (`store.jsx`, app-wide signed-in state: follows, shortlist, likes, "Not into this", the selected listing, toasts) → `AvatarViewerProvider`, and imports the global `styles.css`. `App.jsx` holds every route (React Router v6), the bottom `TabBar` on the five tab routes (`/`, `/discover`, `/bookings`, `/inbox`, `/me`), the toast region, per-route page titles, focus management on navigation, and the redirect to `/welcome` for brand-new accounts.

**Layers.**
- `api/` — the data layer. One module per domain (catalog, bookings, messages, portfolio, discover…). Screens never call Supabase directly (a few auth screens are the exception); they call these functions, usually through `lib/useQuery.js`. **Shared with the Expo app**: `mobile/` imports these files as `@shared/api/...` via the Metro bridge in `mobile/metro.config.js`, and the e2e suite in `frontend/scripts/e2e` runs them in Node.
- `lib/` — helpers with no React UI: the Supabase client, formatting (money, prices, statuses), dates, image processing for posting, `useQuery`. Most are shared with mobile; `lib/supabase.js` and `lib/images.js` are swapped for native versions on mobile (Metro `REDIRECTS`).
- `lib/editor/` — the non-destructive photo editor's math (recipe format, geometry, colour pipeline, auto-enhance) shared with the mobile Skia editor, plus the WebGL renderer for the web.
- `verticals/` — the service catalog and per-vertical configuration (wording, price types, package fields). There is exactly one vertical now (`photography`, "Photo & video"), but screens stay generic and ask the registry.
- `components/` — reusable UI. Small generic pieces at the top level (Sheet, TopBar, States, Stars…), feature folders below (`editor/`, `upload/`, `discover/`, `map/`, `share/`, `beforeafter/`, `studio/`, `auth/`, `home/`, `verticals/`).
- `screens/` — one file per route (plus `Dashboard.jsx`, rendered inside `/me`).

**Conventions.**
- `api/`, `lib/` (except the browser-only files noted below), `verticals/`, `lib/editor/{recipe,geometry,colorMath,auto}.js` and `components/auth/authKit.js` are **plain JS with no React and no DOM**, because the Expo app imports them. `import.meta.env.VITE_*` is allowed there (mobile rewrites it with `mobile/babel/shared-env-plugin.js`), but `window`, `document`, `localStorage`, canvas etc. are not, except behind guards.
- CSS: global tokens and most classes live in `styles.css`; newer feature folders carry their own stylesheet with a class prefix (`au-` auth, `ba` before/after, `dc-` discover, `pe` editor, `hd-` home, `sh` share, `st` studio, `up-/pf-/lp-` upload), imported by the component that needs it.
- Heavy features load lazily: Leaflet maps (`components/map/LazyMap.jsx`), the photo editor and its renderer (`components/upload/editorBridge.jsx` via `import.meta.glob`), and Studio (`components/studio/StudioLayer.jsx`).
- Accessibility is a requirement (WCAG 2.2 AA pass in `0fca74f`): sheets use `useDialog`, tab groups use `tabs.js` roving focus, screens set titles with `useDocumentTitle`.

```
frontend/src/
├── main.jsx, App.jsx, auth.jsx, store.jsx, styles.css
├── api/            ai, bookings, catalog, discover, edits, gallery, home, locations, messages, portfolio, provider, social
├── lib/            database.types.ts, dates, format, galleryRules, geo, images, supabase, useQuery
│   └── editor/     auto, colorMath, geometry, recipe, renderWeb  + tests/ (node --test)
├── verticals/      catalog.js, index.js, photography/config.js
├── components/     AvatarViewer, Badges, Booking, DatePicker, Exif, FollowersSheet, GalleryUpload, Media, PeoplePicker,
│   │               PersonRow, PostSheets, ProfileLink, ProviderMap, Reviews, SearchLauncher, Segmented, Sheet, Stars,
│   │               States, TabBar, Toast, TopBar, tabs.js, useDialog.js, useDocumentTitle.js, useHorizontalScroll.js
│   ├── auth/       CodeInput, PasswordField, authKit.js, auth.css
│   ├── beforeafter/ BeforeAfter, Showcase, beforeafter.css
│   ├── discover/   Explore, SwipeDeck, VendorCard, discover.css
│   ├── editor/     PhotoEditor, CropOverlay, useRecipeHistory.js, editor.css
│   │   └── ai/     AiPanel, MaskPainter, aiImage.js
│   ├── home/       Cards, CatalogIcon, home.css
│   ├── map/        LazyMap, MapPreview, ServiceAreaEditor, mapKit
│   ├── share/      ShareCard, ShareSheet, share.css
│   ├── studio/     Studio, StudioLayer, studio.css
│   ├── upload/     CameraSettings, EditAllSheet, ListingPicker, ManagePost, PhotoPicker, PostFields, PostingStatus,
│   │               editorBridge, uploadQueue.js, usePhotoItems.js, usePostQueue.js, upload.css
│   └── verticals/  AttributeList, PackageFields, VerticalIcon
└── screens/        26 screens (AiReview … Welcome)
```

**Commits referenced below** (all by Brian unless marked; dates are 2026):

| sha | date | subject |
|---|---|---|
| `8367e87` | 10-08 | Add project plan and mobile React frontend prototype |
| `1fb7ec3` | 10-08 | Supabase database + auth setup (phases 0-2) |
| `9db1724` | 10-08 | Connect the frontend to Supabase; remove all mock data |
| `9758cd1` | 10-08 | Posting photos: real uploads to Supabase portfolio |
| `cbac712` | 10-08 | Sign-in: email link/code + Google, welcome step, auth-aware Me tab |
| `8184c56` | 10-08 | Sign-in: log in / create account with password, forgot + reset password |
| `ad812e8` | 10-08 | Frontend: profile, bookings calendar, date search, filters, album viewer |
| `682c20d` | 10-09 | Real messaging between people, photographer map, new posting flow |
| `6186e8d` | 10-09 | Map area search, tappable everything, AI event planner |
| `1f99925` | 10-10 | All event services, Home/Discover redesign, and the Expo app |
| `0fca74f` | 10-10 | Web: QA fixes, WCAG 2.2 AA accessibility pass, real-database e2e script |
| `b9b7a81` | 10-10 | Posting for every vertical, in-app sharing, events with friends, UI pass |
| `024a38b` | 10-10 | Booking gallery upload (received-only v1) — **Tim Phelps** |
| `83f478d` | 10-11 | Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches |
| `c7028db` | 10-12 | Discover for every vertical (web + mobile), demo vendor portfolios |
| `f5c6612` | 10-12 | Break the catalog <-> locations import cycle (parsePoint moves to lib/geo.js) |
| `fba56f4` | 10-19 | Photography-only pivot: web and mobile apps |
| `2914c32` | 10-19 | Web: photo editor, easier posting, before & after slider |
| `23f183e` | 10-19 | Mobile: native photo editor, easier posting, before & after slider |
| `8b9994d` | 10-20 | Studio (miniPaint) and AI photo tools for web and mobile |
| `5f6655d` | 10-20 | Cleanup: remove dead code, unused deps and stale docs |

No file under `frontend/src` has been renamed or moved since it was added. "Used by" paths are relative to `frontend/src` unless prefixed; **mobile:** paths are relative to `mobile/src` and go through `@shared/...`. Several shared files are also imported by archived code in `archive/event-platform/` (the multi-vendor snapshot); that is noted but it is not a live consumer.

### Root files

The entry point, the router, and the two app-wide React contexts.

#### `frontend/src/main.jsx`
- **What:** Mounts React into `#root` with `BrowserRouter`, `AuthProvider`, `StoreProvider` and `AvatarViewerProvider` around `<App />`, and imports `styles.css`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…".
- **Used by:** entry point — loaded by `frontend/index.html` (`<script type="module" src="/src/main.jsx">`).

#### `frontend/src/App.jsx`
- **What:** The route table (26 `<Route>`s, including `/post/:id` → `PostRedirect` and the `*` fallback), the phone frame layout, `TabBar` on tab routes, `Toast`, a `RouteAnnouncer` that sets default page titles and moves focus to `#main` on navigation, the skip link, and the redirect to `/welcome?next=…` when `useAuth().needsWelcome`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `main.jsx`.
- **Notes:** adding a screen = import it here, add a `<Route>`, and add a default title to `ROUTE_TITLES`. `TAB_ROUTES` decides where the tab bar shows.

#### `frontend/src/auth.jsx`
- **What:** `AuthProvider` / `useAuth()` — the Supabase session, the signed-in user's `profiles` row, `loading`, `refreshProfile`, `needsWelcome` (signed in but no display name yet) and `signOut`; plus `safeNext(next)` to sanitise post-sign-in redirects.
- **Made:** 2026-10-08 · `cbac712` · "Sign-in: email link/code + Google…" (Brian). **Last changed:** same commit.
- **Used by:** `App.jsx`, `main.jsx`, `store.jsx`, nearly every screen (`SignIn`, `Me`, `Upload`, `Profile`, `Chat`, `Search`…), `components/TabBar.jsx`, `components/discover/SwipeDeck.jsx`, `components/share/ShareSheet.jsx` (+20 more, 33 total).
- **Notes:** web only — mobile has its own `mobile/src/state/auth.tsx`.

#### `frontend/src/store.jsx`
- **What:** `StoreProvider` / `useStore()` — app-wide signed-in state synced with Supabase: `following`, `shortlist`, `liked`, `saved`, "Not into this" `corrections`, this session's `discoverHistory`, the user's listings (`myProviders`, `myProvider`, `selectProvider`, `refreshProvider`), `mode` (client | provider), and `toast(msg)`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `main.jsx`, `components/Toast.jsx`, `components/PostSheets.jsx`, `components/discover/SwipeDeck.jsx`, `components/share/ShareSheet.jsx`, `components/upload/ManagePost.jsx`, screens `Me`, `Profile`, `Upload`, `Gallery`, `Chat`, `Search`… (23 total).
- **Notes:** the selected listing is remembered in `localStorage` (`pm:selected-listing`). Screen-specific data (bookings, messages, profiles) is *not* kept here; screens load it via `api/`. Mobile has its own `mobile/src/state/store.tsx`.

#### `frontend/src/styles.css`
- **What:** The global stylesheet (~1,360 lines): design tokens on `:root` (`--bg`, `--ink`, `--muted`…), the phone frame, utilities, buttons/inputs, cards, badges, and sections per area (Discover, Home, Profile, Booking, Inbox & chat, Me & dashboard, Sheet & toast, photo viewer, Sign in, Posting…).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** CSS imported by `main.jsx`; the feature stylesheets in `components/*/` build on its tokens.

### api/

The data layer: plain JS modules that wrap Supabase queries, RPCs, Storage and Realtime, and return screen-friendly objects (camelCase, URLs resolved). Reads rely on Row-Level Security; most writes go through database functions (`supabase.rpc(...)`). **Everything here except `gallery.js` is imported by the Expo app**, so keep it free of React and DOM APIs. Most modules are also driven by the end-to-end suite (`frontend/scripts/e2e/lib/shim.mjs`, which redirects `lib/supabase.js` to a Node client). Overview of the shapes: `docs/FRONTEND_DATA.md`.

#### `frontend/src/api/ai.js`
- **What:** Client for the AI photo tools on the ML service (`services/ml`): `aiCapabilities()` (never throws), `removeBackground`, `eraseObject` (with a mask PNG), `upscale`, `UPSCALE_MAX_INPUT_EDGE`, `configureAi({ url, accessToken })`, and `AiError` / `AI_ERRORS` / `isCancel`. Sends the Supabase access token as a Bearer token; URL from `VITE_ML_URL`, else port 8000 on the page's host.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `components/editor/ai/AiPanel.jsx`; **mobile:** `screens/editor/ai/client.ts`.
- **Notes:** contract in `docs/AI_TOOLS.md`. Accepts Blobs (web) or `{ uri, name, type }` objects (React Native).

#### `frontend/src/api/bookings.js`
- **What:** Bookings for the signed-in user as client and as photographer: `listMyBookings`, `listProviderBookings`, `getBooking`, `toBooking`, `requestBooking`, `respondToBooking` (accept / decline / counter), `respondToOffer`, `cancelBooking`, `markDelivered`, `acceptDelivery`, `submitReview`, `bookingError`.
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** screens `Bookings`, `BookingRequest`, `BookingDetail`, `Delivery`, `Review`, `Chat`, `Dashboard`, `Home`, `Me`; e2e `frontend/scripts/e2e/lib/shim.mjs`; **mobile:** `screens/bookings/*` (Bookings, BookingDetail, BookingRequest, Delivery, NeedsAction, Review), `screens/inbox/Chat.tsx`, `screens/provider/Dashboard.tsx`, `screens/Me.tsx`.
- **Notes:** every state change is a database function (`request_booking`, `respond_to_booking`, `cancel_booking`, `mark_delivered`…), so business rules live in `supabase/migrations`, not here.

#### `frontend/src/api/catalog.js`
- **What:** Public read side of the marketplace: `getCategories`, `getServices`, `getVerticalInfo`, `listProviders`, `getProvider`, `toProvider`, `getPerson` / `toPerson`, `listReviews`, `reviewBooking`, `searchProviders` (RPC `search_providers`), `freeDays`, `availabilityByDay`, `getMatches` / `withMatches` ("% match" via `provider_matches`), and a small cache (`cached`, `invalidate`).
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** the most-imported data module (47): `store.jsx`; other api modules (`bookings`, `discover`, `home`, `locations`, `messages`, `provider`); screens `Search`, `Profile`, `Me`, `Gallery`, `BookingRequest`, `Upload`, `Dashboard`…; `components/discover/SwipeDeck.jsx`, `components/upload/ManagePost.jsx`; e2e shim; **mobile:** `state/store.tsx`, `types.ts`, `screens/Search.tsx`, `screens/profile/Profile.tsx`, `screens/discover/*`, `screens/provider/*` (+ ~10 more). Also archived code.
- **Notes:** every query keeps only photo & video listings (`isPhotoVertical`), so leftover multi-vendor rows never show, and legacy `videography` listings come back as photography. Call `invalidate(prefix)` after writes that change provider data.

#### `frontend/src/api/discover.js`
- **What:** Discover's swipe deck and taste model: `getDeck` (photo cards from RPC `discover_feed`, SigLIP-ranked, mixed with vendor cards from `discover_vendors` or the local `rankVendors`), `getFeed`, `getVendorCards`, `logSwipe` / `undoSwipe` / `likePhoto`, `getTasteProfile`, `addCorrections` / `removeCorrection` ("Not into this"), `hideVendor` / `unhideVendor`, `getDeckMatches`, deck wording (`deckWords`, `cardWords`) and saved deck choice helpers.
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `store.jsx`, `components/discover/SwipeDeck.jsx`, `components/discover/Explore.jsx`, `screens/Me.jsx`; e2e shim; **mobile:** `state/store.tsx`, `screens/discover/{SwipeDeck,SwipeCard,DeckSheets,Explore,cards}`, `screens/account/MeParts.tsx`.
- **Notes:** the long header comment is the API contract mobile relies on — keep names stable. The ranking itself lives in the database / ML service; this file only calls it.

#### `frontend/src/api/edits.js`
- **What:** Re-editing posted photos non-destructively: `editRecipeSupported`, `getEditablePhoto`, `loadOriginalUrl` (signed URL of the private original), `loadEditSource`, `saveEdit` (re-renders the public copy and stores `photos.edit_recipe`), `revertEdit`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `components/upload/editorBridge.jsx` (loaded lazily through `import.meta.glob`, so the scanner's static count understates it); **mobile:** `screens/provider/upload/postApi.ts`.
- **Notes:** originals live in the private `portfolio-originals` bucket. Needs migration `20261020000000_photo_edits.sql`.

#### `frontend/src/api/gallery.js`
- **What:** Tim's. `uploadGallery(bookingId, files, onProgress)` posts a booking's delivery photos to the FastAPI backend (`POST /bookings/:id/gallery`) with XHR progress; `API_URL` comes from `VITE_API_URL`, else port 8001 on the page's host.
- **Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Tim). **Last changed:** same commit.
- **Used by:** `components/GalleryUpload.jsx`.
- **Notes:** v1 backend only acknowledges what it received; nothing is stored. Uses `location.hostname`, so it's web-only (mobile doesn't import it).

#### `frontend/src/api/home.js`
- **What:** Data for Home and Discover's Explore grid. Fetchers `listBrowseProviders`, `weekendAvailability`, `listExplorePhotos`, `listPostIndex`; pure shapers `buildHomeFeed`, `buildExploreTiles`, `exploreFilters`, `exploreVendorTiles`, `mixExploreTiles`, `masonry`, `serviceCounts`, sorters (`byRating`, `byNewest`, `byMatch`), `comingWeekend`, `priceFrom`, `subtitleOf`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `screens/Home.jsx`, `components/home/Cards.jsx`, `components/discover/Explore.jsx`, `components/discover/SwipeDeck.jsx`, `api/discover.js`; **mobile:** `screens/home/Home.tsx`, `screens/home/Browse.tsx`, `screens/discover/Explore.tsx`, `screens/discover/SwipeDeck.tsx`. Also archived code.
- **Notes:** multi-vertical helpers removed in the pivot are archived in `archive/event-platform/frontend/src/api/home.multi-vertical.js`.

#### `frontend/src/api/locations.js`
- **What:** Where photographers are based and how far they travel: `parsePoint` (re-exported from `lib/geo.js`), `toEWKT`, `distanceKm`, `fmtKm`, bounding-box helpers (`parseBbox`, `fmtBbox`, `bboxCenter`, `inBbox`, `splitByArea`), `updateServiceArea`, `geocode` / `reverseGeocode`, and the browser's `getMyLocation` / `lastKnownLocation`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `screens/Search.jsx`, `screens/Dashboard.jsx`, `components/ProviderMap.jsx`, `components/map/ServiceAreaEditor.jsx`; **mobile:** `screens/Search.tsx`, `screens/provider/ServiceArea.tsx`, `components/map/{ProviderMap,ProviderMap.web,MapProviderCard}.tsx`. Also archived code.
- **Notes:** `getMyLocation` / `lastKnownLocation` use `navigator` and `localStorage` — web-only; mobile uses the rest.

#### `frontend/src/api/messages.js`
- **What:** Inbox and chat: `listConversations`, `getConversation`, `unreadCount`, `listMessages`, `sendMessage`, `markRead`, `openChat` (Realtime messages, read receipts, typing), `subscribeToInbox`, conversation creation (`startInquiry`, `startDirectMessage`, `createGroup`, `addGroupMembers`, `renameGroup`, `leaveGroup`), `searchPeople`, and in-app sharing (`shareToChats`, `shareLink`, `shareLabel`, `mergeShareTargets`, `shareSupport`).
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** screens `Inbox`, `Chat`, `NewMessage`, `Profile`; `components/TabBar.jsx` (unread badge), `PeoplePicker`, `PostSheets`, `share/ShareSheet`, `share/ShareCard`, `discover/SwipeDeck`; e2e shim; **mobile:** `screens/inbox/*`, `hooks/useUnreadCount.ts`, `components/share/ShareSheet.tsx`, `screens/profile/Profile.tsx`, `screens/discover/SwipeDeck.tsx`.
- **Notes:** event chats from the archived event platform come back as plain group chats (`fromEvent: true`); old shared events render as stubs.

#### `frontend/src/api/portfolio.js`
- **What:** Photographer listings and posts: `getMyProviders` / `getMyProvider`, `becomeProvider`, `getServicesOf`, `listAlbums` / `getAlbum` / `toViewerAlbum`, the step-by-step posting API (`createPostDraft`, `uploadPostPhoto` with XHR progress, `publishPost`, `discardPostDraft`, or `postAlbum` for all three), and post management (`updateAlbum`, `deleteAlbum`, `reorderAlbums`, `getPostPhotos`, `reorderPostPhotos`, `setPostCover`, `replacePostPhoto`, `removePostPhoto`, `convertPost`), plus `suggestPostTitle`, `photoHints`.
- **Made:** 2026-10-08 · `9758cd1` · "Posting photos: real uploads to Supabase portfolio" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `store.jsx`; screens `Upload`, `Gallery`, `Profile`, `MyWork`, `NewListing`, `Dashboard`, `AiReview`; `components/upload/{ManagePost,usePhotoItems,usePostQueue}`; e2e shim; **mobile:** `state/store.tsx`, `screens/provider/*` (Upload, ManagePost, MyWork, NewListing, Dashboard, AiReview, upload/PostPhotos, upload/uploadQueue), `screens/gallery/*`, `screens/profile/*`, `lib/beforeAfter.ts`.
- **Notes:** posts are created hidden and published only once every photo is up. Relies on `lib/images.js` only for `fileExtension`, `makeDisplayCopy`, `readCameraSettings` (mobile swaps that file).

#### `frontend/src/api/provider.js`
- **What:** The signed-in photographer's own business data: packages (`listMyPackages`, `createPackage`, `updatePackage`, `setPackageActive`), `updateProviderAttributes`, `listWorkingHours`, and blocked-off days (`listBlackouts`, `addBlackout`, `removeBlackoutDay`).
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…".
- **Used by:** `screens/Dashboard.jsx`; e2e shim; **mobile:** `screens/provider/Dashboard.tsx`.

#### `frontend/src/api/social.js`
- **What:** Follows (`listFollowing`, `listFollowers`, `follow`, `unfollow`), the shortlist of saved photographers (`listShortlist`, `addToShortlist`, `removeFromShortlist`), and photo collections (`listCollections`, `createCollection`, `addToCollection`, `removeFromCollection`, `defaultCollection`, `listSavedPhotoIds`, `listLikedPhotoIds`).
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…".
- **Used by:** `store.jsx`, `screens/Me.jsx`, `components/FollowersSheet.jsx`, `components/PostSheets.jsx`; e2e shim; **mobile:** `state/store.tsx`, `screens/profile/FollowersSheet.tsx`, `screens/account/MeParts.tsx`.

### lib/

Helpers with no screens of their own. Most are shared with mobile; the two browser-bound ones (`supabase.js`, `images.js`) are replaced on mobile by `mobile/src/lib/supabase.ts` and `mobile/src/shims/images.ts` through the `REDIRECTS` map in `mobile/metro.config.js`, so their *exports* must stay in sync with those native versions.

#### `frontend/src/lib/database.types.ts`
- **What:** TypeScript types generated from the Supabase schema (`Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `Constants`).
- **Made:** 2026-10-08 · `1fb7ec3` · "Supabase database + auth setup (phases 0-2)" (Brian). **Last changed:** same commit.
- **Used by:** `lib/supabase.js` (JSDoc type import only); **mobile:** `lib/supabase.ts`, `state/auth.tsx`.
- **Notes:** generated — don't edit. Regenerate with `npx supabase gen types typescript --project-id ktjvbajrfrbwpndforcy > frontend/src/lib/database.types.ts`. Not regenerated since 10-08, so it predates later migrations (photo edits, discover, etc.).

#### `frontend/src/lib/dates.js`
- **What:** Local-date helpers: `today` / `TODAY`, `toKey` / `fromKey` (`YYYY-MM-DD` keys used in URLs and the DB), `parseDates`, `addDays`, `isPast`, and formatters `fmtBooking`, `fmtChip`, `fmtMonth`, `fmtTime` (in a time zone), `ago` ("5m", "3h"…).
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** same commit.
- **Used by:** 39 files — `api/{bookings,catalog,home,provider}`, `components/DatePicker.jsx`, `components/discover/*`, `components/home/Cards.jsx`, screens `Bookings`, `BookingRequest`, `Search`, `Dashboard`, `Profile`…; e2e `frontend/scripts/e2e/lib/context.mjs`; **mobile:** `components/DatePicker.tsx`, `components/AvailabilityStrip.tsx`, `screens/bookings/*`, `screens/Search.tsx`, `screens/home/Home.tsx` (+ more). Also archived code.

#### `frontend/src/lib/format.js`
- **What:** Formatting and small lookups: money (`dollars`, `money`, `priceLabel`, `startingPrice`, `startingPackage`, `fromPriceLabel`), Storage URLs (`publicUrl`, `photoUrl`, `avatarUrl`), `callName`, booking status vocabulary (`bookingSteps`, `statusLabels`, `ACTIVE_STATUSES`, `PAID_STATUSES`), `policyFromRules`, `toPackage` (DB row → package object), `exifLine`.
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** 35 files — every `api/` module but `ai`/`edits`/`gallery`/`locations`/`portfolio`, `components/Booking.jsx` (re-exports the money helpers), `Badges`, `ProviderMap`, `discover/*`, screens `Chat`, `Dashboard`, `Me`; e2e shim; **mobile:** `components/PriceLabel.tsx`, `screens/bookings/*`, `screens/discover/*`, `screens/profile/Profile.tsx` (+ more). Also archived code.
- **Notes:** price unit suffixes come from `verticals/index.js` (`priceSuffix`). Status labels here are what every booking pill shows.

#### `frontend/src/lib/galleryRules.js`
- **What:** Tim's. Booking delivery-gallery upload rules: `GALLERY_MAX_PHOTOS` (100), `GALLERY_MAX_FILE_BYTES` (50 MiB), `GALLERY_ACCEPT`, and `checkGallery(files)` → `null` or a human-readable reason (handles HEIC files with no MIME type).
- **Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Tim). **Last changed:** same commit.
- **Used by:** `components/GalleryUpload.jsx`, `screens/Chat.jsx` (file input `accept`).
- **Notes:** must match `backend/core/gallery.py`, which says it is mirrored here. No imports on purpose (loadable from Node).

#### `frontend/src/lib/geo.js`
- **What:** `parsePoint(value)` — reads a PostGIS geography point from PostgREST (EWKB/WKB hex, GeoJSON or WKT) into `{ lat, lng }`; `valid(lat, lng)`.
- **Made:** 2026-10-12 · `f5c6612` · "Break the catalog <-> locations import cycle…" (Brian). **Last changed:** same commit.
- **Used by:** `api/catalog.js`, `api/locations.js` (which re-exports `parsePoint`; mobile gets it through there).
- **Notes:** exists only to break the `catalog` ↔ `locations` import cycle — don't import `api/` from here.

#### `frontend/src/lib/images.js`
- **What:** Photo handling for posting (browser): `quickCheck`, `isHeic`, `toDecodable` (converts HEIC with the lazily loaded `heic-to`), `makePreview` / `previewFromBlob`, `makeDisplayCopy` (2048 px public JPEG), `displayFromRender`, `readCameraSettings` (EXIF via `exifr`, no GPS), `fingerprint` (duplicate detection), `formatBytes`, `fileExtension`, `MAX_PHOTOS` (10), `MAX_FILE_BYTES` (50 MB).
- **Made:** 2026-10-08 · `9758cd1` · "Posting photos: real uploads to Supabase portfolio" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `api/portfolio.js`, `lib/editor/renderWeb.js`, `components/upload/{PhotoPicker,usePhotoItems,ManagePost}`, `components/GalleryUpload.jsx`, `screens/Upload.jsx`. On mobile, Metro swaps the whole file for `mobile/src/shims/images.ts`.
- **Notes:** uses canvas / `createImageBitmap` — browser-only. If you add an export that `api/portfolio.js` needs, add it to the mobile shim too.

#### `frontend/src/lib/supabase.js`
- **What:** The browser Supabase client (`supabase`), created from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (`frontend/.env.local`, template `frontend/.env.example`), with persisted, auto-refreshed sessions and magic-link detection.
- **Made:** 2026-10-08 · `1fb7ec3` · "Supabase database + auth setup (phases 0-2)" (Brian). **Last changed:** same commit.
- **Used by:** every `api/` module, `auth.jsx`, `lib/format.js`, `components/auth/authKit.js`, `components/PostSheets.jsx`, screens `SignIn`, `Welcome`, `ResetPassword`, `Me` (20 total). Swapped on mobile for `mobile/src/lib/supabase.ts`, and in e2e for `frontend/scripts/e2e/lib/supabase-shim.mjs`.
- **Notes:** uses the publishable key; RLS in `supabase/migrations` is what protects data.

#### `frontend/src/lib/useQuery.js`
- **What:** `useQuery(loader, deps)` → `{ data, loading, error, reload, setData }`. Pass `null` as the loader to skip (e.g. signed out). Ignores stale responses.
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** same commit.
- **Used by:** most screens (`Home`, `Search`, `Profile`, `Me`, `Chat`, `Bookings`, `Dashboard`, `Gallery`…) and data-loading components (`TabBar`, `Reviews`, `FollowersSheet`, `share/ShareSheet`, `discover/*`) — 25 in all; **mobile:** `hooks/useQuery.ts` (a typed wrapper around it).

### lib/editor/

The photo editor's engine. An edit is a **recipe**, a small JSON object stored in `photos.edit_recipe` and applied on top of the untouched original (non-destructive). `recipe.js`, `geometry.js`, `colorMath.js` and `auto.js` are plain JS shared with the native Skia editor in `mobile/src/screens/editor/`; `renderWeb.js` is the browser renderer. Full design: `docs/EDITOR.md`. Tests: `node --test frontend/src/lib/editor/tests/`.

#### `frontend/src/lib/editor/recipe.js`
- **What:** The recipe format (v1) and its rules: `defaultRecipe`, `normalize`, `toStorable`, `isIdentity`, `sameRecipe`, `effectiveAdjust` (adjust + preset × strength), `bakeFilter`, the slider list `ADJUSTMENTS` / `ADJUST_KEYS` with ranges, `clampAdjust`, `formatAdjust`, `ASPECTS` / `aspectRatio`, `PRESETS` / `getPreset`, `describe`, crop constants.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `components/editor/PhotoEditor.jsx`, `components/editor/useRecipeHistory.js`, `components/upload/editorBridge.jsx` (lazy glob), `api/edits.js`, `lib/editor/{geometry,renderWeb}.js`, all four tests; **mobile:** `screens/editor/contract.ts`, `screens/provider/Upload.tsx`.
- **Notes:** changing the shape means bumping `RECIPE_VERSION` and keeping `normalize` able to read old recipes — posted photos already store them.

#### `frontend/src/lib/editor/geometry.js`
- **What:** Crop / rotate / straighten / flip as math: `geometryMatrix` (output uv → source st), `orientedSize`, `outputSize`, `fitEdge`, crop validity and manipulation (`isValidCrop`, `fitCrop`, `fitScale`, `cropForAspect`, `constrain`, `moveCrop`, `resizeCrop`), `rotateRecipe`, `flipRecipe`, `mat3`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `lib/editor/renderWeb.js`, `components/editor/{PhotoEditor,CropOverlay}.jsx`, `components/editor/ai/aiImage.js`, `tests/geometry.test.js`; **mobile:** `screens/editor/contract.ts`.

#### `frontend/src/lib/editor/colorMath.js`
- **What:** The per-pixel colour pipeline written three ways that must agree: the math (header comment), a CPU reference `applyToPixel` (tests + Canvas2D fallback), and shader source — GLSL `FRAGMENT_SHADER` / `VERTEX_SHADER` for WebGL and `SKSL_SHADER` for React Native Skia, built from one `COLOR_FUNCTIONS` body. Also `uniformsFor(adjust, size)`, `srgbToLinear` / `linearToSrgb`, `LUMA`, noise helpers.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `lib/editor/renderWeb.js`, `lib/editor/auto.js`, `tests/colorMath.test.js`, `tests/auto.test.js`; **mobile:** `screens/editor/pipeline.ts`.
- **Notes:** if you change a slider's maths, change the comment, `applyToPixel` and `COLOR_FUNCTIONS` together, then run the tests.

#### `frontend/src/lib/editor/auto.js`
- **What:** Auto-enhance ("Auto" like Lightroom): `autoEnhance({ data, width, height })` analyses downscaled pixels (grey-pixel white balance, exposure search through the real pipeline, tone, vibrance) and returns slider values; `applyAuto`, `isAutoApplied`, `describeAuto`, `samplePixels`, `AUTO_KEYS`, `AUTO_SAMPLE_EDGE`.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `components/editor/PhotoEditor.jsx`, `components/editor/ai/aiImage.js`, `tests/auto.test.js`; **mobile:** `screens/editor/ai/auto.ts`.
- **Notes:** deliberately conservative — a good photo should come back almost untouched.

#### `frontend/src/lib/editor/renderWeb.js`
- **What:** Browser rendering of recipes: `loadWorkingImage`, `createRenderer(canvas)` (WebGL 1 with a Canvas2D fallback; `render(recipe, { mode: 'final' | 'crop' | 'original' })`), `exportEdit(source, recipe)` → 2048 px JPEG Blob with metadata stripped, `decodeSource`, `drawScaled`, `maxTextureSize`, `renderAspect`, `DISPLAY_EDGE`, `MAX_EXPORT_EDGE`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `components/editor/PhotoEditor.jsx`, `components/editor/ai/AiPanel.jsx`, `components/upload/editorBridge.jsx` (lazy glob, for "Edit all"), `api/edits.js` (dynamic).
- **Notes:** web-only (DOM). `DISPLAY_EDGE` must match `MAX_EDGE` in `lib/images.js`.

#### `frontend/src/lib/editor/tests/recipe.test.js`
- **What:** `node:test` suite for `recipe.js`: default/identity recipes, normalising bad input, clamping, presets, `toStorable`, `describe`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** not imported — tests run with `node --test frontend/src/lib/editor/tests/`.

#### `frontend/src/lib/editor/tests/geometry.test.js`
- **What:** `node:test` suite for `geometry.js`: the output→source matrix, oriented sizes, crop validity under straighten, move/resize/rotate/flip.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** not imported — `node --test frontend/src/lib/editor/tests/`.

#### `frontend/src/lib/editor/tests/colorMath.test.js`
- **What:** `node:test` suite for `colorMath.js`: sRGB curves, each slider's direction and neutrality, and that the GLSL / SkSL sources contain the shared functions.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** not imported — `node --test frontend/src/lib/editor/tests/`.

#### `frontend/src/lib/editor/tests/auto.test.js`
- **What:** `node:test` suite for `auto.js` on synthetic scenes (well exposed, under/over-exposed, colour casts): checks Auto corrects them and leaves good photos nearly alone.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** not imported — `node --test frontend/src/lib/editor/tests/auto.test.js`.

### verticals/

The service catalog and the vertical registry. The marketplace was multi-vendor until the 2026-10-18 pivot; now there is one vertical, `photography` ("Photo & video"), whose services include the former videography ones. Screens still ask this registry for wording, price types and form fields instead of hard-coding them. Plain JS, no imports from React/DOM — shared with mobile, and its slugs match `supabase/seed.sql`. The 17 removed vertical configs are in `archive/event-platform/frontend/src/verticals/` and the `multi-vendor-snapshot` git tag.

#### `frontend/src/verticals/catalog.js`
- **What:** The single source of truth for the catalog: `PHOTO_VERTICAL`, `VERTICALS` (one entry), the services and `SERVICE_CHIPS`, `LEGACY_VERTICALS` (`videography` → photography), `normalizeVertical`, `isPhotoVertical`, `getVertical`, `getService`, `verticalOfService`. Icons are lucide icon *names*.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `verticals/index.js` (re-exports everything — most code imports it from there), `api/home.js`; **mobile:** `lib/photo.ts`, `types.ts`, `screens/discover/SwipeDeck.tsx`, `screens/profile/Profile.tsx`. Also archived code.
- **Notes:** service slugs (`wedding`, `event`…) are stored in bookings, posts and `service_categories`; don't rename them.

#### `frontend/src/verticals/index.js`
- **What:** The vertical registry (re-exports `catalog.js`): `verticalMeta`, `verticalConfig` (price types, package/provider fields, card keys, filters, post wording), `PRICE_TYPES` / `priceSuffix`, `quantityFor`, `postConfig`, `autoPostTitle`, wording helpers (`nounFor`, `countLabel`, `lowerFirst`, `sessionNoun`, `deliversMedia`), field helpers (`optionsOf`, `optionLabel`, `formatField`, `attributeLines`, `attributeEntries`, `cleanAttributes`).
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** the most-imported file in `src` (54): `api/{bookings,catalog,discover,portfolio}`, `lib/format.js`, `components/verticals/*`, `components/upload/*`, `components/discover/*`, screens `Search`, `Profile`, `Upload`, `Dashboard`, `BookingRequest`…; **mobile:** ~25 files across `screens/bookings`, `screens/provider`, `screens/discover`, `screens/profile`, `components/map`, `components/Photo.tsx`. Also archived code.

#### `frontend/src/verticals/photography/config.js`
- **What:** Photo & video's config (default export): price types `fixed | hourly | quote`, `packageFields` (edited photos, editing level, film/highlight minutes, raw footage, turnaround, deliverables, second shooter), provider fields and post wording; also `EDITING_LEVELS`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `verticals/index.js` (mobile reaches it through there).
- **Notes:** field keys must match the photography JSON Schemas in `supabase/seed.sql` (they reject unknown keys).

### components/ (top level)

Small, generic UI pieces and hooks used across screens. They style themselves with classes from `styles.css`. Anything here that sits on top of the page (sheets, viewers) uses `useDialog.js` for focus trapping, Escape and `inert`. None of these are shared with mobile (it has native counterparts in `mobile/src/components`).

#### `frontend/src/components/AvatarViewer.jsx`
- **What:** Instagram-style full-screen profile-photo viewer: `AvatarViewerProvider` + `useAvatarViewer()` → `open({ src, name, username, to?, from? })`, plus `useLongPress(onLong, ms)` and `ViewableAvatar` (an avatar you can tap to enlarge).
- **Made:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…" (Brian). **Last changed:** same commit.
- **Used by:** `main.jsx` (provider), `components/ProfileLink.jsx` (long-press preview), `screens/Me.jsx`, `screens/Profile.jsx`.

#### `frontend/src/components/Badges.jsx`
- **What:** Trust badges `IdVerified`, `ProBadge`, `VerifiedClient`. Plain labels by default; `explain` makes a tap open a short "what this means" `Sheet`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `components/PersonRow.jsx`, `ProviderMap.jsx`, `discover/SwipeDeck.jsx`, `home/Cards.jsx`, screens `Profile`, `Search`, `Gallery`, `Me`, `Dashboard`.

#### `frontend/src/components/Booking.jsx`
- **What:** Booking display pieces: `StatusPill`, `StatusTimeline` (requested → … → completed), `PolicyTable` (cancellation policy); re-exports `money`, `priceLabel`, `fromPriceLabel`, `startingPrice` from `lib/format.js`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** screens `Bookings`, `BookingDetail`, `BookingRequest`, `Chat`, `Dashboard`, `Gallery`, `Home`, `Me`, `Profile`, `Search`; `discover/SwipeDeck.jsx`, `discover/VendorCard.jsx`.
- **Notes:** many screens import the money helpers from here only for back-compat; new code can import `lib/format.js` directly.

#### `frontend/src/components/DatePicker.jsx`
- **What:** Month calendar with multi-day selection (`selected`, `onToggle`), per-day status dots, `isDisabled`, controlled `month`.
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** `screens/Bookings.jsx` (calendar), `screens/Search.jsx` (date search).

#### `frontend/src/components/Exif.jsx`
- **What:** `ExifPanel` (default) — a photo's camera settings as icon rows (body, lens, focal length, aperture, shutter, ISO…).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** `screens/Gallery.jsx` (photo info sheet).

#### `frontend/src/components/FollowersSheet.jsx`
- **What:** Sheet listing who follows a photographer (`listFollowers`); each row opens that profile.
- **Made:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Profile.jsx`.

#### `frontend/src/components/GalleryUpload.jsx`
- **What:** Tim's. Sheet for a photographer uploading a booking's delivery gallery: summary of the picked files (validated by `lib/galleryRules.js`), upload with a progress bar via `api/gallery.js`, then a receipt that says plainly nothing was stored (v1).
- **Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Tim). **Last changed:** same commit.
- **Used by:** `screens/Chat.jsx` (booking chats in confirmed / in-progress / delivered state).

#### `frontend/src/components/Media.jsx`
- **What:** Back-compat wrapper `BeforeAfter({ src, beforeSrc, aspect })` that maps the old props onto `beforeafter/BeforeAfter.jsx`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** only `components/upload/editorBridge.jsx` (`PairPreview`).
- **Notes:** a leftover shim; new code should import `beforeafter/BeforeAfter.jsx` directly. Could be folded into `editorBridge.jsx`.

#### `frontend/src/components/PeoplePicker.jsx`
- **What:** Search people by name or @username (`searchPeople`) and pick one or several, with chips for the selection; `exclude` and `max` props.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/NewMessage.jsx`, `screens/Chat.jsx` (add people to a group).

#### `frontend/src/components/PersonRow.jsx`
- **What:** A person row (avatar, name, badges, `sub` line, `right` slot) linking to `/u/:id`; hold the avatar to preview it.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…".
- **Used by:** `screens/BookingDetail.jsx`, `screens/BookingRequest.jsx`.

#### `frontend/src/components/PostSheets.jsx`
- **What:** Three sheets for posts and profiles: `ShareSheet` (older "send to one of my chats or copy link"), `SaveSheet` (save a photo to a collection), `ModerationSheet` (report / block).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…".
- **Used by:** `screens/Gallery.jsx` (`SaveSheet`, `ModerationSheet`), `screens/Chat.jsx` (`ModerationSheet`), `screens/Profile.jsx` (`ModerationSheet`, and this `ShareSheet` only for client profiles without a listing).
- **Notes:** two share sheets exist — the newer one is `components/share/ShareSheet.jsx` (used for posts and photographers). Moderation writes straight to Supabase from here.

#### `frontend/src/components/ProfileLink.jsx`
- **What:** `ProfileLink` opens a profile and is safe inside other links and draggable cards (stops the outer handler); optional long-press photo `preview`. Also `PersonAvatar`.
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…" (Brian). **Last changed:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…".
- **Used by:** 14 — `PersonRow`, `FollowersSheet`, `Reviews`, `discover/{Explore,SwipeDeck}`, `home/Cards`, screens `Bookings`, `Chat`, `Dashboard`, `Gallery`, `Home`, `Inbox`, `Me`, `Review`.

#### `frontend/src/components/ProviderMap.jsx`
- **What:** Full-screen Leaflet map of photographers: avatar pins (clustered), service-radius circle and a compact card on tap, "Search this area" after panning (`onAreaChange`), locate-me.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** loaded lazily by `components/map/LazyMap.jsx` (`ProviderMap`), which `screens/Search.jsx` uses for its map view.
- **Notes:** never import it directly — that would pull Leaflet into the main bundle.

#### `frontend/src/components/Reviews.jsx`
- **What:** `ReviewList` (reviews from `listReviews`; tap the reviewer for their profile) and `ReviewSheet` (one review in full).
- **Made:** 2026-10-09 · `6186e8d` · "Map area search, tappable everything…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Profile.jsx` (Reviews tab).

#### `frontend/src/components/SearchLauncher.jsx`
- **What:** A button that looks like a search field and opens `/search`; shows the user's city if set.
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/Home.jsx`, `screens/Bookings.jsx`.

#### `frontend/src/components/Segmented.jsx`
- **What:** Segmented control (`role="tablist"`, one tab stop, arrow keys switch) from string or `{ value, label }` options.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** screens `Dashboard`, `Profile`, `SignIn`, `Upload`.

#### `frontend/src/components/Sheet.jsx`
- **What:** Bottom sheet rendered inside the phone frame; a modal dialog (focus in/trapped/restored, Escape closes) with `title` or `label`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** 19 — `Badges`, `FollowersSheet`, `GalleryUpload`, `PostSheets`, `Reviews`, `discover/SwipeDeck`, `editor/PhotoEditor`, `share/ShareSheet`, `upload/{EditAllSheet,ListingPicker,ManagePost}`, screens `BookingDetail`, `Chat`, `Dashboard`, `Gallery`, `Me`, `Search`, `Settings`, `Upload`.

#### `frontend/src/components/Stars.jsx`
- **What:** Star rating — read-only image ("Rated 4.5 out of 5") or, with `onChange`, an accessible radio group.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** `components/Reviews.jsx`, `screens/Profile.jsx`, `screens/Review.jsx`.

#### `frontend/src/components/States.jsx`
- **What:** Shared screen states: `Loading`, `EmptyState`, `ErrorState` (with retry), `SignInPrompt`.
- **Made:** 2026-10-08 · `9db1724` · "Connect the frontend to Supabase…" (Brian). **Last changed:** same commit.
- **Used by:** 27 — almost every screen, plus `FollowersSheet`, `PeoplePicker`, `PostSheets`, `discover/*`, `share/ShareSheet`.

#### `frontend/src/components/TabBar.jsx`
- **What:** The bottom tab bar (Home, Discover, Bookings, Inbox, Me) with a live unread badge on Inbox (`unreadCount` + `subscribeToInbox`).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** `App.jsx` (only on `TAB_ROUTES`).

#### `frontend/src/components/Toast.jsx`
- **What:** The always-present `aria-live` region that shows `useStore().toastMsg`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** `App.jsx`. Trigger a toast with `useStore().toast(msg)`.

#### `frontend/src/components/TopBar.jsx`
- **What:** Standard screen header (back button, title/subtitle, `right` slot); also sets the document title.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** 14 screens — `AiReview`, `BookingDetail`, `BookingRequest`, `Chat`, `Delivery`, `MyWork`, `NewMessage`, `NotFound`, `Profile`, `ResetPassword`, `Review`, `Search`, `Settings`, `Verify`.

#### `frontend/src/components/tabs.js`
- **What:** Keyboard support for single-tab-stop groups: `rovingKeyDown(selector)`, `onTablistKeyDown`, `onRadiogroupKeyDown` (arrows / Home / End).
- **Made:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…" (Brian). **Last changed:** same commit.
- **Used by:** `components/Segmented.jsx`, `components/Stars.jsx`, screens `Discover`, `Me`, `Search`.

#### `frontend/src/components/useDialog.js`
- **What:** `useDialog(ref, open, onClose)` — focus management for overlays (autofocus, Tab trap, Escape, `inert` on the rest of the phone frame, focus return); also `focusableIn(root)`.
- **Made:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…" (Brian). **Last changed:** same commit.
- **Used by:** `components/Sheet.jsx`, `discover/SwipeDeck.jsx`, `editor/PhotoEditor.jsx`, `studio/Studio.jsx`.

#### `frontend/src/components/useDocumentTitle.js`
- **What:** `useDocumentTitle(title)` sets "Title · PhotoMatch"; exports `APP_NAME`.
- **Made:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…" (Brian). **Last changed:** same commit.
- **Used by:** `App.jsx` (`APP_NAME`), `components/TopBar.jsx`, `screens/Upload.jsx`.

#### `frontend/src/components/useHorizontalScroll.js`
- **What:** `useHorizontalScroll(rootId)` makes horizontal rows (`.scroll-x`, `.h-scroll`, `.filters`, `.avail-strip`) drag- and wheel-scrollable with a mouse.
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…" (Brian). **Last changed:** same commit.
- **Used by:** `App.jsx` (on `#phone`).

### components/auth/

Pieces of the redesigned sign-in / sign-up / welcome / reset-password flow. `authKit.js` is plain JS shared with mobile; the rest is web UI. Styles are prefixed `au-`.

#### `frontend/src/components/auth/authKit.js`
- **What:** Pure auth helpers: `MIN_PASSWORD`, `CODE_LENGTH`, `USERNAME_RE`, `passwordRules`, `passwordStrength`, `coverMix` (collage covers from different photographers), `initials`, `usernameTaken(username, selfId)`.
- **Made:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…" (Brian). **Last changed:** same commit.
- **Used by:** `auth/CodeInput.jsx`, `auth/PasswordField.jsx`, screens `SignIn`, `Welcome`, `ResetPassword`; **mobile:** `screens/SignIn.tsx`, `screens/auth/AuthUI.tsx`, `screens/account/{Welcome,ResetPassword}.tsx`.
- **Notes:** shared with mobile despite living under `components/` — keep it DOM-free.

#### `frontend/src/components/auth/CodeInput.jsx`
- **What:** One-time-code entry drawn as boxes over a single real input (`autocomplete="one-time-code"`), so autofill, paste and screen readers work; `onComplete` fires on the last digit.
- **Made:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/SignIn.jsx`.

#### `frontend/src/components/auth/PasswordField.jsx`
- **What:** Password input with show/hide toggle and, with `meter`, a live strength bar and rules checklist.
- **Made:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/SignIn.jsx`, `screens/ResetPassword.jsx`.

#### `frontend/src/components/auth/auth.css`
- **What:** Styles for the auth screens, all prefixed `au-`, reading the shared tokens from `styles.css`.
- **Made:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** CSS imported by `screens/SignIn.jsx`, `Welcome.jsx`, `ResetPassword.jsx`, `AuthCallback.jsx`.

### components/beforeafter/

The before & after compare slider used for before/after posts everywhere (feed, viewer, profile, chat cards). Mobile mirrors the same spec natively.

#### `frontend/src/components/beforeafter/BeforeAfter.jsx`
- **What:** `BeforeAfter` (default + named) — draggable or toggle compare of `before` / `after` images with keyboard support, labels, horizontal/vertical orientation and a one-time hint; also `BeforeAfterBadge`, `BeforeAfterThumb`, the `BA` constants and `valueText`. The full prop spec is in its header comment.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Gallery.jsx`, `screens/Profile.jsx`, `discover/{SwipeDeck,Explore}.jsx`, `share/ShareCard.jsx`, `beforeafter/Showcase.jsx`, `components/Media.jsx`.
- **Notes:** without `before`, the before side fakes an unedited look with a CSS filter (old callers / drafts).

#### `frontend/src/components/beforeafter/Showcase.jsx`
- **What:** `BeforeAfterShowcase` — the "Before & after" row on a photographer's profile: their published before/after posts as live sliders.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Profile.jsx`.

#### `frontend/src/components/beforeafter/beforeafter.css`
- **What:** Compare-slider styles (`.ba`, driven by the `--ba-pos` custom property).
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** CSS imported by `beforeafter/BeforeAfter.jsx`.

### components/discover/

The two modes of `/discover`: the swipe deck ("For you") and the Explore masonry grid. Data comes from `api/discover.js` and `api/home.js`.

#### `frontend/src/components/discover/SwipeDeck.jsx`
- **What:** The "For you" deck: draggable photo and vendor cards, like / pass / undo, fetching in small batches as you swipe (`getDeck`, `logSwipe`, `undoSwipe`), service chips (saved deck choice), "Not into this" and hide-vendor sheets, the taste profile, "% match", and message (`startInquiry`) / book / open-profile actions. Likes go through `useStore()`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Discover.jsx`.
- **Notes:** the biggest component (~950 lines). Batch sizes (`BATCH`, `BATCH_SIGNED_OUT`, `LOW_WATER`) were tuned with `services/ml/eval`.

#### `frontend/src/components/discover/Explore.jsx`
- **What:** The Explore tab: an Instagram-Explore / Pinterest-style masonry of real work, service chips (`?s=`), tinted tiles for photographers who haven't posted yet, paginated 24 at a time.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Discover.jsx`.

#### `frontend/src/components/discover/VendorCard.jsx`
- **What:** The face of a vendor card in the deck (`VendorFace`), its detail sheet (`VendorDetails`), and `useNextFree(providerId)` ("Free today" / "Free Sat, Oct 17" / "Booked up for 2 weeks").
- **Made:** 2026-10-12 · `c7028db` · "Discover for every vertical…" (Brian). **Last changed:** same commit.
- **Used by:** `discover/SwipeDeck.jsx`.

#### `frontend/src/components/discover/discover.css`
- **What:** Discover styles (header text tabs, Explore grid, vendor cards), prefix `dc-`, building on `.discover` / `.deck` in `styles.css`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** CSS imported by `screens/Discover.jsx`, `discover/Explore.jsx`, `discover/VendorCard.jsx`.

### components/editor/

The full-screen, Lightroom-style photo editor (dark theme regardless of app theme). It edits a **recipe** (see `lib/editor/`) on top of the original, renders live with WebGL, and exports a JPEG. It is never imported statically by the app: `components/upload/editorBridge.jsx` loads it on demand with `import.meta.glob`, so the posting flow still builds and works if the editor is missing. Docs: `docs/EDITOR.md`.

#### `frontend/src/components/editor/PhotoEditor.jsx`
- **What:** `PhotoEditor({ source, initialRecipe, onDone, onCancel, mode, allowBeforeAfter, … })` — tabs Presets / Light / Color / Effects / Crop / AI, sliders from `ADJUSTMENTS`, undo/redo, hold-to-compare, Auto, crop/rotate/straighten/flip, "make a before & after", and a hand-off to Studio for pixel edits; `onDone` gets `{ recipe, blob, … }` (or `pixelEdited`).
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** loaded lazily by `components/upload/editorBridge.jsx` (`EditorLayer`), which `screens/Upload.jsx` (new posts) and `upload/ManagePost.jsx` (re-editing posted photos) render.

#### `frontend/src/components/editor/CropOverlay.jsx`
- **What:** The crop box over the straightened frame: drag to move, 8 handles to resize (aspect-locked unless free), keyboard nudging; constrained by `lib/editor/geometry.js`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/PhotoEditor.jsx`.

#### `frontend/src/components/editor/useRecipeHistory.js`
- **What:** `useRecipeHistory(initial)` — the live recipe plus undo/redo; a burst of slider changes settles into one undo step (450 ms), max 100 steps.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/PhotoEditor.jsx`.

#### `frontend/src/components/editor/editor.css`
- **What:** Editor styles (`.pe`, its own dark palette `--pe-*`), including the AI tab.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…".
- **Used by:** CSS imported by `editor/PhotoEditor.jsx`. `tools/studio/studio-overrides.css` copies its colours.

### components/editor/ai/

The editor's AI tab: Auto, background removal / replacement, object erase with a painted mask, and upscale, backed by the ML service through `api/ai.js` (`docs/AI_TOOLS.md`).

#### `frontend/src/components/editor/ai/AiPanel.jsx`
- **What:** The AI tab UI: tools Auto / Background (remove, then solid colour, blur or transparent) / Erase (brush or area mask) / Upscale; checks `aiCapabilities()`, runs jobs with cancel, and applies results as a new base image with its own undo.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/PhotoEditor.jsx`.

#### `frontend/src/components/editor/ai/MaskPainter.jsx`
- **What:** Paint (brush mode) or draw rectangles (area mode, keyboard-operable) over the whole photo to mark what to erase; strokes are in 0..1 image units.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/ai/AiPanel.jsx`.

#### `frontend/src/components/editor/ai/aiImage.js`
- **What:** Canvas helpers for the AI tab (web-only): `canvasToBlob`, `blobToCanvas` (keeps transparency), `autoPixels` (downscaled pixels for `autoEnhance`), `cropRegion`, `blurredCopy`, `compositeCutout`, `drawStrokes`, `maskBlob`, `maskCoverage`, `downloadBlob`.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/PhotoEditor.jsx`, `editor/ai/AiPanel.jsx`, `editor/ai/MaskPainter.jsx`.

### components/home/

Building blocks for the Home screen's shelves of photographers.

#### `frontend/src/components/home/Cards.jsx`
- **What:** `SectionHead`, `RatingInline`, `ProviderCard` (cover, name, badges, price, rating; share button), `ProviderRow`, `CardsSkeleton`, `RowsSkeleton`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/Home.jsx`.

#### `frontend/src/components/home/CatalogIcon.jsx`
- **What:** `CatalogIcon` (a lucide icon by name from the catalog) and `TintIcon` (icon in a soft tinted circle).
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/Home.jsx`, `discover/{SwipeDeck,Explore,VendorCard}.jsx`.

#### `frontend/src/components/home/home.css`
- **What:** Home styles (`.tint-icon`, `hd-` classes), building on `styles.css`.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** CSS imported by `home/Cards.jsx`, `home/CatalogIcon.jsx`.

### components/map/

Leaflet + OpenStreetMap maps. Screens import **only** `LazyMap.jsx`; the other files are lazy chunks so Leaflet never lands in the main bundle. The full-screen photographer map itself is `components/ProviderMap.jsx` (one level up, for historical reasons).

#### `frontend/src/components/map/LazyMap.jsx`
- **What:** Lazy entry points `ProviderMap`, `MapPreview`, `ServiceAreaEditor`, each wrapped in `Suspense` with a same-size placeholder.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Search.jsx` (`ProviderMap`), `screens/Profile.jsx` (`MapPreview`), `screens/Dashboard.jsx` (`MapPreview`, `ServiceAreaEditor`).

#### `frontend/src/components/map/MapPreview.jsx`
- **What:** Small non-interactive map of one photographer's base and service radius.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** same commit.
- **Used by:** loaded lazily by `map/LazyMap.jsx`.

#### `frontend/src/components/map/ServiceAreaEditor.jsx`
- **What:** A photographer's own service area: search a place (`geocode`), drag the pin or tap the map, pick a travel radius from fixed stops (5–1000 km), save via `onSave`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** same commit.
- **Used by:** loaded lazily by `map/LazyMap.jsx` (shown in `Dashboard`'s service-area section).

#### `frontend/src/components/map/mapKit.jsx`
- **What:** Shared Leaflet bits: `Tiles` (OSM), `avatarIcon`, `clusterIcon`, `meIcon`, `circleBounds`, `pointsBounds`, `AutoSize`, `radiusStyle`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people, photographer map…" (Brian). **Last changed:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…".
- **Used by:** `components/ProviderMap.jsx`, `map/MapPreview.jsx`, `map/ServiceAreaEditor.jsx` (all lazy chunks).
- **Notes:** imports Leaflet at module top — only import it from lazy-loaded files.

### components/share/

In-app sharing ("Send to", like Instagram) of posts and photographers into chats, and how shared things render in a chat.

#### `frontend/src/components/share/ShareSheet.jsx`
- **What:** `ShareSheet({ item: { kind: 'post' | 'provider', id, … }, onClose })` — pick recent chats or people, add a note, send one message with a card to each (`shareToChats`); copy link and the system share sheet as secondary actions.
- **Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/Gallery.jsx`, `screens/Profile.jsx` (as `SendToSheet`), `home/Cards.jsx`, `upload/PostingStatus.jsx` (share after posting).
- **Notes:** not to be confused with the older `ShareSheet` in `components/PostSheets.jsx`.

#### `frontend/src/components/share/ShareCard.jsx`
- **What:** The card a shared post or photographer shows as in chat (opens it on tap); unavailable things and old shared events render as stubs.
- **Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing…" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Chat.jsx`.

#### `frontend/src/components/share/share.css`
- **What:** Styles for the share sheet and shared cards (`.sh`, `.share-card`).
- **Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** CSS imported by `share/ShareSheet.jsx`, `share/ShareCard.jsx`.

### components/studio/

Studio: a Photoshop-style pixel editor (miniPaint) running in a same-origin iframe from `frontend/public/studio/` (built by `tools/studio/build.mjs`). Docs: `docs/STUDIO.md`.

#### `frontend/src/components/studio/StudioLayer.jsx`
- **What:** `StudioLayer` — the one way the app opens Studio: lazy-loads `Studio.jsx` with a full-screen loading state. Also `STUDIO_RECIPE_NOTE` (pixel edits replace a photo's slider edits).
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** `editor/PhotoEditor.jsx`, `upload/ManagePost.jsx`.

#### `frontend/src/components/studio/Studio.jsx`
- **What:** `Studio({ source, name, onDone, onCancel, maxEdge, quality })` — hosts miniPaint in an iframe (`STUDIO_URL`), loads the image into it, and returns a flattened image on Done.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** loaded lazily by `studio/StudioLayer.jsx`.
- **Notes:** the ~1 MB `minipaint.js` only loads inside the iframe, never in the app bundle.

#### `frontend/src/components/studio/studio.css`
- **What:** Studio's full-screen dark chrome (`.st`, `--st-*`), drawn over the phone frame.
- **Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…" (Brian). **Last changed:** same commit.
- **Used by:** CSS imported by `studio/Studio.jsx`.

### components/upload/

The posting flow behind `/upload` (pick photos → edit → details → post with per-photo progress, retry, cancel and resume) and the owner's post-management sheets in the viewer. State lives in two hooks (`usePhotoItems`, `usePostQueue`); `editorBridge.jsx` is the only door to the editor. Base composer styles are in `styles.css` (`.up-/.pf-/.pp-/.ps-`), extras in `upload.css`.

#### `frontend/src/components/upload/editorBridge.jsx`
- **What:** On-demand access to the editor pieces via `import.meta.glob` (a missing file just disables the feature): `editorAvailable`, `EditorLayer` (lazy `PhotoEditor` full-screen), `loadEditsApi`, `loadRenderer`, `loadRecipes`, `editorPropsFor(item)`, `isPixelEdit`, `editKind`, and `PairPreview` (before/after preview).
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…".
- **Used by:** `screens/Upload.jsx`, `upload/ManagePost.jsx`, `upload/PhotoPicker.jsx` (`PairPreview`), `upload/EditAllSheet.jsx` (`loadRecipes`, `loadRenderer`).
- **Notes:** its globs are how `editor/PhotoEditor.jsx`, `api/edits.js`, `lib/editor/renderWeb.js` and `lib/editor/recipe.js` get loaded — a plain-text grep for `import ... from` misses them.

#### `frontend/src/components/upload/usePhotoItems.js`
- **What:** `usePhotoItems()` — the photos being prepared for a post: add (checks, HEIC conversion, previews, EXIF, duplicate fingerprint), reorder, cover, remove/undo, before/after slots, apply an edit (recipe or pixel edit) and keep the unedited base.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…".
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/usePostQueue.js`
- **What:** `usePostQueue(userId)` — posts photo by photo through `api/portfolio.js` (`createPostDraft` → `uploadPostPhoto` → `publishPost`) with per-photo progress, automatic retries, retry-one, cancel, publish-partial and resume after a closed tab; also `friendlyError`.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/uploadQueue.js`
- **What:** IndexedDB persistence (`pm-posting` DB) for an in-flight post so it can be resumed: `saveQueue`, `loadQueue`, `clearQueue`, `patchQueue`. Best-effort: silently unavailable in private windows.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** same commit.
- **Used by:** `upload/usePostQueue.js`, `screens/Upload.jsx` (resume prompt), `screens/MyWork.jsx`.

#### `frontend/src/components/upload/PhotoPicker.jsx`
- **What:** Step 1 of posting: pick/paste photos, order them, choose the cover, open the editor, or fill before & after slots (`mode: 'photos' | 'before_after'`); shows rejections and hints.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/PostFields.jsx`
- **What:** The details form pieces: `TitleField`, `CategoryField`, `CaptionField`, `PlaceDateFields`, `Disclosure`, `validatePost`, `LIMITS`, `todayKey`, `prettyDay`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Upload.jsx`, `upload/ManagePost.jsx` (edit details), `upload/CameraSettings.jsx` (`prettyDay`).

#### `frontend/src/components/upload/CameraSettings.jsx`
- **What:** The "camera settings" disclosure: which EXIF fields the photos carry and toggles to hide each; also `SETTING_FIELDS`, `readFields`, `settingsSummary`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/EditAllSheet.jsx`
- **What:** "Edit all": apply one preset (with strength) to every photo of the post, keeping each photo's own crop and adjustments; renders each with the lazily loaded renderer.
- **Made:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…" (Brian). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…".
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/ListingPicker.jsx`
- **What:** "Posting to" pill + sheet to pick which listing a post belongs to; renders nothing with fewer than two listings (only old multi-vendor accounts have two).
- **Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/PostingStatus.jsx`
- **What:** The posting screens: `Posting` (overall + per-photo progress, retry, cancel, publish what's up), `Posted` (success with share), `PostFailed`, and `overallFraction`.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** `screens/Upload.jsx`.

#### `frontend/src/components/upload/ManagePost.jsx`
- **What:** `ManagePostSheets` — owner-only sheets for a post in the viewer: menu, details form, photos manager (re-edit via the editor or Studio, back to original, replace, reorder, cover, convert to/from before & after) and delete confirmation.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…new posting flow" (Brian). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools…".
- **Used by:** `screens/Gallery.jsx` — rendered inside its `AlbumViewer` when a `manage` prop is passed (your own posts in `/gallery/:personId` and `/my-work`).

#### `frontend/src/components/upload/upload.css`
- **What:** Extra posting styles: listing picker (`lp-`), ideas, details (`up-`, `pf-`), and the "posting is for photographers" panel.
- **Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing…" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** CSS imported by `screens/Upload.jsx`, `upload/ListingPicker.jsx`, `upload/PostFields.jsx`.

### components/verticals/

Generic UI driven by the vertical registry (`verticals/index.js`), so field lists and icons aren't hard-coded in screens.

#### `frontend/src/components/verticals/AttributeList.jsx`
- **What:** Read-only display of a provider's or package's custom fields — a compact one-line summary (`compact`) or a label/value list.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Profile.jsx`, `screens/Dashboard.jsx`, `discover/VendorCard.jsx`.

#### `frontend/src/components/verticals/PackageFields.jsx`
- **What:** Form inputs for a vertical's custom fields (number, text, select, tags, boolean); run values through `cleanAttributes` before saving.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** same commit.
- **Used by:** `screens/Dashboard.jsx` (package and listing-details forms).

#### `frontend/src/components/verticals/VerticalIcon.jsx`
- **What:** `VerticalIcon` (lucide icon by name or vertical), `iconFor`, `CoverFallback`, `VerticalBadge`, `VerticalTag`. Icons are listed explicitly so the bundle only carries those.
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** `home/CatalogIcon.jsx`, `home/Cards.jsx`, `ProviderMap.jsx`, `upload/ListingPicker.jsx`, screens `Me`, `NewListing`, `Profile`, `Search`, `Upload`.
- **Notes:** adding a service with a new icon name? Add it to `ICONS` here (and the mobile equivalent), or it falls back to `Store`.

### screens/

One component per route, all imported statically by `App.jsx` (except `Dashboard.jsx`, which `/me` renders). Screens load data with `useQuery(() => api.fn(...))`, show `States.jsx` for loading/empty/error/signed-out, use `TopBar` (or their own header on tab screens), and keep shareable state (filters, dates, modes) in the URL. Mobile has a native counterpart for nearly every screen under `mobile/src/screens/` (separate code; only the `api/`/`lib/` layer is shared).

#### `frontend/src/screens/Home.jsx`
- **What:** Home tab: search launcher, bookings needing your action, the kinds of shoot (photo services in indigo, video in violet), then shelves from real data — available this weekend, an Explore teaser, top rated, new (`buildHomeFeed`).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor…".
- **Used by:** route `/` (`App.jsx`).

#### `frontend/src/screens/Discover.jsx`
- **What:** Discover tab shell: switches between `SwipeDeck` ("For you") and `Explore` via `?mode=explore`, keeping the chosen service across the switch.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/discover`.

#### `frontend/src/screens/Search.jsx`
- **What:** Photographer search: service (`?cat=`), dates (`?dates=`), price / rating / distance / Pro / ID filters, sorting, list or map view (`?view=`, lazy `ProviderMap`), "Search this area" (`?bbox=`), "% match" when the user has swiped enough. Server-side filters go through `searchProviders`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/search`.

#### `frontend/src/screens/Profile.jsx`
- **What:** A person's page. For photographers: header, follow / message / share / book, before & after showcase, tabs Portfolio / Packages / Gear / Reviews, availability strip, service-area map preview; for clients a simpler profile. Also exports `AvailabilityStrip` and `stripDates`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor…".
- **Used by:** route `/u/:id` (id, profile id or username).
- **Notes:** `AvailabilityStrip` is exported but only used inside this file.

#### `frontend/src/screens/Gallery.jsx`
- **What:** The full-screen, reels-style portfolio viewer: swipe through an album's photos and between albums, pinch/double-tap zoom, hold to hide overlays, info (EXIF, credits), save, share, report, book; owner management via `ManagePost`. Exports `AlbumViewer` (the viewer itself) and `PostRedirect` (`/post/:id` → the right gallery URL).
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…album viewer" (Brian). **Last changed:** 2026-10-19 · `2914c32` · "Web: photo editor, easier posting…".
- **Used by:** routes `/gallery/:personId?post=&photo=` and `/post/:id` (`PostRedirect`); `screens/MyWork.jsx` (`AlbumViewer`).

#### `frontend/src/screens/BookingRequest.jsx`
- **What:** Request a booking: pick a package, dates (pre-filled from a date search, checked with `freeDays`), start time in the photographer's time zone, quantity for legacy per-unit packages, add-ons, location and notes, then `requestBooking` (one request per date). Signed-out users go to sign-in and come back.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/book/:providerId`.

#### `frontend/src/screens/Bookings.jsx`
- **What:** Bookings tab: a month calendar (`DatePicker`) with status dots, a timeline of upcoming and past bookings with the client's next step, and a date search for free photographers.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/bookings`.
- **Notes:** payments aren't live — accepted bookings say so rather than faking a payment step.

#### `frontend/src/screens/BookingDetail.jsx`
- **What:** One booking for either side: status timeline, details, policy and refund preview (mirrors the DB's `cancel_booking`), and the actions for its state (accept / decline / counter, respond to an offer, cancel, mark delivered, links to delivery and review).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…".
- **Used by:** route `/bookings/:id`.

#### `frontend/src/screens/Delivery.jsx`
- **What:** The delivery step for the client: real delivery status and "accept delivery" (`acceptDelivery`). Galleries are shared as links in the booking chat for now.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/bookings/:id/delivery`.

#### `frontend/src/screens/Review.jsx`
- **What:** Leave a star rating and review for a completed booking (`submitReview`); if already reviewed, shows yours and theirs once revealed.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/bookings/:id/review`.

#### `frontend/src/screens/Inbox.jsx`
- **What:** Conversation list (DMs, groups, booking threads, inquiries) with unread state, refreshed live via `subscribeToInbox`; link to a new message.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/inbox`.

#### `frontend/src/screens/Chat.jsx`
- **What:** One conversation: live messages, read receipts and typing (`openChat`), optimistic send, day separators, shared-item cards (`ShareCard`), booking context, the delivery-gallery upload for photographers (`GalleryUpload`), and a details sheet (`ChatInfo`: members, rename, add people, leave, report).
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** route `/inbox/:id`.

#### `frontend/src/screens/NewMessage.jsx`
- **What:** Pick one person (direct message) or several (group with an optional name) with `PeoplePicker`, then open the chat.
- **Made:** 2026-10-09 · `682c20d` · "Real messaging between people…" (Brian). **Last changed:** same commit.
- **Used by:** route `/inbox/new`.

#### `frontend/src/screens/Me.jsx`
- **What:** The Me tab ("Profile"): signed-out pitch, or a client/photographer role switch. Client side: next booking, stats, saved photographers, collections, taste profile. Photographer side: profile hero, listing switch for multi-listing accounts, and the business `Dashboard`. Links to `/upload` and `/settings`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** route `/me`.

#### `frontend/src/screens/Dashboard.jsx`
- **What:** The photographer's work tabs: booking requests (new first), a calendar with booked / held / blacked-out days and working hours, service area (`MapPreview` + `ServiceAreaEditor`), packages editor (price types from the vertical config, `PackageFields`), listing details, and a portfolio link. Exports `BOOKED`.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** not a route — rendered by `screens/Me.jsx` in provider mode (with `BOOKED`).

#### `frontend/src/screens/MyWork.jsx`
- **What:** Your own posts: a grid to open, reorder and manage them; `?post=<id>` opens one in `AlbumViewer` with edit/delete; offers to resume an unfinished upload (`loadQueue`).
- **Made:** 2026-10-08 · `9758cd1` · "Posting photos: real uploads to Supabase portfolio" (Brian). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor…".
- **Used by:** route `/my-work`.

#### `frontend/src/screens/Upload.jsx`
- **What:** Post photo & video work: explains and links to `/new-listing` for users without a listing; otherwise the composer — photos (+ editor, Edit all, before & after), details, camera settings, listing picker — then posting with progress (`usePostQueue`) and resume of an unfinished post.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code…".
- **Used by:** route `/upload`.

#### `frontend/src/screens/NewListing.jsx`
- **What:** Create your photographer listing (name, link/slug, city, services offered) with `becomeProvider`, then go post your first work. Exports `ListingSetup` (the form).
- **Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/new-listing` (linked from `Upload`, `Me`, `Verify`, `Welcome`).
- **Notes:** its comment says `ListingSetup` is "also used by /upload", but nothing else imports it now — `Upload` links to `/new-listing` instead.

#### `frontend/src/screens/AiReview.jsx`
- **What:** The review status of one of your posts (processing / in review / hidden / published) and what it means. There's no automated AI check yet; "in review" only happens when the team sets it.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign…".
- **Used by:** route `/ai-review/:id` (album id).

#### `frontend/src/screens/Verify.jsx`
- **What:** Identity verification placeholder: shows the real verification status from the listing and explains that Stripe Identity is coming.
- **Made:** 2026-10-08 · `8367e87` · "Add project plan and mobile React frontend prototype" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/verify`.

#### `frontend/src/screens/Settings.jsx`
- **What:** Account settings: set/change password (→ `/reset-password`), sign out, and rows for unbuilt features that say so.
- **Made:** 2026-10-08 · `ad812e8` · "Frontend: profile, bookings calendar…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/settings`.

#### `frontend/src/screens/SignIn.jsx`
- **What:** Sign in / sign up as a step machine: start (Google or email) → email → password (log in or create) → done, with side trips for the email link + 6-digit code, confirming a new account, and forgot password. Checks which auth providers are enabled; friendly error mapping; a collage of real covers.
- **Made:** 2026-10-08 · `cbac712` · "Sign-in: email link/code + Google…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/sign-in?next=`.

#### `frontend/src/screens/AuthCallback.jsx`
- **What:** Where magic links and Google sign-in land: waits for supabase-js to read the session from the URL, shows link errors (e.g. expired), then continues to `next`.
- **Made:** 2026-10-08 · `cbac712` · "Sign-in: email link/code + Google…" (Brian). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…".
- **Used by:** route `/auth/callback`.

#### `frontend/src/screens/Welcome.jsx`
- **What:** One-time step for new accounts: pick a name and username (live availability check via `usernameTaken`), optionally say you offer a service (→ `/new-listing`).
- **Made:** 2026-10-08 · `cbac712` · "Sign-in: email link/code + Google…" (Brian). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
- **Used by:** route `/welcome`; `App.jsx` redirects here while `needsWelcome`.

#### `frontend/src/screens/ResetPassword.jsx`
- **What:** Choose a new password, reached from a reset email (the link signs you in for this step) or from Settings while signed in.
- **Made:** 2026-10-08 · `8184c56` · "Sign-in: log in / create account with password…" (Brian). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign…".
- **Used by:** route `/reset-password`.

#### `frontend/src/screens/NotFound.jsx`
- **What:** The page for any URL no route matches, with a way home.
- **Made:** 2026-10-10 · `0fca74f` · "Web: QA fixes, WCAG 2.2 AA accessibility pass…" (Brian). **Last changed:** same commit.
- **Used by:** route `*`.

### Quick reference

| I want to change… | Look at |
|---|---|
| Price labels ("$150/hr", "from $1,200", "Custom quote") | `lib/format.js` (`priceLabel`, `fromPriceLabel`) + `priceSuffix` / `PRICE_TYPES` in `verticals/index.js` |
| Booking status names and colours | `statusLabels` / `bookingSteps` in `lib/format.js`; `StatusPill` / `StatusTimeline` in `components/Booking.jsx`; `.status-pill` in `styles.css` |
| The booking flow (request → accept → deliver → review) | screens `BookingRequest`, `BookingDetail`, `Delivery`, `Review`; data in `api/bookings.js`; rules in the DB functions (`supabase/migrations`) |
| Services / kinds of shoot, their icons and wording | `verticals/catalog.js` (+ `supabase/seed.sql` slugs); icon mapping in `components/verticals/VerticalIcon.jsx` |
| Package form fields (edited photos, turnaround…) | `verticals/photography/config.js`, rendered by `components/verticals/PackageFields.jsx` / `AttributeList.jsx` |
| Editor sliders, ranges and presets | `ADJUSTMENTS` / `PRESETS` in `lib/editor/recipe.js`; the maths in `lib/editor/colorMath.js` (keep CPU + GLSL + SkSL in step; run the tests) |
| Editor UI (tabs, crop, undo) | `components/editor/PhotoEditor.jsx`, `CropOverlay.jsx`, `useRecipeHistory.js`, `editor.css` |
| AI tools (background, erase, upscale, Auto) | UI: `components/editor/ai/AiPanel.jsx`; client: `api/ai.js` (`docs/AI_TOOLS.md`); Auto: `lib/editor/auto.js` |
| The before / after slider | `components/beforeafter/BeforeAfter.jsx` + `beforeafter.css` (mobile mirrors the spec) |
| Discover ranking calls / deck mix | `getDeck` / `getFeed` / `getVendorCards` in `api/discover.js` (RPCs `discover_feed`, `discover_vendors`); batch sizes in `components/discover/SwipeDeck.jsx` |
| "% match" | `getMatches` / `withMatches` in `api/catalog.js` (`provider_matches`) and `getDeckMatches` in `api/discover.js` |
| Sharing into chats | `components/share/ShareSheet.jsx`, `ShareCard.jsx`; `shareToChats` & co. in `api/messages.js` (older `PostSheets.jsx` `ShareSheet` for client profiles) |
| Sign-in / sign-up / welcome screens | `screens/SignIn.jsx`, `Welcome.jsx`, `ResetPassword.jsx`, `AuthCallback.jsx`; `components/auth/*`; session in `auth.jsx` |
| Posting flow (pick, edit, upload, resume) | `screens/Upload.jsx` + `components/upload/*` (`usePhotoItems`, `usePostQueue`, `uploadQueue`); data in `api/portfolio.js`; image prep in `lib/images.js` |
| Editing an already-posted photo | `components/upload/ManagePost.jsx` → `api/edits.js` (`saveEdit`, `revertEdit`) |
| Search filters / map | `screens/Search.jsx` (`PRICE_OPTIONS`, `DISTANCE_OPTIONS`, `SORTS`), `api/catalog.js` `searchProviders`, `components/ProviderMap.jsx` via `map/LazyMap.jsx` |
| Home shelves | `buildHomeFeed` in `api/home.js`, `screens/Home.jsx`, `components/home/Cards.jsx` |
| Add a route / page title / tab | `App.jsx` (`<Route>`, `ROUTE_TITLES`, `TAB_ROUTES`) and `components/TabBar.jsx` |
| App-wide signed-in state (follows, likes, listing, toasts) | `store.jsx` (`useStore`) |
| Booking delivery gallery upload (Tim's) | `components/GalleryUpload.jsx`, `api/gallery.js`, `lib/galleryRules.js` (mirror `backend/core/gallery.py`) |
| Something mobile also uses | anything in `api/`, `lib/`, `verticals/`, `lib/editor/` (not `renderWeb.js`), `components/auth/authKit.js` — check `mobile/` importers and keep it DOM-free |
