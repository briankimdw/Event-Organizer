# Codebase map

Every file in the repository: **what it is for**, **when and in which commit it was made**, its
**latest change**, and **where it is used** (which files import it, which route or screen shows it,
or who runs it). Generated on 2026-10-21 at commit `5f6655d`.

**How to read an entry**

- **What:** what the file does and its main exports.
- **Made:** the date, commit and author that added the file (and where it lived before, if it moved).
- **Last changed:** the latest commit that touched it.
- **Used by:** real consumers: importing files, routes, scripts, or "entry point" / "run by you".
  Mobile files that import shared web code through `@shared/...` are listed under **mobile**.
- **Notes:** gotchas, ownership (Tim's files are marked), generated files, things to check.

**The repository at a glance**

| Folder | What lives there |
|---|---|
| `frontend/` | The React + Vite web app. `frontend/src/api`, `lib` and `verticals` are plain JS shared with the Expo app. Also scripts you run (seed, backup, e2e) and the built Studio editor in `public/studio`. |
| `mobile/` | The Expo (React Native) app. Imports the shared web code through Metro (`@shared/...`). |
| `services/ml/` | Python FastAPI service: SigLIP photo embeddings and auto-tags (Discover), and the AI photo tools (remove background, erase, upscale). |
| `supabase/` | Database migrations (the schema), seed data, demo data, SQL tests. |
| `tools/` | Build tooling: the Studio (miniPaint) build, and the scripts that generate this map. |
| `docs/` | Project docs: plan, progress log, database design, data layer, editor, AI tools, runbooks. |
| `backend/`, `orchestrator/`, `plans/`, `.claude/` | Tim Phelps's FastAPI auth/gallery backend and his Claude Code orchestrator. |
| `archive/event-platform/` | The archived multi-vendor event platform (git tag `multi-vendor-snapshot`). Not built or imported. |

To refresh this map after changes: `node tools/codemap/scan.mjs > tools/codemap/codemap.json`,
update the section files in `docs/codemap/`, then `node tools/codemap/assemble.mjs`.

## Contents

- [Web app source (frontend/src)](#web-app-source-frontendsrc)
  - [Root files](#root-files)
  - [api/](#api)
  - [lib/](#lib)
  - [lib/editor/](#libeditor)
  - [verticals/](#verticals)
  - [components/ (top level)](#components-top-level)
  - [components/auth/](#componentsauth)
  - [components/beforeafter/](#componentsbeforeafter)
  - [components/discover/](#componentsdiscover)
  - [components/editor/](#componentseditor)
  - [components/editor/ai/](#componentseditorai)
  - [components/home/](#componentshome)
  - [components/map/](#componentsmap)
  - [components/share/](#componentsshare)
  - [components/studio/](#componentsstudio)
  - [components/upload/](#componentsupload)
  - [components/verticals/](#componentsverticals)
  - [screens/](#screens)
  - [Quick reference](#quick-reference)
- [Expo app (mobile/)](#expo-app-mobile)
  - [src/app/ (routes)](#srcapp-routes)
  - [Root config and docs (mobile/)](#root-config-and-docs-mobile)
  - [assets/](#assets)
  - [src/components/](#srccomponents)
  - [src/hooks/](#srchooks)
  - [src/lib/](#srclib)
  - [src/shims/](#srcshims)
  - [src/state/](#srcstate)
  - [src/ (top-level files)](#src-top-level-files)
  - [src/screens/ (top level)](#srcscreens-top-level)
  - [src/screens/account/](#srcscreensaccount)
  - [src/screens/auth/](#srcscreensauth)
  - [src/screens/bookings/](#srcscreensbookings)
  - [src/screens/discover/](#srcscreensdiscover)
  - [src/screens/gallery/](#srcscreensgallery)
  - [src/screens/home/](#srcscreenshome)
  - [src/screens/inbox/](#srcscreensinbox)
  - [src/screens/profile/](#srcscreensprofile)
  - [src/screens/editor/](#srcscreenseditor)
  - [src/screens/editor/ai/](#srcscreenseditorai)
  - [src/screens/provider/](#srcscreensprovider)
  - [src/screens/provider/upload/](#srcscreensproviderupload)
  - [Quick reference](#quick-reference-1)
- [Backend, database, tools and docs](#backend-database-tools-and-docs)
  - [How the pieces connect](#how-the-pieces-connect)
  - [Root files](#root-files-1)
  - [frontend/ config, entry and tooling (not src/)](#frontend-config-entry-and-tooling-not-src)
  - [frontend/public/studio/: built Studio (miniPaint), generated](#frontendpublicstudio-built-studio-minipaint-generated)
  - [frontend/scripts/: admin and seed scripts (Node, service role)](#frontendscripts-admin-and-seed-scripts-node-service-role)
  - [frontend/scripts/e2e/: real-database end-to-end test (19 files)](#frontendscriptse2e-real-database-end-to-end-test-19-files)
  - [supabase/: schema, seed, demo data, SQL tests](#supabase-schema-seed-demo-data-sql-tests)
  - [services/ml/: SigLIP worker and AI photo tools (Python, FastAPI)](#servicesml-siglip-worker-and-ai-photo-tools-python-fastapi)
  - [tools/studio/: Studio (miniPaint) build](#toolsstudio-studio-minipaint-build)
  - [docs/](#docs)
  - [Quick reference](#quick-reference-2)
  - [Commands cheat sheet](#commands-cheat-sheet)
- [Tim's services and the archive](#tims-services-and-the-archive)
  - [Part 1: Tim Phelps's code](#part-1-tim-phelpss-code)
  - [Part 2: archive/event-platform/ — the archived multi-vendor event platform](#part-2-archiveevent-platform--the-archived-multi-vendor-event-platform)

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

---

## Expo app (mobile/)

The phone app: Expo SDK 57, React Native 0.86, React 19, **expo-router** (file-based routes), TypeScript. It is a native port of the web app in `frontend/` and reuses the web's plain-JS data layer (`frontend/src/api`, `lib`, `verticals`) **without copying it**. Everything runs in **Expo Go** (no custom native build); keep it that way (README "Photography pivot"). Start with `mobile/README.md` and `mobile/AGENTS.md`.

Most files arrived in one commit, `1f99925` (2026-10-10, "All event services, Home/Discover redesign, and the Expo app"). Later waves: QA/a11y pass `d0970c2` (10-10), sign-in redesign `83f478d` (10-11), Discover vendor cards `c7028db` (10-12), photography-only pivot `fba56f4` (10-19), native photo editor + before/after + upload queue `23f183e` (10-19), AI photo tools `8b9994d` (10-20), cleanup `5f6655d` (10-20). No file under `mobile/` was renamed or moved (the removed event/planner screens live in `archive/event-platform/mobile/`).

**How it boots**

1. `package.json` `"main": "index.ts"`.
2. `index.ts` imports `src/shims/install.ts` **first**, then `expo-router/entry`. The shims give the shared web code the browser globals it expects: `globalThis.__SHARED_ENV__` (env, from `shims/env.ts`), `localStorage`/`sessionStorage` (`shims/storage.ts`, AsyncStorage-backed), `navigator.geolocation` (`shims/geolocation.ts`, expo-location), `crypto.randomUUID`/`getRandomValues` (expo-crypto), `DOMException`, and a URL polyfill. On the web target each shim leaves the real browser API alone.
3. expo-router loads `src/app/_layout.tsx`: `AppThemeProvider` (holds the splash until the saved light/dark preference is read) → `GestureHandlerRootView` → nav `ThemeProvider` → `AuthProvider` → `StoreProvider` → one `<Stack>` (native headers off; `sign-in` is a modal) + `<ToastHost/>` + `<WelcomeGate/>`. `src/app/(tabs)/_layout.tsx` defines the five tabs (Home, Discover, Bookings, Inbox, Me) with a live unread badge on Inbox.

**The shared-code bridge** (read before touching anything that imports `@shared/...`)

- `tsconfig.json` paths: `@/*` → `mobile/src/*`, `@shared/*` → `frontend/src/*`.
- `metro.config.js`: watches `frontend/src`; rewrites `@shared/x` to an absolute path; forces bare imports *from shared files* (react, supabase-js…) to resolve from `mobile/node_modules` (one React, one Supabase client), and block-lists `frontend/node_modules`. It also **redirects two web-only files**:
  - `frontend/src/lib/supabase.js` → `mobile/src/lib/supabase.ts` (AsyncStorage session, no URL session detection)
  - `frontend/src/lib/images.js` → `mobile/src/shims/images.ts` (expo-image-manipulator instead of canvas/createImageBitmap/exifr)
  So `frontend/src/api/*.js` runs unchanged on the phone but talks to the mobile Supabase client. Add a line to `REDIRECTS` (and README "Portability issues") when another shared file needs a native stand-in.
- `babel.config.js` + `babel/shared-env-plugin.js`: in files under `frontend/src` only, rewrites `import.meta.env.X` → `globalThis.__SHARED_ENV__.X` (Hermes has no `import.meta`). `src/shims/env.ts` fills that object from `EXPO_PUBLIC_*` vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ML_URL`, `DEV: false`…).
- Most-used shared modules (import counts in `mobile/src`): `verticals/index.js` (23), `api/catalog.js` (22), `lib/format.js` (17), `lib/dates.js` (15), `api/portfolio.js` (14), `api/messages.js` and `api/bookings.js` (9 each), `api/discover.js` (7), plus `lib/editor/*` (recipe, geometry, colorMath, auto) and `api/ai.js` for the photo editor. **Never edit `frontend/**` from mobile work**; changes there affect the web too.

**Routes vs screens.** Files under `src/app/**` are thin route files: almost all are one line, `export { default } from '@/screens/…'`. The real UI lives in `src/screens/**` (one folder per area, each a port of a web screen named in its header comment). The only route files with logic are the two `_layout.tsx` files and `+not-found.tsx`. Routes mirror the web's React Router paths one-for-one (`frontend/src/App.jsx`).

**State.** `src/state/auth.tsx` (session, user, `profiles` row, `needsWelcome`, `signOut`; same value shape as `frontend/src/auth.jsx`), `src/state/store.tsx` (follows, shortlist, likes, saves, "Not into this" corrections, my photo/video listing(s), `toast`; port of `frontend/src/store.jsx`), `src/state/WelcomeGate.tsx` (sends nameless new accounts to `/welcome`). Screen data is fetched per screen with `src/hooks/useQuery.ts` (typed wrapper of the shared `lib/useQuery.js`). `src/theme.ts` holds design tokens (mirroring `frontend/src/styles.css`), light/dark/system preference, `useTheme()` and `makeStyles()`.

**Folder tree**

```
mobile/
├─ index.ts               entry: shims, then expo-router
├─ app.json               Expo config (name photomatch, scheme eventorganizer, plugins, permissions)
├─ metro.config.js        shared-code bridge + web-only file redirects
├─ babel.config.js, babel/shared-env-plugin.js   import.meta.env rewrite for shared files
├─ tsconfig.json, eslint.config.js, package.json, package-lock.json, .env.example, .gitignore
├─ README.md, AGENTS.md, QA_CHECKLIST.md
├─ assets/                app icons, splash, favicon
└─ src/
   ├─ app/                expo-router routes (thin re-exports) + layouts
   ├─ components/         UI primitives (barrel: @/components), map/ (@/components/map), share/
   ├─ hooks/              useQuery, useUnreadCount
   ├─ lib/                supabase client (Metro redirect target), a11y, photo, beforeAfter
   ├─ screens/            the real screens: account/, auth/, bookings/, discover/, editor/ (+ai/),
   │                      gallery/, home/, inbox/, profile/, provider/ (+upload/), Me, Search, SignIn
   ├─ shims/              browser globals for shared code; images.ts (Metro redirect target)
   ├─ state/              auth, store, WelcomeGate
   ├─ theme.ts            tokens, light/dark, makeStyles
   └─ types.ts            Provider / Person / Package / Review / Vertical types inferred from shared JS
```

**Route → screen → web route.** All route files below were added 2026-10-10 in `1f99925` and are unchanged since, except the layouts (noted in the next section).

| Route (expo-router) | Route file (`mobile/src/app/…`) | Screen (`mobile/src/screens/…`) | Web route (`frontend/src/App.jsx`) |
| --- | --- | --- | --- |
| `/` (Home tab) | `(tabs)/index.tsx` | `home/Home.tsx` | `/` |
| `/discover` (tab) | `(tabs)/discover.tsx` | `discover/Discover.tsx` | `/discover` |
| `/bookings` (tab) | `(tabs)/bookings.tsx` | `bookings/Bookings.tsx` | `/bookings` |
| `/inbox` (tab) | `(tabs)/inbox.tsx` | `inbox/Inbox.tsx` | `/inbox` |
| `/me` (tab) | `(tabs)/me.tsx` | `Me.tsx` (+ `provider/Dashboard.tsx`) | `/me` |
| `/search` | `search.tsx` | `Search.tsx` | `/search` |
| `/u/[id]` | `u/[id].tsx` | `profile/Profile.tsx` | `/u/:id` |
| `/gallery/[personId]` | `gallery/[personId].tsx` | `gallery/Gallery.tsx` | `/gallery/:personId` |
| `/post/[id]` | `post/[id].tsx` | `gallery/PostRedirect.tsx` | `/post/:id` |
| `/book/[providerId]` | `book/[providerId].tsx` | `bookings/BookingRequest.tsx` | `/book/:providerId` |
| `/bookings/[id]` | `bookings/[id]/index.tsx` | `bookings/BookingDetail.tsx` | `/bookings/:id` |
| `/bookings/[id]/delivery` | `bookings/[id]/delivery.tsx` | `bookings/Delivery.tsx` | `/bookings/:id/delivery` |
| `/bookings/[id]/review` | `bookings/[id]/review.tsx` | `bookings/Review.tsx` | `/bookings/:id/review` |
| `/inbox/new` | `inbox/new.tsx` | `inbox/NewMessage.tsx` | `/inbox/new` |
| `/inbox/[id]` | `inbox/[id].tsx` | `inbox/Chat.tsx` | `/inbox/:id` |
| `/upload` | `upload.tsx` | `provider/Upload.tsx` | `/upload` |
| `/my-work` | `my-work.tsx` | `provider/MyWork.tsx` | `/my-work` |
| `/new-listing` | `new-listing.tsx` | `provider/NewListing.tsx` | `/new-listing` |
| `/ai-review/[id]` | `ai-review/[id].tsx` | `provider/AiReview.tsx` | `/ai-review/:id` |
| `/verify` | `verify.tsx` | `account/Verify.tsx` | `/verify` |
| `/settings` | `settings.tsx` | `account/Settings.tsx` | `/settings` |
| `/sign-in` (modal) | `sign-in.tsx` | `SignIn.tsx` | `/sign-in` |
| `/auth/callback` | `auth/callback.tsx` | `account/AuthCallback.tsx` | `/auth/callback` |
| `/welcome` | `welcome.tsx` | `account/Welcome.tsx` | `/welcome` |
| `/reset-password` | `reset-password.tsx` | `account/ResetPassword.tsx` | `/reset-password` |
| unmatched | `+not-found.tsx` | (inline) | `*` (NotFound) |

The web has no mobile-only routes and the phone has no web-only routes; the photo editor is a modal opened from `/upload` and `/my-work`, not a route (the web's miniPaint "Studio" from `8b9994d` has no mobile counterpart).

### src/app/ (routes)

The 25 one-line route files are listed in the table above; each re-exports its screen's default export and has no other code. Their consumer is expo-router itself (file-system routing; `typedRoutes` is on in `app.json`). Individual entries only for the files with logic:

#### `mobile/src/app/_layout.tsx`
**What:** Root layout: theme provider (splash held until the theme preference loads), gesture root, nav theme, `AuthProvider`, `StoreProvider`, the single `Stack` (headers off, `sign-in` as modal), `ToastHost`, `WelcomeGate`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `8cdfe04` · "mobile: light theme by default, Appearance setting (Light / Dark / System)".
**Used by:** expo-router (root layout for every route).
**Notes:** Add a `<Stack.Screen>` here only to change presentation (modal, animation); new routes need no registration.

#### `mobile/src/app/(tabs)/_layout.tsx`
**What:** The five-tab bar (Home, Discover, Bookings, Inbox, Me; lucide icons), matching the web's `components/TabBar.jsx`; Inbox shows a live unread badge from `useUnreadCount`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** expo-router (layout of the `(tabs)` group).
**Notes:** Uses `Tabs` from `expo-router/js-tabs`; label font scaling is capped (`maxFontSizeMultiplier`) so five tabs fit at large text sizes.

#### `mobile/src/app/+not-found.tsx`
**What:** Not-found screen ("This page doesn't exist", Go home). Old archived links (`/events`, `/plan`, …) land here.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** expo-router (unmatched routes).

One-line route files (all: Made 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw); Last changed: same commit): `(tabs)/index.tsx`, `(tabs)/discover.tsx`, `(tabs)/bookings.tsx`, `(tabs)/inbox.tsx`, `(tabs)/me.tsx`, `ai-review/[id].tsx`, `auth/callback.tsx`, `book/[providerId].tsx`, `bookings/[id]/index.tsx`, `bookings/[id]/delivery.tsx`, `bookings/[id]/review.tsx`, `gallery/[personId].tsx`, `inbox/[id].tsx`, `inbox/new.tsx`, `my-work.tsx`, `new-listing.tsx`, `post/[id].tsx`, `reset-password.tsx`, `search.tsx`, `settings.tsx`, `sign-in.tsx`, `u/[id].tsx`, `upload.tsx`, `verify.tsx`, `welcome.tsx` — full paths `mobile/src/app/(tabs)/index.tsx`, `mobile/src/app/(tabs)/discover.tsx`, `mobile/src/app/(tabs)/bookings.tsx`, `mobile/src/app/(tabs)/inbox.tsx`, `mobile/src/app/(tabs)/me.tsx`, `mobile/src/app/ai-review/[id].tsx`, `mobile/src/app/auth/callback.tsx`, `mobile/src/app/book/[providerId].tsx`, `mobile/src/app/bookings/[id]/index.tsx`, `mobile/src/app/bookings/[id]/delivery.tsx`, `mobile/src/app/bookings/[id]/review.tsx`, `mobile/src/app/gallery/[personId].tsx`, `mobile/src/app/inbox/[id].tsx`, `mobile/src/app/inbox/new.tsx`, `mobile/src/app/my-work.tsx`, `mobile/src/app/new-listing.tsx`, `mobile/src/app/post/[id].tsx`, `mobile/src/app/reset-password.tsx`, `mobile/src/app/search.tsx`, `mobile/src/app/settings.tsx`, `mobile/src/app/sign-in.tsx`, `mobile/src/app/u/[id].tsx`, `mobile/src/app/upload.tsx`, `mobile/src/app/verify.tsx`, `mobile/src/app/welcome.tsx`.

### Root config and docs (mobile/)

#### `mobile/index.ts`
**What:** App entry: `import './src/shims/install'` then `import 'expo-router/entry'`. Order matters (shims before any shared code loads).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** entry point (`package.json` `main`).

#### `mobile/metro.config.js`
**What:** The shared-code bridge: `watchFolders` += `frontend/src`, `nodeModulesPaths` = `mobile/node_modules` only, block-lists `frontend/node_modules`, resolves `@shared/…`, and `REDIRECTS` web-only shared files (`lib/supabase.js`, `lib/images.js`) to native versions.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** Metro / `expo start` (build tool config).
**Notes:** The resolver rewrites the origin of bare imports from shared files to `index.ts` so packages always come from `mobile/node_modules`. Keep README "Shared code" and "Portability issues" in sync when editing.

#### `mobile/babel.config.js`
**What:** `babel-preset-expo` plus the local `./babel/shared-env-plugin.js`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** Metro's Babel transform.

#### `mobile/babel/shared-env-plugin.js`
**What:** Babel plugin that, in files under `frontend/src` only, rewrites `import.meta.env(.X)` to `globalThis.__SHARED_ENV__(.X)`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `babel.config.js` (plugin path, not a JS import).
**Notes:** The object is filled by `src/shims/env.ts`, which must load before any shared module (it does, via `index.ts` → `shims/install.ts`).

#### `mobile/app.json`
**What:** Expo config: name `photomatch`, slug `event-organizer`, URL scheme `eventorganizer`, portrait, automatic UI style, iOS/Android icons, splash, `expo-router`/`expo-location`/`expo-image-picker` plugins with permission strings, `typedRoutes`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** Expo CLI / build.
**Notes:** Slug and scheme keep the pre-pivot names on purpose: Supabase redirect URLs (`eventorganizer://**`) and old deep links depend on them. iOS icon is `assets/expo.icon` (still the Expo template icon).

#### `mobile/package.json`
**What:** Dependencies (Expo 57 modules, react-native-maps, Skia, reanimated/worklets, gesture-handler, supabase-js, lucide) and scripts: `start`, `android`, `ios`, `web`, `typecheck` (`tsc --noEmit`), `lint` (`expo lint`), `export:check` (`expo export` for Android + iOS to `dist-check`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** npm / Expo CLI.
**Notes:** Install packages with `npx expo install <pkg>` (SDK-matched versions), and only ones Expo Go bundles.

#### `mobile/package-lock.json`
**What:** npm lockfile for `mobile/node_modules` (the only node_modules Metro uses, including for shared code).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** npm.

#### `mobile/tsconfig.json`
**What:** Extends `expo/tsconfig.base`; strict, `allowJs` (so shared JS types are inferred), paths `@/*`, `@/assets/*`, `@shared/*` → `../frontend/src/*`; excludes `babel/` and the Metro/Babel configs.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `npm run typecheck`, editors; Metro reads the path aliases.

#### `mobile/eslint.config.js`
**What:** Flat ESLint config: `eslint-config-expo/flat`, ignores `dist/*`.
**Made:** 2026-10-12 · `c7028db` · "Discover for every vertical (web + mobile), demo vendor portfolios" (briankimdw). **Last changed:** same commit.
**Used by:** `npm run lint` (`expo lint`).

#### `mobile/.env.example`
**What:** Template for `mobile/.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_ML_URL` (ML service for editor AI tools; use the PC's LAN IP on a phone, empty = AI off).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** developers (copy to `.env`); values are read in `src/shims/env.ts`.
**Notes:** Publishable key only; never the service-role key.

#### `mobile/.gitignore`
**What:** Ignores `node_modules/`, `.expo/`, `dist*/`, `web-build/`, `.env`, `.env*.local`, native `/ios` `/android` folders, signing keys, `expo-env.d.ts`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** git.

#### `mobile/README.md`
**What:** The mobile handbook: photography pivot notes, how to run, folder layout, porting conventions, the shared-code bridge, portability-issue table, auth/deep-link setup (Supabase redirect URLs), and the web → native status table.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** developers (AGENTS.md says read it first).
**Notes:** Status table lags the code: it says Upload reorders "with arrows" and Gallery has no before/after, but `23f183e` added hold-and-drag (`SortableGrid`) to the picker and the `BeforeAfter` slider to `AlbumViewer`.

#### `mobile/AGENTS.md`
**What:** Instructions for AI coding agents: read README first, never edit `frontend/**`, Expo changes fast (check versioned docs), commands (`npx expo install`, lint, `tsc --noEmit`, `expo-doctor`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** coding agents / developers.

#### `mobile/QA_CHECKLIST.md`
**What:** Functional QA pass from 2026-10-10 (run on the Expo web target with stubbed sessions): PASS/FIXED/PHONE/NOTE per area, fixes made, and a "Needs a real phone" list.
**Made:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes" (briankimdw). **Last changed:** same commit.
**Used by:** developers / QA (reference only).
**Notes:** Pre-pivot: still has an "Events and planner" section for screens now archived; the editor, upload queue and AI tools postdate it.

### assets/

| Folder | Files | Used by | Made / Last changed |
| --- | --- | --- | --- |
| `mobile/assets/images/` | `icon.png`, `splash-icon.png`, `favicon.png`, `android-icon-background.png`, `android-icon-foreground.png`, `android-icon-monochrome.png` | `app.json` (`icon`, splash plugin, `web.favicon`, Android `adaptiveIcon`) | 2026-10-10 · `1f99925`; unchanged |
| `mobile/assets/expo.icon/` | `icon.json`, `Assets/expo-symbol 2.svg`, `Assets/grid.png` | `app.json` `ios.icon` (Xcode Icon Composer bundle) | 2026-10-10 · `1f99925`; unchanged |

Paths in full: `mobile/assets/images/icon.png`, `mobile/assets/images/splash-icon.png`, `mobile/assets/images/favicon.png`, `mobile/assets/images/android-icon-background.png`, `mobile/assets/images/android-icon-foreground.png`, `mobile/assets/images/android-icon-monochrome.png`, `mobile/assets/expo.icon/icon.json`, `mobile/assets/expo.icon/Assets/expo-symbol 2.svg`, `mobile/assets/expo.icon/Assets/grid.png`. Nothing in `src/` imports an asset. The iOS icon bundle is the unmodified `create-expo-app` template (Expo symbol on a blue gradient); replace it before a store build.

### src/components/

UI primitives, each mirroring a web component or CSS class. Screens import them through the barrel **`@/components`** (`components/index.ts`), so the JSON's `importedBy` for most of them shows only `components/index.ts`; the "Used by" lines below count imports of each export through the barrel (checked by grepping `from '@/components'`). Maps are a separate barrel, `@/components/map`.

#### `mobile/src/components/index.ts`
**What:** Barrel re-exporting every primitive below (not `BeforeAfter`, `map/*` or `share/*`, which are imported by path).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 71 files, e.g. route `/+not-found`, route `/_layout`, `components/share/ShareCard.tsx`, `components/share/ShareSheet.tsx`, `screens/Me.tsx` (every screen folder, `app/_layout.tsx`, `app/+not-found.tsx`).

#### `mobile/src/components/Text.tsx`
**What:** `Text` with the app type scale (`variant`: display, h1–h4, body, small, tiny, label, caption; `muted`, `color`, `weight`, `center`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches".
**Used by:** 62 files via the barrel, plus 22 other components directly.

#### `mobile/src/components/Button.tsx`
**What:** `Button` (variants primary, accent, ghost, outline, danger, link; sizes; optional lucide icon) and `IconButton` (round icon with an a11y label), mirroring the web's `.btn`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `Button` in 37 files, `IconButton` in 5 (EditorScreen, Inbox, Me, Profile, MyWork); also `States.tsx`, `map/MapProviderCard.tsx`, `map/ProviderMap.tsx`.

#### `mobile/src/components/Screen.tsx`
**What:** `Screen` (safe areas, background, optional `TopBar` with back button, `scroll` toggle, custom `header`) and `TopBar`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `Screen` in 16 files (e.g. `+not-found`, Settings, Verify, BookingDetail); `TopBar` in `account/ResetPassword.tsx`.

#### `mobile/src/components/States.tsx`
**What:** `Loading`, `EmptyState`, `ErrorState` (with retry), `SignInPrompt` — the web's `States.jsx`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `Loading` 27 files, `ErrorState` 25, `EmptyState` 21, `SignInPrompt` 13 (most screens).

#### `mobile/src/components/Sheet.tsx`
**What:** Bottom sheet on RN `Modal`: dimmed backdrop, title, X, optional scrolling; moves screen-reader focus into it on open.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 17 files, e.g. `share/ShareSheet.tsx`, `account/MeParts.tsx`, `account/Settings.tsx`, `discover/DeckSheets.tsx`, `bookings/BookingDetail.tsx`.

#### `mobile/src/components/TextField.tsx`
**What:** `TextField` (forwardRef `TextInput` with the web `.input` look, label, leading icon, `clearable`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 15 files, e.g. `share/ShareSheet.tsx`, `account/MeParts.tsx`, `bookings/BookingRequest.tsx`, `bookings/Review.tsx`.

#### `mobile/src/components/Chip.tsx`
**What:** `Chip` (static / toggle / solid pill with icons and tint) and `ChipRow` (optionally horizontal-scrolling row).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `Chip` in 19 files, `ChipRow` in 12 (search, discover, profile, bookings, provider screens).

#### `mobile/src/components/Avatar.tsx`
**What:** Round profile photo; draws the shared `avatarUrl()` SVG-data-URL fallback natively as an initials badge in the same colour.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 19 files via the barrel (chat, bookings, share, Me) plus `AvatarViewer`, `ProviderCard`, `map/*`.

#### `mobile/src/components/AvatarViewer.tsx`
**What:** Instagram-style full-screen avatar viewer (`AvatarViewer`, controlled) and `ViewableAvatar` (tap to open; optional "View profile" link).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `ViewableAvatar` in `profile/Profile.tsx`; `AvatarViewer` itself is only used inside this file.

#### `mobile/src/components/Badges.tsx`
**What:** `IdVerified`, `ProBadge`, `NewTag`, `Stars` (display or tappable input), `RatingInline`, `ratingLabel`, and `InA11yGroup` (context that stops badges being separate screen-reader stops inside a labelled card).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `IdVerified` 7 files, `ProBadge` 6, `InA11yGroup` 4, `Stars` 3 (Review, Profile, ReviewList); `RatingInline`/`ratingLabel` inside `ProviderCard`/`MapProviderCard`.
**Notes:** `NewTag` is exported but not used anywhere.

#### `mobile/src/components/BeforeAfter.tsx`
**What:** Before/after comparison slider, native twin of the web's `components/beforeafter/BeforeAfter.jsx` with the same interaction spec (`BA` constants): `BeforeAfter` (drag, tap-to-jump, demo sweep, externally driven `position`), `BeforeAfterThumb` (press-and-hold peek) and `BeforeAfterBadge`.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** imported by path (not in the barrel): 9 files, e.g. `components/share/ShareCard.tsx`, `screens/discover/Explore.tsx`, `screens/discover/SwipeCard.tsx`, `screens/gallery/AlbumViewer.tsx`.
**Notes:** Check on a real iPhone that the horizontal drag doesn't fight vertical paging in `AlbumViewer` and the Discover deck.

#### `mobile/src/components/AvailabilityStrip.tsx`
**What:** Next 14 days as day pills, booked days struck through; loads free days itself given `providerId`, or takes `free`; optional `onSelect`. Also `stripDates()`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `discover/DeckSheets.tsx`, `profile/Profile.tsx` (also `stripDates`).

#### `mobile/src/components/DatePicker.tsx`
**What:** Month calendar with multi-select days (`YYYY-MM-DD` keys from shared `lib/dates.js`), coloured dots, controllable month.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `bookings/Bookings.tsx`, `Search.tsx`.

#### `mobile/src/components/KeyboardView.tsx`
**What:** Container that pads its bottom by the keyboard overlap (measures itself; never double-pads on Android `adjustResize`), without react-native-keyboard-controller (not in Expo Go).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `Sheet.tsx` and 6 screens: `inbox/Chat.tsx`, `SignIn.tsx`, `account/ResetPassword.tsx`, `account/Welcome.tsx`, `provider/NewListing.tsx`, `provider/Upload.tsx`.
**Notes:** Check chat composer and sign-in on a real iPhone and Android device.

#### `mobile/src/components/Photo.tsx`
**What:** Remote photo via `expo-image` (cache, fade) on the soft placeholder; with no URL and a `vertical`, shows that vertical's tint and icon.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** 21 files via the barrel (discover, gallery, profile, share, upload…) plus `Avatar`, `AvatarViewer`, `ProviderCard`.

#### `mobile/src/components/PriceLabel.tsx`
**What:** `PriceLabel` component and `priceText` / `fromPriceText` helpers over the shared `lib/format.js` `priceLabel` / `fromPriceLabel` (fixed, hourly, quote, and legacy per-person/item/day units).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `PriceLabel` in `profile/PackageList.tsx`; `priceText` in `bookings/BookingRequest.tsx`; `fromPriceText` imported by path in `ProviderCard` and 5 discover files.

#### `mobile/src/components/ProviderCard.tsx`
**What:** A provider in a list, three layouts (`row`, `tile`, `result`) matching the web; taps open `/u/[id]`. Also `providerA11yLabel()` and `MatchBadge`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `ProviderCard` in `home/ProviderShelves.tsx`, `Search.tsx`; `providerA11yLabel` in `discover/cards.ts`, `discover/DeckSheets.tsx`; also `map/MapProviderCard.tsx`, `map/ProviderMap(.web).tsx`.
**Notes:** `MatchBadge` is exported but used by nothing outside this file.

#### `mobile/src/components/Card.tsx`
**What:** Bordered surface (the web's `.info-card` / `.package-card`); `onPress` makes it tappable.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `profile/PackageList.tsx`, `provider/Dashboard.tsx`, `provider/ServiceArea.tsx`.

#### `mobile/src/components/SectionHeader.tsx`
**What:** Section title + subtitle + optional "See all" (the web's `.section-head`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `bookings/NeedsAction.tsx`, `home/Home.tsx`, `home/ProviderShelves.tsx`.

#### `mobile/src/components/Segmented.tsx`
**What:** Generic segmented control (`options`, `value`, `onChange`), the web's `Segmented.jsx`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 7 files: `account/Settings.tsx` (Appearance), `bookings/Bookings.tsx`, `editor/ai/AiPanel.tsx`, `profile/Profile.tsx`, `provider/Dashboard.tsx`, `provider/Upload.tsx`, `SignIn.tsx`.

#### `mobile/src/components/Toast.tsx`
**What:** `ToastHost`: shows the store's current toast above the tab bar (and announces it to screen readers).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `app/_layout.tsx` (mounted once). Messages come from `useStore().toast(...)`.

#### `mobile/src/components/VerticalIcon.tsx`
**What:** Maps the shared catalog's lucide icon *names* to `lucide-react-native` components: `iconByName()`, `VerticalIcon` (optional tinted bubble); unknown names fall back to a circle.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `VerticalIcon` in 5 files (DeckSheets, Explore, VendorFace, NewListing, Upload); `iconByName` in `discover/SwipeDeck.tsx`, `home/Home.tsx`, `Search.tsx`; also `Photo.tsx`, `map/MapProviderCard.tsx`.

#### `mobile/src/components/map/index.ts`
**What:** Map barrel: `ProviderMap`, `MapPreview` (platform-resolved), `MapProviderCard`, `ProviderMapProps`, all of `geo`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/Search.tsx`, `screens/profile/Profile.tsx`, `screens/provider/ServiceArea.tsx`.

#### `mobile/src/components/map/ProviderMap.tsx`
**What:** Full-height provider map on react-native-maps (Apple/Google): avatar pins ringed in vertical tint, tap → radius circle + `MapProviderCard`, "Search this area" → `onAreaChange`, locate and show-everyone controls.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `Search.tsx` (`?view=map`) via `@/components/map`.
**Notes:** TODO in file: pin clustering (the web groups pins closer than 34px). Real-device check: pin images and region changes.

#### `mobile/src/components/map/ProviderMap.web.tsx`
**What:** Web-target fallback for `ProviderMap`: a list of the providers that would be pinned, tap for the same card.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** platform file used on web only (Metro picks `.web.tsx` over `ProviderMap.tsx` for `expo start --web`); reached through `map/index.ts`.

#### `mobile/src/components/map/MapPreview.tsx`
**What:** Small non-interactive map of a provider's base and travel radius; tap opens the full map. Default export.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `8cdfe04` · "mobile: light theme by default, Appearance setting (Light / Dark / System)".
**Used by:** `profile/Profile.tsx`, `provider/ServiceArea.tsx` via `@/components/map`; `MapPreview.web.tsx` imports its props type.

#### `mobile/src/components/map/MapPreview.web.tsx`
**What:** Web-target fallback for `MapPreview`: a soft card with the service area as text and "Open map".
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches".
**Used by:** platform file used on web only (replaces `MapPreview.tsx` in web bundles).

#### `mobile/src/components/map/MapProviderCard.tsx`
**What:** Compact card for the tapped provider (photo, badges, price, base + radius, View profile / Book); exports `MapProvider` type.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `map/ProviderMap.tsx`, `map/ProviderMap.web.tsx`; the `MapProvider` type is used by `Search.tsx`.

#### `mobile/src/components/map/geo.ts`
**What:** Region math for react-native-maps: `circleRegion`, `pointsRegion`, `boxRegion`/`regionBox` (to/from the shared `{w,s,e,n}` area box), `movedFrom`, `includePoint`; types `LatLng`, `Region`, `Box`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `map/MapPreview.tsx`, `map/ProviderMap.tsx`, `map/types.ts`; `Search.tsx` uses its `Box`/`LatLng` types via the barrel.

#### `mobile/src/components/map/types.ts`
**What:** `ProviderMapProps`, shared by the native and web `ProviderMap`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `map/ProviderMap.tsx`, `map/ProviderMap.web.tsx`, `map/index.ts`.

#### `mobile/src/components/share/ShareCard.tsx`
**What:** Card for a post / photographer shared in chat (`message.shared` from shared `api/messages.js`); archived events show as a stub; before & after posts show the after photo with a hold-to-peek.
**Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing, events with friends, UI pass" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `inbox/Chat.tsx`.
**Notes:** Gets missing "before" photos through `lib/beforeAfter.ts`.

#### `mobile/src/components/share/ShareSheet.tsx`
**What:** "Send to" sheet: pick recent chats or people, add a note, send one card message per chat; "Share to…" opens the system share sheet (RN `Share`).
**Made:** 2026-10-10 · `b9b7a81` · "Posting for every vertical, in-app sharing, events with friends, UI pass" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/gallery/AlbumViewer.tsx`, `screens/profile/Profile.tsx`, `screens/provider/upload/PostingStatus.tsx`.

### src/hooks/

#### `mobile/src/hooks/useQuery.ts`
**What:** Typed wrapper of the shared `frontend/src/lib/useQuery.js`: `useQuery(loader | null, deps)` → `{ data, loading, error, reload, setData }`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** 28 files (most screens, `useUnreadCount`, `AvailabilityStrip`, `ShareSheet`).

#### `mobile/src/hooks/useUnreadCount.ts`
**What:** Live count of conversations with unread messages (shared `unreadCount` + `subscribeToInbox`), rechecked on navigation and app foreground.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** route `/_layout` (Inbox tab badge).

### src/lib/

#### `mobile/src/lib/supabase.ts`
**What:** The app's single Supabase client (`createClient<Database>`), session in AsyncStorage, auto-refresh paused/resumed with `AppState`, `detectSessionInUrl: false`. Warns if `.env` is missing.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** **Metro redirect target for `frontend/src/lib/supabase.js`** — so every shared `api/*.js` module uses it; directly by `lib/beforeAfter.ts`, `screens/SignIn.tsx`, `screens/account/MeParts.tsx`, `screens/account/ResetPassword.tsx`, `screens/account/Welcome.tsx`, `screens/account/authLink.ts`, `screens/inbox/ModerationSheet.tsx`, `state/auth.tsx`.
**Notes:** Email-link sessions are completed by `screens/account/authLink.ts`, not by URL detection.

#### `mobile/src/lib/a11y.ts`
**What:** Screen-reader/motion helpers: `announce()`, `useReduceMotion()`, `useScreenReader()`, `focusOn(ref)`, `useFocusOnShow(open)`, `TOGGLE_ROLE` / `IMAGE_BUTTON_ROLE` (web-safe roles).
**Made:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes" (briankimdw). **Last changed:** same commit.
**Used by:** 21 files, e.g. `Sheet`, `Toast`, `BeforeAfter`, `SwipeCard`, `SwipeDeck`, `EditorScreen`, `Chat`, `SortableGrid`.

#### `mobile/src/lib/photo.ts`
**What:** `BRAND = 'photomatch'` and `isPhotoListing(p)` (shared `isPhotoVertical`, counts old `videography` rows) for the photography-only product.
**Made:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps" (briankimdw). **Last changed:** same commit.
**Used by:** `components/share/ShareSheet.tsx`, `screens/SignIn.tsx`, `screens/account/AuthCallback.tsx`, `screens/account/MeParts.tsx`, `screens/provider/Upload.tsx`, `state/store.tsx`.

#### `mobile/src/lib/beforeAfter.ts`
**What:** Looks up the "before" photo of before & after posts when the data lacks it (shared chat cards): `useBeforePhotos(albumIds)`, `beforePhotosOf`, `forgetBeforePhoto`; session cache.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `components/share/ShareCard.tsx`, `screens/provider/upload/PostPhotos.tsx`, `screens/provider/upload/uploadQueue.ts`.
**Notes:** TODO in file: drop it if shared `messages.js` `toShared()` returns `beforeSrc`.

### src/shims/

Loaded by `index.ts` → `install.ts` before any shared code. Each fills a browser global only when missing, so the web target keeps the real APIs.

#### `mobile/src/shims/install.ts`
**What:** Installs the URL polyfill, `env`, `localStorage`/`sessionStorage`, `navigator.geolocation`, `crypto.randomUUID`/`getRandomValues` (expo-crypto) and `DOMException`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `mobile/index.ts` (first import).

#### `mobile/src/shims/env.ts`
**What:** Reads `EXPO_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY` / `EXPO_PUBLIC_ML_URL`; exports `ENV` and `SHARED_ENV` and sets `globalThis.__SHARED_ENV__` (what shared `import.meta.env` becomes).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** `shims/install.ts`, `lib/supabase.ts`; indirectly every shared file that reads `import.meta.env` (via `babel/shared-env-plugin.js`).
**Notes:** `DEV` is deliberately `false` (shared code uses it for web-only dev tools).

#### `mobile/src/shims/storage.ts`
**What:** Synchronous `localStorage` (in-memory Map hydrated from / written through to AsyncStorage, `ls:` prefix) and in-memory `sessionStorage`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `shims/install.ts`; consumers are shared `api/locations.js` (last location) and `api/discover.js` (deck choice).
**Notes:** Reads in the first few ms after launch see an empty store.

#### `mobile/src/shims/geolocation.ts`
**What:** `navigator.geolocation.getCurrentPosition` on expo-location (asks permission; `code 1` = denied, `3` = timeout); `watchPosition` is not shimmed.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `shims/install.ts`; consumer is shared `api/locations.js` `getMyLocation()`.

#### `mobile/src/shims/images.ts`
**What:** Native stand-in for `frontend/src/lib/images.js` with the same exports (`quickCheck`, `MAX_PHOTOS`, `formatBytes`, display-copy/thumbnail making, camera settings from EXIF) on expo-image-manipulator, plus native extras `isHeic`, `toCompatible`, `makeDisplayFile`, `blobOfUri`, `fileBlob`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** **Metro redirect target for `frontend/src/lib/images.js`** (shared `api/portfolio.js` imports it); directly by `provider/upload/` (`PhotoPicker`, `PostPhotos`, `postApi`, `uploadQueue`, `usePhotoItems`).
**Notes:** Header says "not exercised yet, verify on a device": test HEIC photos and large camera files on a real iPhone.

### src/state/

#### `mobile/src/state/auth.tsx`
**What:** `AuthProvider` / `useAuth()` → `{ session, user, profile, loading, refreshProfile, needsWelcome, signOut }` (same shape as `frontend/src/auth.jsx`); `safeNext()` sanitises `?next=`; `Profile` type.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `0c958db` · "mobile: sign-in error handling, Android Google fallback, dev auth trace".
**Used by:** `app/_layout.tsx` (provider) and 33 other files (nearly every screen, `store.tsx`, `WelcomeGate`, `useUnreadCount`, `ShareSheet`).

#### `mobile/src/state/store.tsx`
**What:** `StoreProvider` / `useStore()`: follows, shortlist, likes, saves, "Not into this" corrections + taste profile, my photo/video listings (`myProvider`, `refreshProvider`, selected listing remembered in AsyncStorage), session swipe history, `toast()`. Port of `frontend/src/store.jsx` using shared `api/social`, `discover`, `portfolio`, `catalog`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `app/_layout.tsx` (provider), `components/Toast.tsx`, and 29 screens/components (discover, profile, bookings, inbox, provider, upload).

#### `mobile/src/state/WelcomeGate.tsx`
**What:** Renders nothing; when `needsWelcome` and not on an auth route, `router.replace('/welcome?next=…')` keeping the real query string (like the web `App.jsx`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `app/_layout.tsx`.

### src/ (top-level files)

#### `mobile/src/theme.ts`
**What:** Design tokens (`light` = the web's CSS variables with the accent deepened for contrast, `dark` = native-only), `radius`, `space`, `font`; `AppThemeProvider`, `useThemePreference()` (light default / dark / system, saved under `pm:theme`), `useTheme()`, `makeStyles()`, `readableTint()` / `useReadableTint()` / `contrastRatio()`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** ~90 files (both layouts, every component and screen).
**Notes:** Never hard-code hex in screens; use `c.*` tokens. The web has no dark mode, so dark values exist only here.

#### `mobile/src/types.ts`
**What:** `Provider`, `Person`, `Package`, `Review`, `Vertical` types inferred from the shared JS (`listProviders`, `getPerson`, `verticals/catalog.js`), so they follow the web code.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** 17 files, e.g. `ProviderCard`, `MapProviderCard`, `Search`, `Profile`, discover and home screens.

### src/screens/ (top level)

Each screen's header comment names the web screen it ports (`frontend/src/screens/*.jsx`); keep behaviour and wording in step with it.

#### `mobile/src/screens/Me.tsx`
**What:** Me tab: profile hero + edit, Hiring/Business switch; client view (bookings, shortlist, following, taste, collections) or business view (get-ready checklist, stat tiles, `Dashboard` tabs). `?tab=packages|calendar|requests|portfolio` opens a Dashboard tab.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** route `/me`.
**Notes:** Pieces live in `account/MeParts.tsx`, `account/ui.tsx` and `provider/Dashboard.tsx`.

#### `mobile/src/screens/Search.tsx`
**What:** `/search`: text search, photo/video service chips, dates (picker sheet + chips), list or map view (`ProviderMap`, "Search this area"), filters and sort sheets, availability footer with Book. Params `?q ?cat ?dates ?view=map ?focus ?bbox` like the web URL.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/search`.
**Notes:** Shared `api/catalog.js`, `api/locations.js` (needs the geolocation/storage shims).

#### `mobile/src/screens/SignIn.tsx`
**What:** `/sign-in` (modal): stepper start (Google / email) → email → password (log in or create, strength meter) → done, plus code entry, confirm, forgot. `?next=` returns there; `?mode=signup`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/sign-in`.
**Notes:** Google = Supabase OAuth in an in-app browser session; needs `exp://**` / `eventorganizer://**` as Supabase redirect URLs. Header comment still says "TODO: port AuthCallback", which is done (`account/AuthCallback.tsx`).

### src/screens/account/

#### `mobile/src/screens/account/AuthCallback.tsx`
**What:** `/auth/callback`: finishes an email-link sign-in from the incoming URL (`authLink.ts`), waits for the profile, then goes to `next` or `/welcome`. Also exports `useIncomingUrl()`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/auth/callback`, `screens/account/ResetPassword.tsx` (`useIncomingUrl`).

#### `mobile/src/screens/account/authLink.ts`
**What:** `parseAuthUrl` / `completeAuthFromUrl`: handles every Supabase link shape (`?code` PKCE, `#access_token` implicit, `?token_hash&type` verifyOtp, `error_description`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/SignIn.tsx`, `screens/account/AuthCallback.tsx`, `screens/account/ResetPassword.tsx`.
**Notes:** Needed because the native client has `detectSessionInUrl: false`. Test real email links on a device (only work where the app is installed).

#### `mobile/src/screens/account/ResetPassword.tsx`
**What:** `/reset-password`: set a new password, reached from the reset email (signs you in for this step) or from Settings.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches".
**Used by:** route `/reset-password`.

#### `mobile/src/screens/account/Welcome.tsx`
**What:** `/welcome`: one-time name + username (live availability) and "what brings you here" ("I offer a service" → `/new-listing`) for brand-new accounts.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/welcome`; reached via `state/WelcomeGate.tsx` and `AuthCallback`.

#### `mobile/src/screens/account/Settings.tsx`
**What:** `/settings`: account rows (unbuilt features say so), Appearance (Light / Dark / System, native-only, via `useThemePreference`), sign out.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/settings`.

#### `mobile/src/screens/account/Verify.tsx`
**What:** `/verify`: identity-verification status from the listing; Stripe Identity isn't built, so it explains what's coming.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/verify`.

#### `mobile/src/screens/account/MeParts.tsx`
**What:** Me-tab pieces: `SignedOut` pitch, `ProfileHero` (with edit-profile sheet), `RoleSwitch`, `StatTile`, `ClientView`, `rating`, `ACTIVE`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/Me.tsx`.

#### `mobile/src/screens/account/ui.tsx`
**What:** Small layout pieces (the web's `.list-row`, `.settings-group`, …): `SectionLabel`, `RoundIcon`, `ListRow`, `Group`, `SoonTag`, `ToggleRow`, `Callout`, `FieldHint`, `FormError`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** 11 files, e.g. `screens/Me.tsx`, `screens/account/Settings.tsx`, `screens/account/Verify.tsx`, `screens/inbox/ChatInfo.tsx`, `screens/inbox/ModerationSheet.tsx`.
**Notes:** Despite the folder, it is shared by account, inbox and provider screens. A different `Callout` exists in `bookings/parts.tsx`.

### src/screens/auth/

#### `mobile/src/screens/auth/AuthUI.tsx`
**What:** Auth building blocks (native counterparts of `frontend/src/components/auth/*`): `AuthButton`, `TextLink`, `GoogleLogo`, `AuthField`, `PasswordField` (live strength via shared `authKit.js`), `CodeInput`, `AuthMessage`, `Badge`, `Legal`.
**Made:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/SignIn.tsx`, `screens/account/AuthCallback.tsx`, `screens/account/ResetPassword.tsx`, `screens/account/Welcome.tsx`.

### src/screens/bookings/

#### `mobile/src/screens/bookings/Bookings.tsx`
**What:** Bookings tab: calendar of your bookings (tap dates to see bookings or find free photographers), "Needs your attention", Upcoming / Past segmented list.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** route `/bookings`.

#### `mobile/src/screens/bookings/BookingRequest.tsx`
**What:** `/book/[providerId]`: package, hours (or quantity for legacy units), dates from a 4-week free-day strip (`?dates=` preselects), start time, location, add-ons, notes, live total; one request per date.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/book/[providerId]`.

#### `mobile/src/screens/bookings/BookingDetail.tsx`
**What:** `/bookings/[id]`: who/when/where, status-specific actions for client or pro (respond, counter, accept, deposit placeholder, deliver/done, accept delivery), timeline, price, cancellation.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/bookings/[id]`.

#### `mobile/src/screens/bookings/Delivery.tsx`
**What:** `/bookings/[id]/delivery`: real delivery status and "accept delivery" (no in-app gallery storage; pros share a link in chat).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/bookings/[id]/delivery`.

#### `mobile/src/screens/bookings/Review.tsx`
**What:** `/bookings/[id]/review`: leave/read double-blind reviews (hidden until both post or 14 days pass).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/bookings/[id]/review`.

#### `mobile/src/screens/bookings/NeedsAction.tsx`
**What:** Prop-less "Needs your attention" / "Your bookings" tiles; loads the client's bookings itself, renders nothing when signed out or empty. Also `needsActionText`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/bookings/BookingDetail.tsx`, `screens/bookings/Bookings.tsx`, `screens/bookings/Delivery.tsx`, `screens/bookings/Review.tsx`, `screens/home/Home.tsx`.

#### `mobile/src/screens/bookings/parts.tsx`
**What:** Booking UI bits (the web's `components/Booking.jsx`): `StatusPill`, `statusLabel`, `StatusTimeline`, `PolicyTable`, `Row`, `PersonRow`, `Callout`, `Note`, `Summary`, `TotalRow`, `useRefocus`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** 9 files, e.g. `screens/account/MeParts.tsx`, `screens/bookings/BookingDetail.tsx`, `screens/bookings/BookingRequest.tsx`, `screens/bookings/Bookings.tsx`, `screens/bookings/Delivery.tsx` (also `Me` parts, `Chat`, `Dashboard`).

### src/screens/discover/

#### `mobile/src/screens/discover/Discover.tsx`
**What:** Discover tab: "For you" (`SwipeDeck`) and "Explore" (`Explore`) modes switched in the header, mode and `?s=` service kept in route params.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/discover`.

#### `mobile/src/screens/discover/SwipeDeck.tsx`
**What:** "For you" deck: shared `getDeck()` in small batches (photo cards, vendor cards for photographers without posts), `logSwipe`/`undoSwipe`, % match, "Not into this", service chip remembered via `read/writeDeckChoice`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/discover/Discover.tsx`.

#### `mobile/src/screens/discover/SwipeCard.tsx`
**What:** One deck card on gesture-handler + reanimated: right = like, left = pass, up = shortlist (`THRESHOLD`); tap zones flip photos / open details / "Not into this" / profile; hold to peek the before photo. Also `BehindCard`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/discover/SwipeDeck.tsx`.
**Notes:** Remount per card (`key={card.id}`). Gesture race (pan vs tap vs 250 ms hold) is worth checking on a real iPhone.

#### `mobile/src/screens/discover/VendorFace.tsx`
**What:** Face of a vendor card (no posts): newest covers or the vertical's icon on top, name/badges/rating/price, key attributes and package preview below; `useNextFree`.
**Made:** 2026-10-12 · `c7028db` · "Discover for every vertical (web + mobile), demo vendor portfolios" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/discover/SwipeCard.tsx`.

#### `mobile/src/screens/discover/DeckSheets.tsx`
**What:** The deck's sheets: `DetailsSheet`, `CorrectSheet` ("Not into this"), `TasteSheet`, `ShortlistSheet`, `MatchOverlay` ("You keep liking X's work"), `MatchPct`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/discover/SwipeDeck.tsx`.

#### `mobile/src/screens/discover/DiscoverHeader.tsx`
**What:** Header row with the For you | Explore tabs and action buttons; `PillButton`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-11 · `83f478d` · "Sign-in/sign-up redesign, full UI overflow sweep, smaller feed batches".
**Used by:** `screens/discover/Explore.tsx`, `screens/discover/SwipeDeck.tsx`.

#### `mobile/src/screens/discover/Explore.tsx`
**What:** "Explore": two-column masonry of real work (shared `api/home.js` `listExplorePhotos`, `buildExploreTiles`, `masonry`…), service filter chips, vendor tiles between photos, pages of 24; before & after tiles with hold-to-peek.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/discover/Discover.tsx`.

#### `mobile/src/screens/discover/cards.ts`
**What:** Pure helpers for deck cards: `packagePreview` (up to 2 packages, cheapest first) and `cardA11yLabel` (the card's single screen-reader label).
**Made:** 2026-10-12 · `c7028db` · "Discover for every vertical (web + mobile), demo vendor portfolios" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** `screens/discover/SwipeCard.tsx`, `screens/discover/VendorFace.tsx`.

#### `mobile/src/screens/discover/types.ts`
**What:** Deck types as shared `getDeck()` returns them: `DeckPhoto`, `PhotoDeckCard`, `VendorDeckCard`, `DeckCard`, `SwipeAction`, `HistoryEntry`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-12 · `c7028db` · "Discover for every vertical (web + mobile), demo vendor portfolios".
**Used by:** `screens/discover/DeckSheets.tsx`, `screens/discover/SwipeCard.tsx`, `screens/discover/SwipeDeck.tsx`, `screens/discover/VendorFace.tsx`, `screens/discover/cards.ts`.

### src/screens/gallery/

#### `mobile/src/screens/gallery/Gallery.tsx`
**What:** `/gallery/[personId]?post=&photo=`: loads the provider (id, profile id or slug) and albums (shared `getProvider`, `listAlbums`/`toViewerAlbum`) and opens `AlbumViewer`; `galleryScreenOptions` (fade, dark background).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** route `/gallery/[personId]`, `screens/gallery/PostRedirect.tsx` (renders `Gallery`).

#### `mobile/src/screens/gallery/AlbumViewer.tsx`
**What:** Full-screen portfolio viewer: vertical paging between albums, horizontal between photos, pinch-peek zoom, hold to hide overlays, pull down to close; before & after posts use `BeforeAfter`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/gallery/Gallery.tsx`.
**Notes:** TODOs in file: persistent zoom/pan, double-tap zoom, owner edit/delete, collections picker, report/block.

#### `mobile/src/screens/gallery/PostRedirect.tsx`
**What:** `/post/[id]` (album id, e.g. from shared chat posts): looks up the album and replaces itself with the gallery at that album.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** route `/post/[id]`.

### src/screens/home/

#### `mobile/src/screens/home/Home.tsx`
**What:** Home tab: header, search launcher, service chips (→ `/search?cat=`), `NeedsAction`, first shelf, Explore teaser, other shelves, "Shoot photo or video?" card. Data from shared `api/home.js` (`listBrowseProviders`, `weekendAvailability`, `buildHomeFeed`) so shelves match the web.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/`.

#### `mobile/src/screens/home/HomeHeader.tsx`
**What:** `HomeHeader` (greeting, title, Post button) and `SearchLauncher` (opens `/search`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/home/Home.tsx`.

#### `mobile/src/screens/home/ProviderShelves.tsx`
**What:** `ProviderShelf` (horizontal big tiles) and `ProviderList` (rows), each with its own loading/error state.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/home/Home.tsx`.

#### `mobile/src/screens/home/Browse.tsx`
**What:** `useInvite()` (invite a photographer via RN `Share`), `JoinCard` (list your work / invite), `ExploreTeaser` (three shots → Explore).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/discover/Explore.tsx`, `screens/discover/SwipeDeck.tsx`, `screens/home/Home.tsx` (`useInvite` in the discover screens).
**Notes:** TODO: append a public web/store link to the invite text once one exists.

### src/screens/inbox/

#### `mobile/src/screens/inbox/Inbox.tsx`
**What:** Inbox tab: conversations (direct, group, booking, inquiry), newest first, unread dots; live via `subscribeToInbox` and on focus.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/inbox`.

#### `mobile/src/screens/inbox/Chat.tsx`
**What:** `/inbox/[id]`: realtime messages, read receipts, typing (shared `openChat`), optimistic send with retry/delete, day separators, pinned booking, details sheet, long-press report/block; inverted `FlatList` in `KeyboardView`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/inbox/[id]`.
**Notes:** Old event chats render as group chats. Keyboard behaviour needs a real-device check.

#### `mobile/src/screens/inbox/ChatInfo.tsx`
**What:** Conversation details sheet: members; groups can add people / rename / leave, one-to-one can report or block.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/inbox/Chat.tsx`.

#### `mobile/src/screens/inbox/ModerationSheet.tsx`
**What:** Report / block sheet for a profile, provider, album, photo, message or review target.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/inbox/Chat.tsx` only (Profile and AlbumViewer list report/block as TODO).

#### `mobile/src/screens/inbox/NewMessage.tsx`
**What:** `/inbox/new`: pick one person (direct) or several (group) with `PeoplePicker`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** route `/inbox/new`.

#### `mobile/src/screens/inbox/PeoplePicker.tsx`
**What:** Search people by name/@username and pick one or more; empty box lists people you've talked to; `exclude` ids.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/inbox/ChatInfo.tsx`, `screens/inbox/NewMessage.tsx`.

### src/screens/profile/

#### `mobile/src/screens/profile/Profile.tsx`
**What:** `/u/[id]` (provider id, profile id, slug or username via shared `getPerson`): header (cover, viewable avatar, badges, city → map, rating, followers), follow/shortlist/message/book, your-dates card + availability strip, About, tabs (Portfolio, Packages + service-area map + policy, Gear, Reviews).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** route `/u/[id]`.
**Notes:** TODO in file: report/block menu, scroll to tabs on rating tap.

#### `mobile/src/screens/profile/AlbumGrid.tsx`
**What:** 3-column grid of album covers (before & after posts badged); `Album` type.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/gallery/AlbumViewer.tsx`, `screens/gallery/Gallery.tsx`, `screens/profile/Profile.tsx`.

#### `mobile/src/screens/profile/PackageList.tsx`
**What:** A provider's packages and add-ons with each vertical's key facts; `onSelect` starts a booking with that package.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/profile/Profile.tsx`.

#### `mobile/src/screens/profile/AttributeList.tsx`
**What:** Read-only provider/package vertical fields from shared `attributeEntries()` (named export `AttributeList`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/profile/PackageList.tsx`, `screens/profile/Profile.tsx`.
**Notes:** Near-duplicate of `provider/AttributeList.tsx` (default export, used by Dashboard); candidates to merge.

#### `mobile/src/screens/profile/FollowersSheet.tsx`
**What:** Sheet of who follows a provider; each row opens that person.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/profile/Profile.tsx`.

#### `mobile/src/screens/profile/ReviewList.tsx`
**What:** `ReviewList` (tap reviewer → profile, tap review → `ReviewSheet` with the full text and what it was for).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/profile/Profile.tsx`.

### src/screens/editor/

The native photo editor (added in `23f183e`, AI tab in `8b9994d`). It is a modal, not a route: `PhotoEditorModal` is opened from `/upload` (`provider/Upload.tsx`) and from My work's post view (`provider/upload/PostPhotos.tsx`). Rendering is **Skia** (`@shopify/react-native-skia`) running the shared SkSL shader from `frontend/src/lib/editor/colorMath.js`; recipes, geometry and auto-enhance are the shared `frontend/src/lib/editor/*` (typed in `contract.ts`), so a recipe edited on the phone renders identically on the web and back. Flow: `PhotoEditor` (loads Skia, lazy-imports) → `EditorScreen` (history, tools) → `pipeline` (shader + uniforms) → `exportImage` (full-res JPEG).

#### `mobile/src/screens/editor/PhotoEditor.tsx`
**What:** Public API: `PhotoEditorModal` (`visible`, `source`, `initialRecipe`, `mode` post|reedit, `allowBeforeAfter`, `onDone({ uri, recipe, width, height, makeBeforeAfter })`, `onCancel`) and `PhotoEditor`; waits for `loadSkia()` then lazy-imports `EditorScreen`.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/Upload.tsx`, `screens/provider/upload/PostPhotos.tsx` (both use `PhotoEditorModal`).

#### `mobile/src/screens/editor/EditorScreen.tsx`
**What:** The editor UI: top bar (Cancel, undo/redo/reset, Done), Skia canvas preview, summary + "Before & after" switch, the active tool panel and `ToolTabs`. History holds a `Work` (recipe + which working photo), so Undo also steps over AI results.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** `editor/PhotoEditor.tsx` (dynamic `import('./EditorScreen')`; the JSON records it as an import).
**Notes:** Memory on large photos: preview and export decode separately (`loadImage.ts`). Try a 48 MP iPhone photo on a real device.

#### `mobile/src/screens/editor/ToolTabs.tsx`
**What:** Bottom tool tabs Presets · Light · Color · Effects · Crop · AI (`TOOLS`, `ToolId`), a real tab list for screen readers.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/panels.tsx`
**What:** Tool panels: `AdjustPanel` (sliders for Light/Color/Effects), `PresetPanel` (thumbnails rendered with the same shader), `CropPanel` (aspects, rotate, flip, straighten).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/EditSlider.tsx`
**What:** Lightroom-style slider: relative drag on the UI thread, haptic detent at the default, double-tap reset, screen-reader adjustable with a Reset action.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/AiPanel.tsx`, `screens/editor/panels.tsx`.

#### `mobile/src/screens/editor/CropOverlay.tsx`
**What:** Crop box over the straightened photo: drag handles to resize (aspect kept), drag inside to move, pinch to scale; all through shared `geometry.js` (`resizeCrop`, `moveCrop`, `constrain`).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/useHistory.ts`
**What:** Undo/redo hook: `value`, `preview(next)` (live, not an undo step), `commit(next)`, `undo`, `redo`, `canUndo`, `canRedo`, `reset(to)`.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/contract.ts`
**What:** Typed re-export of the shared plain-JS editor contract (`lib/editor/recipe.js`, `geometry.js`): `EditRecipe`, `Crop`, `Adjust`, `ADJUSTMENTS`, `PRESETS`, `ASPECTS`, `normalize`, `describe`, `toStorable`, `geometryMatrix`, `outputSize`, crop helpers, rotate/flip.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** 10 files, e.g. `screens/editor/CropOverlay.tsx`, `screens/editor/EditorScreen.tsx`, `screens/editor/ai/auto.ts`, `screens/editor/ai/useAiEditor.ts`, `screens/editor/ai/work.ts`.
**Notes:** Read-only view; change the recipe format in `frontend/src/lib/editor/*` (affects the web).

#### `mobile/src/screens/editor/pipeline.ts`
**What:** Render pipeline: the shared `SKSL_SHADER` (from `colorMath.js`) as a Skia runtime effect (`getEffect`), `uniformsFor` (geometry + colour uniforms), `makeBlur` (clarity), `childShaders`; one pass does geometry + colour for preview, preset thumbnails and export.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** 8 files, e.g. `screens/editor/CropOverlay.tsx`, `screens/editor/EditorScreen.tsx`, `screens/editor/ai/AiOverlay.tsx`, `screens/editor/ai/MaskLayer.tsx`, `screens/editor/ai/work.ts`.

#### `mobile/src/screens/editor/loadImage.ts`
**What:** `loadPreview` (EXIF-upright JPEG via expo-image-manipulator, long edge `PREVIEW_EDGE`) and `loadFull` (up to `EXPORT_SOURCE_EDGE`, only at Done), `downscale`. Web target: Skia decodes the URL directly.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/ai/work.ts`.

#### `mobile/src/screens/editor/exportImage.ts`
**What:** Full-resolution export: same shader into an offscreen surface (`renderToImage`), JPEG-encoded to the cache folder (`saveJpeg`); `EXPORT_MAX_EDGE`, `EXPORT_QUALITY`.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/ai/auto.ts`, `screens/editor/parity.ts`.

#### `mobile/src/screens/editor/surface.ts`
**What:** `makeSurface` (offscreen GPU surface on iOS/Android with CPU fallback; CPU raster on web to avoid leaking WebGL contexts) and `quiet` (hides CanvasKit objects from React 19 dev prop-diff logging).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/composite.ts`, `screens/editor/ai/files.ts`, `screens/editor/ai/work.ts`, `screens/editor/exportImage.ts`, `screens/editor/loadImage.ts`, `screens/editor/pipeline.ts`.

#### `mobile/src/screens/editor/skia.ts`
**What:** `loadSkia()` for iOS/Android/Expo Go: Skia is built in, resolves immediately.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `editor/PhotoEditor.tsx`.

#### `mobile/src/screens/editor/skia.web.ts`
**What:** Web-target `loadSkia()`: loads CanvasKit wasm from jsDelivr (exact version Skia depends on) before any Skia module is evaluated.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** platform file used on web only (Metro resolves `./skia` to it in web bundles); must never enter a native bundle (canvaskit-wasm needs Node `fs`).

#### `mobile/src/screens/editor/chrome.ts`
**What:** Editor surface colours `EDITOR_BG` / `EDITOR_BG_RGB` (neutral grey in light theme, black in dark).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/PhotoEditor.tsx`.

#### `mobile/src/screens/editor/types.ts`
**What:** Public editor types: `PhotoEditorMode`, `PhotoEditorResult`, `PhotoEditorProps` (recipe shape owned by shared `recipe.js`).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/PhotoEditor.tsx`; `Upload.tsx` gets `PhotoEditorResult` re-exported through `PhotoEditor.tsx`.

#### `mobile/src/screens/editor/parity.ts`
**What:** Dev check comparing the Skia shader against the shared CPU reference `colorMath.applyToPixel`, pixel by pixel, over `PARITY_CASES` (`runParity()`, `PARITY_TOLERANCE`).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** dev tool, not bundled by any screen — run in a dev build or the web target: `import { runParity } from '@/screens/editor/parity'; runParity()`.

### src/screens/editor/ai/

The editor's AI tab (Auto, Background, Erase, Upscale) on top of the shared `frontend/src/api/ai.js`, which calls the Python ML service at `EXPO_PUBLIC_ML_URL` (mapped to `VITE_ML_URL` by `shims/env.ts`; see `docs/AI_TOOLS.md`). Empty URL = tools off. AI results become the new working photo; the recipe keeps applying on top.

#### `mobile/src/screens/editor/ai/useAiEditor.ts`
**What:** AI tab state: server capabilities, one cancellable request at a time, errors, per-tool options; commits results into the editor's history (`AiTool`, `Work`, `AiEditor`).
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/ai/AiOverlay.tsx`, `screens/editor/ai/AiPanel.tsx`.

#### `mobile/src/screens/editor/ai/AiPanel.tsx`
**What:** The AI panel: Auto · Background · Erase · Upscale with options, progress + Cancel, errors with a way forward; unavailable tools greyed with the reason.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/ai/AiOverlay.tsx`
**What:** What the AI tab draws over the photo: the background cut-out over checkerboard/colour/blur until Use/Discard, or the Erase `MaskLayer`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/EditorScreen.tsx`.

#### `mobile/src/screens/editor/ai/MaskLayer.tsx`
**What:** Paint the Erase mask: brush (Skia paths, gesture-handler Pan, translucent red) or a 3×3 tap grid of labelled toggles (screen-reader friendly); `MASK_COLOR`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/AiOverlay.tsx`.

#### `mobile/src/screens/editor/ai/mask.ts`
**What:** Resolution-free mask model: `Stroke`, `AREAS` (3×3 grid), `brushPath`, `coverage`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/MaskLayer.tsx`, `screens/editor/ai/useAiEditor.ts`, `screens/editor/ai/work.ts`.

#### `mobile/src/screens/editor/ai/client.ts`
**What:** Native adapters for shared `api/ai.js`: `aiCapabilities`, `removeBackground`, `eraseObject`, `upscale`, `aiBaseUrl`, error helpers; file parts with `bytes()` for expo/fetch and FileReader for RN Blob results.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/useAiEditor.ts`.
**Notes:** On a phone the ML URL must be the PC's LAN IP, not localhost. `EXPO_PUBLIC_USE_RN_FETCH=1` switches to RN's own fetch.

#### `mobile/src/screens/editor/ai/work.ts`
**What:** How AI results fit the non-destructive editor: `Base` (working photo), `workingInput`, `workingEdge`, `maskForInput` (maps the shown mask to working-photo pixels via shared geometry), `makeBase`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/useAiEditor.ts`.

#### `mobile/src/screens/editor/ai/files.ts`
**What:** Image files for AI requests: `writeImage`/`saveBytes` (Skia → file), `decodeImage` (result → Skia, alpha kept), `discard`, `rgbaOf`; cache files on native, blob: URLs on web.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** `screens/editor/EditorScreen.tsx`, `screens/editor/ai/auto.ts`, `screens/editor/ai/client.ts`, `screens/editor/ai/useAiEditor.ts`, `screens/editor/ai/work.ts`.

#### `mobile/src/screens/editor/ai/composite.ts`
**What:** Backgrounds behind a cut-out (`Backdrop`, `BACKDROP_COLORS`, `flatten`, blur) and the transparency `checkerTile`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/AiOverlay.tsx`, `screens/editor/ai/AiPanel.tsx`, `screens/editor/ai/useAiEditor.ts`.

#### `mobile/src/screens/editor/ai/auto.ts`
**What:** Auto-enhance using shared `lib/editor/auto.js` on pixels from a small Skia render (crop/rotation, no colour): `autoFor`, `applyAuto`, `isAutoApplied`, `describeAuto`.
**Made:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/editor/ai/useAiEditor.ts`.

### src/screens/provider/

Photographer-side screens (listing, dashboard, posting, my work).

#### `mobile/src/screens/provider/Dashboard.tsx`
**What:** Business-mode tabs on the Me tab: Requests, Calendar (+ blackouts), Packages (`PackageFields`), Portfolio, Service area; exports `BOOKED`, `DashTab`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/Me.tsx` (no route of its own).

#### `mobile/src/screens/provider/NewListing.tsx`
**What:** `/new-listing`: set up the one photo & video listing (name, link, city, services), then post first work. Inner `Shell`, `ListingSetup`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** route `/new-listing`.

#### `mobile/src/screens/provider/Upload.tsx`
**What:** `/upload`: post work in two steps — photos (`PhotoPicker`, editor, before/after pair) then details (`PostFields`, camera settings) — handed to the upload queue; shows `JobStatus` / `Posted`. People without a listing get a way to set one up.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** route `/upload`.
**Notes:** Upload is marked "untested on device" in README; test HEIC, camera photos and backgrounding on a real iPhone.

#### `mobile/src/screens/provider/MyWork.tsx`
**What:** `/my-work`: your posts grid (open, reorder with arrows, manage), in-progress uploads on top (resumes the queue); `?post=<album id>` shows `PostPhotos` + details/delete (`ManagePost`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** route `/my-work`.

#### `mobile/src/screens/provider/ManagePost.tsx`
**What:** Owner sheets for a post: menu, edit form (`PostFields`), delete confirmation (`ManagePostSheets`, `ViewerAlbum`, `ManageSheet`).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/provider/MyWork.tsx`.

#### `mobile/src/screens/provider/AiReview.tsx`
**What:** `/ai-review/[id]`: review status of one of my albums (no automated AI check yet; "in review" only if the team put it there).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** route `/ai-review/[id]`.

#### `mobile/src/screens/provider/PackageFields.tsx`
**What:** Form for a vertical's custom package fields (number/text/select-as-chips/tags/boolean), grouped Photo / Video; run values through shared `cleanAttributes` before saving.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `fba56f4` · "Photography-only pivot: web and mobile apps".
**Used by:** `screens/provider/AttributeList.tsx`, `screens/provider/Dashboard.tsx`.

#### `mobile/src/screens/provider/AttributeList.tsx`
**What:** Read-only listing/package custom fields (default export), from shared `attributeEntries()`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/Dashboard.tsx`.
**Notes:** Duplicates `profile/AttributeList.tsx` (named export); also imports `FieldDef` from `PackageFields`.

#### `mobile/src/screens/provider/ServiceArea.tsx`
**What:** Base location (shared geocode search or my location) + travel radius (`Stepper`), shown on `MapPreview`; the native take on the web's Leaflet `ServiceAreaEditor`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/Dashboard.tsx`.

#### `mobile/src/screens/provider/Stepper.tsx`
**What:** − value + control over a list of stops (stands in for web range sliders: deposit %, radius).
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-10 · `d0970c2` · "Mobile: QA fixes and accessibility pass; shared name and deck fixes".
**Used by:** `screens/provider/Dashboard.tsx`, `screens/provider/ServiceArea.tsx`.

### src/screens/provider/upload/

Posting internals. The queue persists jobs so posts survive leaving the screen, going offline and closing the app.

#### `mobile/src/screens/provider/upload/uploadQueue.ts`
**What:** Persistent upload queue (AsyncStorage `pm:upload-queue:v1`, photos copied to documents): `enqueuePost`, `useUploadJobs`, `resumeJobs` (also on app foreground), `retryJob`, `cancelJob`, `dismissJob`, `getJob`, `jobFraction`. Runs shared `createPostDraft` → `uploadPostPhoto` (2 at a time) → `publishPost`.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` · "Cleanup: remove dead code, unused deps and stale docs".
**Used by:** `screens/provider/MyWork.tsx`, `screens/provider/Upload.tsx`, `screens/provider/upload/PostingStatus.tsx`, `screens/provider/upload/usePhotoItems.ts`.
**Notes:** Expo Go has no background upload: JS pauses in the background and jobs resume on reopen. Verify on a real phone.

#### `mobile/src/screens/provider/upload/usePhotoItems.ts`
**What:** Photos being prepared: picker assets → checks (`quickCheck`), HEIC→JPEG, thumbnail, EXIF camera settings (never GPS), duplicate/low-res hints, background display copy; editor results; `forQueue()`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` · "Studio (miniPaint) and AI photo tools for web and mobile".
**Used by:** `screens/provider/Upload.tsx`, `screens/provider/upload/PhotoPicker.tsx`, `screens/provider/upload/PostFields.tsx`.

#### `mobile/src/screens/provider/upload/PhotoPicker.tsx`
**What:** Step 1: pick (multi-select) or shoot photos; selected photo large with hints and tools (Edit, Make cover, Remove, Move); `SortableGrid` ordering; before & after mode with two slots or "make one from a single photo".
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/provider/Upload.tsx`.

#### `mobile/src/screens/provider/upload/PostFields.tsx`
**What:** Post detail fields: `CategoryField`, `TitleField`, `CaptionField`, `PlaceDateFields` (YYYY-MM-DD text date), `Disclosure`, `CameraSettings` (+ `useHiddenSet`, `settingsSummary`), `validatePost`, `LIMITS`.
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/provider/ManagePost.tsx`, `screens/provider/Upload.tsx`.

#### `mobile/src/screens/provider/upload/PostPhotos.tsx`
**What:** One post's photos editable in place: select, drag to reorder, Edit (private original + saved recipe), Revert, Replace, Make cover, Remove; before & after: slider + per-side tools + Swap.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/MyWork.tsx` (`?post=` view).

#### `mobile/src/screens/provider/upload/PostingStatus.tsx`
**What:** `JobStatus` (per-photo progress, retry, cancel), `Posted` (View / Share / Post another), `QueueBanner` ("Posting 2 of 5…").
**Made:** 2026-10-10 · `1f99925` · "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider".
**Used by:** `screens/provider/MyWork.tsx`, `screens/provider/Upload.tsx`.

#### `mobile/src/screens/provider/upload/SortableGrid.tsx`
**What:** Grid of square tiles reordered by hold-and-drag (gesture-handler + reanimated), tap to select, `onDragging` to pause parent scroll; screen-reader actions Move earlier / later / Make cover.
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/upload/PhotoPicker.tsx`, `screens/provider/upload/PostPhotos.tsx`.

#### `mobile/src/screens/provider/upload/postApi.ts`
**What:** Re-editing posted photos over shared `api/edits.js`: `openForEdit`, `saveReedit`, `revertPhoto`; reads files as bytes (Blob uploads are unreliable in RN).
**Made:** 2026-10-19 · `23f183e` · "Mobile: native photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** same commit.
**Used by:** `screens/provider/upload/PostPhotos.tsx`.

### Quick reference

| I want to… | Look at |
| --- | --- |
| Add a new screen/route | Screen in `mobile/src/screens/<area>/X.tsx`, one-line route in `mobile/src/app/<path>.tsx` (`export { default } from '@/screens/…'`); mirror the web route in `frontend/src/App.jsx`. |
| Add or change a tab | `mobile/src/app/(tabs)/_layout.tsx` (+ a route file in `(tabs)/`) |
| Make a screen modal / change its animation | `<Stack.Screen>` options in `mobile/src/app/_layout.tsx` (see `galleryScreenOptions` in `gallery/Gallery.tsx`) |
| Use shared web data code | `import … from '@shared/api/….js'`; if it needs a browser API, add a shim in `src/shims/` (installed by `install.ts`) or a redirect in `metro.config.js` `REDIRECTS` + README "Portability issues" |
| Change env/config (Supabase, ML URL) | `mobile/.env` (template `.env.example`) → `src/shims/env.ts`; client in `src/lib/supabase.ts` |
| Change colours, spacing, dark mode | `mobile/src/theme.ts` (`light`/`dark` tokens, `makeStyles`); Appearance UI in `screens/account/Settings.tsx` |
| Change a button/text/sheet/empty state everywhere | `mobile/src/components/*` (barrel `components/index.ts`) |
| Change sign-in, email links, deep links | `screens/SignIn.tsx`, `screens/auth/AuthUI.tsx`, `screens/account/authLink.ts`, `AuthCallback.tsx`; scheme in `app.json`; Supabase Redirect URLs (README "Auth notes") |
| Change signed-in user state (likes, shortlist, follows, my listing, toast) | `mobile/src/state/store.tsx`; session/profile in `state/auth.tsx` |
| Change the Discover deck | `screens/discover/SwipeDeck.tsx` (data), `SwipeCard.tsx` (gestures), `DeckSheets.tsx` (sheets), shared `api/discover.js` |
| Change posting / upload behaviour | `screens/provider/Upload.tsx`, `upload/uploadQueue.ts`, `upload/usePhotoItems.ts`, `src/shims/images.ts`, shared `api/portfolio.js` |
| Change the photo editor or add a slider/preset | `screens/editor/EditorScreen.tsx`, `panels.tsx`; adjustments/presets/shader in shared `frontend/src/lib/editor/*` (affects web; check with `editor/parity.ts`) |
| Change the AI tools | `screens/editor/ai/*`, shared `frontend/src/api/ai.js`, ML service `services/ml` |
| Change maps | `components/map/ProviderMap.tsx` / `MapPreview.tsx` (+ `.web.tsx` fallbacks), `geo.ts` |
| Change chat / inbox | `screens/inbox/Chat.tsx`, `Inbox.tsx`, `hooks/useUnreadCount.ts`, shared `api/messages.js` |
| Change app name, icons, permissions | `mobile/app.json`, `mobile/assets/`, `BRAND` in `src/lib/photo.ts` |
| Check before committing | `npm run typecheck`, `npm run lint`, `npm run export:check` in `mobile/` |

---

## Backend, database, tools and docs

Covers everything outside `frontend/src/` and `mobile/`: the web app's config and scripts (`frontend/` minus `src/`), `supabase/`, `services/ml/`, `tools/`, `docs/` and the repo root files. Facts (who added a file, when, last change) come from `tools/codemap/codemap.json` (`node tools/codemap/scan.mjs > tools/codemap/codemap.json`); "Used by" was checked by grep, because SQL, docs and scripts have no imports. 168 tracked files are in scope.

### How the pieces connect

```
 web (frontend/, Vite :5173) ─┐                       ┌─► Supabase "Event Organizer" (ktjvbajrfrbwpndforcy)
 mobile (Expo, shares          ├─ supabase-js ─────────┤     Postgres 17 + RLS + RPCs, Auth, Storage, Realtime
   frontend/src/api via @shared)┘  (publishable key)    │     pg_cron jobs, pgvector
        │                                               │            ▲
        │  Bearer <Supabase access token>               │            │ service-role key (REST + /rpc/ml_*)
        └─► services/ml  (FastAPI :8000) ───────────────┘            │
              /ai/* tools (ONNX on CPU)       app.worker / POST /process-pending (SigLIP embeddings + auto-tags)
 backend/ (FastAPI :8001, gallery uploads, session denylist; not covered here)
```

- **Browser and app → Supabase directly.** There's no API server in between for normal data. Screens call `frontend/src/api/*.js` (the Expo app imports the same files through `@shared/api/...`), which query tables under Row-Level Security and call database functions (`supabase.rpc('…')`) for anything with rules: booking state changes, chats, the Discover feed. Keys: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local`. The service-role key only lives in `services/ml/.env` (the admin scripts read it from there too).
- **`services/ml` has two jobs.**
  1. **SigLIP worker.** It finds photos without an embedding (`ml_pending_photos()`), downloads them from the `portfolio` bucket, and saves a 768-d embedding plus `photos.auto_tags` through `ml_save_photo_analysis()`. It runs as `python -m app.worker`, or as `POST /process-pending` with the `X-ML-Secret` header (for a database webhook). The Discover feed itself (`discover_feed()`, `provider_matches()`) runs in SQL, so Discover keeps working when the service is down.
  2. **AI photo tools**: `GET /ai/capabilities`, `POST /ai/remove-background|erase|upscale`. Callers: the web editor's AI tab (`frontend/src/components/editor/ai/AiPanel.jsx` → `frontend/src/api/ai.js`) and mobile (`mobile/src/screens/editor/ai/client.ts`, same `ai.js`). They need `Authorization: Bearer <Supabase access token>`, which `app/auth.py` checks against `/auth/v1/user` (cached 60 s). They're rate-limited to 30 requests per user per 10 min. The base URL is `VITE_ML_URL` (mobile: `EXPO_PUBLIC_ML_URL`), defaulting to port 8000 on the page's host. CORS allows `localhost:5173` and LAN IPs on `:5173`.
- **Migrations.** `supabase/migrations/*.sql` are the source of truth. They were applied to the hosted project with the Supabase MCP/`db push` or pasted into the SQL Editor. **Checked against the hosted project's migration list on 2026-10-20: 20 of 22 are applied, through `20261013000000_discover_all_verticals`.** Not applied yet:
  - **`20261018000000_photography_only`**: destructive; follow `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.
  - **`20261020000000_photo_edits`**: the app detects the missing column and works without it.

  `supabase/pending/split_owner_policies.sql` is an optional extra that was declined. Two docs are behind on this: `docs/DATABASE.md` calls `feed_v2` "Written" (it's applied), and `docs/PROGRESS.md` still says share cards and all-verticals are "to apply" (they're applied).
- **Reference, demo and test data.**
  - `supabase/seed.sql`: categories and policies.
  - `frontend/scripts/seed-test-users.mjs`: 14 test accounts and 9 Photo & video listings from `docs/test-users.json`.
  - `supabase/demo/demo_data.sql`: packages, hours, bookings, reviews, chats.
  - `supabase/tests/*.sql`: tests you paste into the SQL Editor. They always roll back, and every line should end in `ok`.
  - `frontend/scripts/e2e/run.mjs`: end-to-end checks against the real database, signed in as the test users through the app's own `api/*.js`.
- **Scripts you run by hand** (all from `frontend/`):
  - `seed-test-users.mjs`
  - the photography-only trio: `backup-nonphoto.mjs` → paste `supabase/demo/photography_only_setup.sql` → `delete-nonphoto-users.mjs`
  - `scripts/e2e/run.mjs`

  Each one reads the service-role key from `services/ml/.env` (except e2e, which uses only the publishable key) and never prints it.
- **Studio build pipeline.** `node tools/studio/build.mjs` downloads miniPaint v4.14.3 at a pinned commit and checks its SHA-256. It installs the pinned build deps in a temp folder with `--ignore-scripts`, swaps the GPL AlertifyJS for an MIT shim, strips the upstream API keys and runs webpack with a licence gate. The output is committed to `frontend/public/studio/`, which `frontend/src/components/studio/Studio.jsx` loads in a same-origin iframe (`/studio/index.html`). It's web only: mobile has no Studio.

---

### Root files

#### `README.md`
**What:** Project front page. Covers photography-only status, a status table, the docs index, the "open decisions" table (`architecture.md` vs `docs/PLAN.md`), how to run the web app and the `backend/` note.
**Made:** 2026-10-08 · `f0866fc` "readme" (Timothy Phelps). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup: remove dead code, unused deps and stale docs" (briankimdw).
**Used by:** humans; links to most docs below. Current.

#### `THIRD_PARTY_NOTICES.md`
**What:** Licences for third-party code shipped with the app. Covers the Studio bundle (`frontend/public/studio/`: miniPaint MIT plus bundled packages) and the AI tool models and code (`services/ml`, `/ai/*`: BiRefNet, LaMa, Real-ESRGAN/SRVGG).
**Made:** 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw). **Last changed:** same.
**Used by:** referenced from `docs/STUDIO.md`, `services/ml/README.md`, `services/ml/app/ai/srvgg.py`, `services/ml/scripts/fetch_models.py`, `tools/studio/webpack.config.cjs`. Update it whenever the Studio pin or a model changes.

#### `.gitignore`
**What:** Ignores `.env` and `.env.*` (except `.env.example`), `.idea/` at any depth, `.orchestrator/`, `__pycache__/`, `specs/`, the e2e outputs (`frontend/scripts/e2e/last-report.json`, `last-cleanup.sql`) and `archive/event-platform/data-backup/` (real user data).
**Made:** 2026-10-08 · `eb26ea1` "architecture and git ignore" (Timothy Phelps). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Notes:** `frontend/.idea/` is now ignored but its 5 files are **still tracked**, because ignoring a path doesn't untrack it (`git rm -r --cached frontend/.idea` would).

#### `architecture.md`
**What:** Tim's original service-based backend design: ~8 FastAPI services, an event bus, the booking state machine, escrow, the media pipeline, recommendations, the AI planner and chat contact masking.
**Made:** 2026-10-08 · `eb26ea1` "architecture and git ignore" (Timothy Phelps). **Last changed:** never edited since.
**Used by:** referenced from `README.md` (open-decisions table), `docs/DATABASE.md`, `docs/PROGRESS.md`.
**Notes:** **Tim's document. Leave it to him.** It doesn't describe what was built: the build uses one Supabase project plus one ML service (see `docs/DATABASE.md` §1). The README lists where the two designs disagree.

---

### `frontend/` config, entry and tooling (not `src/`)

#### `frontend/package.json`
**What:** The web app manifest (`photographer-match-frontend`). Scripts: `dev`, `build`, `preview`. Dependencies: React 18, react-router-dom 6, `@supabase/supabase-js`, leaflet + react-leaflet, exifr, heic-to, lucide-react. Dev dependencies: Vite 5 and `@vitejs/plugin-react`. There is no test runner; tests use `node --test`.
**Made:** 2026-10-08 · `8367e87` "Add project plan and mobile React frontend prototype" (briankimdw). **Last changed:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw).
**Used by:** `npm install` / `frontend/start`. The admin and e2e scripts also resolve `@supabase/supabase-js` from here.

#### `frontend/package-lock.json`
**What:** npm lockfile for the above (1,906 lines).
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** 2026-10-19 · `2914c32` (briankimdw).
**Used by:** `frontend/start` reinstalls when this is newer than `node_modules/.package-lock.json`.

#### `frontend/vite.config.js`
**What:** Minimal Vite config (React plugin only). There are no aliases or proxy; the `@shared` alias is mobile-side.
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.
**Used by:** `npm run dev|build|preview`.

#### `frontend/index.html`
**What:** The Vite HTML shell (`<title>PhotoMatch</title>`, `#root`, loads `/src/main.jsx`, `viewport-fit=cover`).
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.
**Used by:** Vite entry.

#### `frontend/.env.example`
**What:** Template for `frontend/.env.local`:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable only)
- `VITE_ML_URL` (the ML service, default port 8000 on the page's host)
- `VITE_API_URL` (`backend/`, default port 8001)

**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** copied by hand. `frontend/start` refuses to run without `.env.local`, and `scripts/e2e/lib/env.mjs` reads `.env.local`.

#### `frontend/.gitignore`
**What:** `node_modules`, `dist`.
**Made:** 2026-10-08 · `8367e87` (briankimdw). **Last changed:** unchanged.

#### `frontend/start`
**What:** Bash launcher. It checks for `.env.local`, runs `npm install` when `node_modules` is missing or stale, then `npm run dev -- "$@"`. `bash ./start --host` also serves to the LAN.
**Made:** 2026-10-10 · `ee319d7` "orchestrator agent and start scripts for frontend and backend" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** the README's run instructions. Its sibling `backend/start` is outside this section.

#### `frontend/.idea/` (5 files: `.gitignore`, `frontend.iml`, `misc.xml`, `modules.xml`, `vcs.xml`)
**What:** JetBrains (WebStorm/PyCharm) project settings: module definition, VCS root `$PROJECT_DIR$/..`, and IDE-local ignores.
**Made:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** nothing in the build.
**Notes:** Committed by accident. The root `.gitignore` now ignores `.idea/`, but these stay tracked until someone runs `git rm --cached`.

### `frontend/public/studio/`: built Studio (miniPaint), generated

**Generated by `node tools/studio/build.mjs`. Don't edit by hand.** It's served as static files at `/studio/…`, and `frontend/src/components/studio/Studio.jsx` (`STUDIO_URL = BASE_URL + 'studio/index.html'`) opens it in an iframe. All files here were added in 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw) and never changed since.

#### `frontend/public/studio/index.html`
**What:** Our iframe page. Its layout markup is adapted from miniPaint's (MIT), and it loads `minipaint.js`.
**Used by:** `frontend/src/components/studio/Studio.jsx` (iframe `src`).

#### `frontend/public/studio/minipaint.js`
**What:** The minified webpack bundle (~1 MB, 2 lines): upstream miniPaint `src/` plus our bridge (`tools/studio/entry.js`, exposing `window.studioBridge`), with the AlertifyJS shim and theme CSS inlined.
**Used by:** `studio/index.html`. It loads only when Studio opens (`StudioLayer.jsx` is lazy).

#### `frontend/public/studio/minipaint.js.LICENSE.txt`
**What:** Licence banners that webpack extracted from the bundle.
**Used by:** referenced by the bundle's first line. Covered by `THIRD_PARTY_NOTICES.md`.

#### `frontend/public/studio/MINIPAINT-LICENSE.txt`
**What:** miniPaint's MIT licence (Copyright ViliusL), copied from upstream.
**Used by:** referenced from `studio/index.html` and `THIRD_PARTY_NOTICES.md`.

#### `frontend/public/studio/VERSION.json`
**What:** Build provenance: miniPaint `4.14.3`, commit `a79733eb…`, tarball URL, SHA-256, `builtAt`.
**Used by:** humans and reviewers. `build.mjs` writes it.

#### `frontend/public/studio/bundled-packages.json`
**What:** Name, version, licence and repo of every package inside the bundle. Written by `tools/studio/webpack.config.cjs` and used for the licence gate.
**Used by:** `THIRD_PARTY_NOTICES.md` (source of the list).

#### `frontend/public/studio/images/` (33 files)
**What:** miniPaint UI assets copied from upstream.
- **Root (2):** `logo.svg`, `logo-colors.png`.
- **`icons/` (31):** tool icons, mostly SVG: animation, arrow-down, blur, bold, brush, bulge_pinch, clone, crop, delete, desaturate, erase, fill, italic, magic_erase, media, menu, pencil, pick_color, refresh, select, selection, shape, sharpen, strikethrough, text, underline, undo, view. Plus PNGs: external, gradient, grid.

**Used by:** miniPaint CSS and markup inside the iframe.

#### `frontend/public/studio/src/js/libs/gifjs/gif.worker.js`
**What:** The gif.js Web Worker (minified, MIT). It's kept at the path miniPaint loads it from at runtime (animated GIF export).
**Used by:** `minipaint.js` (worker URL).

### `frontend/scripts/`: admin and seed scripts (Node, service role)

#### `frontend/scripts/lib/admin.mjs`
**What:** Shared helpers for the service-role scripts. It provides `ROOT`, `adminConfig()` (URL and service key from the environment or `services/ml/.env`, never printed), `adminClient()` and `must()`.
**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** `frontend/scripts/seed-test-users.mjs`, `backup-nonphoto.mjs`, `delete-nonphoto-users.mjs`.

#### `frontend/scripts/seed-test-users.mjs`
**What:** Creates the test accounts from `docs/test-users.json`: 9 photographers and creators with Photo & video listings, and 5 clients. It skips anything that already exists.
**Made:** 2026-10-08 · `7e398b0` "Add seed script for test users (reads private docs/private/test-users.json)" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** run by hand: `cd frontend && node scripts/seed-test-users.mjs [--with-photos]` on a fresh environment, before `supabase/demo/demo_data.sql`. Runbook step 4; e2e prerequisite.
**Notes:** The commit subject mentions `docs/private/`. It now reads the public `docs/test-users.json`.

#### `frontend/scripts/backup-nonphoto.mjs`
**What:** Read-only export of everything the photography-only cleanup deletes: rows as JSON per table, Storage files and `manifest.json`. It writes to `archive/event-platform/data-backup/<timestamp>/`, which is git-ignored.
**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** run by hand: `node scripts/backup-nonphoto.mjs --dry-run`, then without `--dry-run` (`--no-files`, `--out=<dir>`). Runbook step 1, **before** `photography_only_setup.sql`. The folder name goes into that file's guard.

#### `frontend/scripts/delete-nonphoto-users.mjs`
**What:** Deletes the 32 archived vendor test accounts (listed in `archive/event-platform/docs/test-users-vendors.json`): their Storage files, client bookings and auth user. Then it removes orphaned files named in the newest backup. It refuses to touch anyone in `docs/test-users.json`, or to run before the cleanup SQL.
**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** run by hand: `node scripts/delete-nonphoto-users.mjs --dry-run`, then without (`--backup=<folder>`). Runbook step 3. **Pending**, like the migration.

### `frontend/scripts/e2e/`: real-database end-to-end test (19 files)

All added 2026-10-10 · `0fca74f` "Web: QA fixes, WCAG 2.2 AA accessibility pass, real-database e2e script" (briankimdw). Most were last changed 2026-10-19 · `80615b2` (pivot trims). It signs in as the test users from `docs/test-users.json` and runs the app's unmodified `frontend/src/api/*.js` under Node, using module hooks. It uses the **publishable key only**. It needs Node ≥ 22.15. Exit codes: 0 pass, 1 failure, 2 couldn't start.

#### `frontend/scripts/e2e/README.md`
**What:** How to run it, who plays whom (jordanlee, taylorb, kai.film, mayachen, sofia.wild), what each `--only` area covers, cleanup behaviour, and what was archived.
**Used by:** linked from the root `README.md`. Current (photography-only).

#### `frontend/scripts/e2e/run.mjs`
**What:** The entry point. It parses flags (`--dry-run`, `--only a,b`, `--verbose`, `--keep`, `--pause-for-payment`, `--realtime-timeout`), loads the shim, runs the sections, runs cleanup, prints a table and writes `last-report.json` (git-ignored).
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `cd frontend && node scripts/e2e/run.mjs`. Imported by `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/env.mjs`
**What:** Reads `frontend/.env.local` (refuses a service-role-looking key) and the test logins. Provides email masking.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/context.mjs`, `run.mjs`, `sections/anon.mjs`, `sections/preflight.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/context.mjs`
**What:** Shared run state: `ROLES` (which test user plays which part), per-user clients, the app modules, the cleanup registry, the date allocator and anon fixtures.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/harness.mjs`
**What:** A dependency-free step runner: sections, pass/fail/skip, `expectReject` and the result table.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `run.mjs`, `lib/context.mjs` and all 7 `sections/*.mjs`.

#### `frontend/scripts/e2e/lib/cleanup.mjs`
**What:** Registry of everything the test creates. It undoes it in a safe order (bookings → events → chats…), on exit, on failure or on Ctrl+C. It writes `last-cleanup.sql` for leftovers.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/shim.mjs`
**What:** Makes the browser-flavoured app modules importable from Node. It registers `hooks.mjs` and stubs `localStorage`, `sessionStorage`, `location` and similar.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `run.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/hooks.mjs`
**What:** Node module hooks. They rewrite `import.meta.env` in `frontend/src/**`, and they redirect `frontend/src/lib/supabase.js` to `supabase-shim.mjs`.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/shim.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/supabase-shim.mjs`
**What:** Stands in for the app's single Supabase client, so several users can be signed in at once (one client each).
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `lib/shim.mjs` (through the hooks).

#### `frontend/scripts/e2e/lib/pricing.mjs`
**What:** The expected booking totals and deposits, mirroring `request_booking()` (from `20261010000000_all_verticals.sql`) for every price type.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `sections/bookings.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/lib/jpeg.mjs`
**What:** Generates a tiny valid baseline JPEG in code (no image library) for posting tests.
**Last changed:** 2026-10-10 · `0fca74f`.
**Used by:** `sections/posting.mjs`, `test/helpers.test.mjs`.

#### `frontend/scripts/e2e/sections/anon.mjs`
**What:** Signed-out checks (also run in `--dry-run`):
- Photo & video is live
- `listProviders`
- `search_providers`
- `getProvider`
- reviews against the rating aggregates
- the anon Discover feed
- anon can't call the booking RPCs

**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/preflight.mjs`
**What:** Checks that the role accounts, listings, the verified and unverified flags, `max_concurrent` and the fixed/hourly/quote packages exist. It runs before any signed-in area.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/social.mjs`
**What:** Follow and unfollow, the shortlist, Discover swipes (like, pass, undo), the taste profile and `provider_matches`. These are the `social` and `discover` areas.
**Last changed:** 2026-10-10 · `0fca74f`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/bookings.mjs`
**What:** The `pricing`, `lifecycle` and `capacity` areas:
- request, counter, accept, decline and cancel bookings
- the unverified vendor can't accept
- no double-booking
- with `--pause-for-payment`: deliver → complete → double-blind reviews

**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/messaging.mjs`
**What:** DMs, unread counts and `markRead`, Realtime delivery, groups (create, rename, add, leave), `searchPeople`, and share cards (`shareToChats`; the server fills `share_preview`).
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/posting.mjs`
**What:** Posts an album with `postAlbum` and the generated JPEG, then checks the public view and EXIF, editing, that other users are locked out, and that deleting removes both Storage files.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/sections/rls.mjs`
**What:** RLS probes from an outsider: other people's bookings, offers, DMs, read markers, events, listings, `provider_private`, swipes, the shortlist and Storage folders. They write existing values, so they're harmless.
**Last changed:** 2026-10-19 · `80615b2`. **Used by:** `run.mjs`.

#### `frontend/scripts/e2e/test/helpers.test.mjs`
**What:** Offline unit tests for the helpers: pricing, masking, the harness, cleanup ordering and JPEG output.
**Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `cd frontend && node --test scripts/e2e/test/helpers.test.mjs`.

---

### `supabase/`: schema, seed, demo data, SQL tests

Every RPC listed under "called from" was found with `grep "rpc('name'"` in `frontend/src` and `mobile/src`. Mobile makes **no** direct `.rpc()` calls; it reaches them through `@shared/api/*.js`, so every `frontend/src/api` caller below serves both apps. **Hosted status was checked on 2026-10-20 with the project's migration list.** The first seven are recorded there as `0001_…` to `0007_…` but carry the same timestamps as the files.

#### `supabase/config.toml`
**What:** Supabase CLI config for a local stack (`project_id = "photographer-match"`, Postgres 17, API 54321, DB 54322, Studio 54323, seed `./seed.sql`, Realtime and Storage on). Tim set `jwt_expiry` from 3600 to 600 so the backend's session denylist rows expire quickly.
**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps).
**Used by:** `npx supabase …` (CLI). Nobody runs a local stack yet (no Docker; `docs/DATABASE.md` §7). The hosted project's auth settings are set in the dashboard, not here.

#### `supabase/.gitignore`
**What:** Ignores the CLI's `.branches`, `.temp`, `.env.keys`, `.env.local` and `.env.*.local`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.

#### `supabase/seed.sql`
**What:** Reference data, safe to re-run: the **Photo & video** vertical (slug `photography`) with its 14 services and JSON Schemas (provider and package fields, including the video fields), plus the Flexible, Moderate and Strict cancellation-policy templates. The slugs match `frontend/src/verticals/`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw).
**Used by:** `supabase db reset` (local, automatically); on hosted, pasted into the SQL Editor. Concatenated into `supabase/demo/photography_only_setup.sql` (part 2).
**Notes:** The hosted DB still has the pre-pivot multi-vertical seed until the runbook runs. The old seed is at `archive/event-platform/supabase/seed_all_verticals.sql`.

#### `supabase/migrations/20261008171959_extensions_and_profiles.sql`
**What:** Phase 0.
- Extensions: postgis, citext, pg_jsonschema, pg_trgm, btree_gist, moddatetime.
- Shared enums (`price_type`, `provider_status`, …).
- Tables `profiles`, `admins`, `identity_verifications`.
- The `handle_new_user()` signup trigger (creates the profile) and `is_admin()`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `profiles` is read by `frontend/src/auth.jsx`, `api/catalog.js`, `api/messages.js`, `screens/Me.jsx`, `mobile/src/state/auth.tsx` and others. Tests: `supabase/tests/smoke_test.sql`.

#### `supabase/migrations/20261008172117_categories_providers_packages.sql`
**What:** The category-agnostic core.
- Tables `service_categories` (with JSON Schemas), `providers`, `provider_private`, `provider_services`, `cancellation_policies`, `packages`, `package_addons`.
- Validation triggers `providers_check` and `packages_check` (`pg_jsonschema` against `category_schema()`).
- RPC `become_provider()`, helper `owns_provider()`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `rpc('become_provider')` is called from `frontend/src/api/portfolio.js`. The tables are read by `api/catalog.js`, `api/provider.js`, `api/portfolio.js` and `api/locations.js`. Tests: `smoke_test.sql`.

#### `supabase/migrations/20261008172131_availability.sql`
**What:** Tables `availability_rules` (working hours per weekday) and `blackouts` (a `tstzrange` of blocked time), with RLS.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/provider.js` (hours, blocked days). Filled by `supabase/demo/demo_data.sql`. Read inside `search_providers()` and `is_provider_free()`.

#### `supabase/migrations/20261008172231_portfolio_and_storage.sql`
**What:** Portfolio and Storage.
- Tables `albums`, `photos` (EXIF, `authenticity`, `pair_role` for before/after), `tags`, `album_tags`.
- Helpers `can_view_album()` and `owns_album()`, the `albums_status_guard` trigger.
- Storage buckets `avatars` and `portfolio` (public), `portfolio-originals` and `raw-proofs` (private), each with owner-folder policies.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/portfolio.js`, `api/home.js`, `api/discover.js`, `api/edits.js`, `mobile/src/lib/beforeAfter.ts`. e2e: `sections/posting.mjs`.

#### `supabase/migrations/20261008172529_events_and_bookings.sql`
**What:** Bookings.
- Tables `events`, `event_members`, `bookings` (exclusion constraint against overlaps), `booking_addons`, `booking_offers`, `booking_events` (audit log).
- RPCs `request_booking`, `respond_to_booking`, `respond_to_offer`, `cancel_booking`, `mark_delivered`, `accept_delivery`, `search_providers`, `is_provider_free`.
- pg_cron jobs: `expire-booking-requests`, `start-booked-shoots`, `auto-complete-deliveries`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/bookings.js` (every booking RPC) and `api/catalog.js` (`search_providers`). e2e: `sections/bookings.mjs`, `anon.mjs`, `rls.mjs`. Tests: `smoke_test.sql`. `request_booking` and `is_provider_free` were redefined by `20261010000000_all_verticals`.

#### `supabase/migrations/20261008172715_messaging_reviews_discovery.sql`
**What:** Messaging, reviews and Discover data.
- Tables `conversations`, `conversation_members`, `messages` (added to Realtime), `reviews` (double-blind, rating aggregates by trigger, `reveal-reviews` cron), `swipes`, `taste_corrections`, `saved_providers`, `collections`, `collection_items`, `follows`, `notifications`, `reports`, `blocks`.
- A booking-chat auto-create trigger.
- RPCs `start_inquiry` and `submit_review`.

**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `api/messages.js` (`start_inquiry`, chats), `api/bookings.js` (`submit_review`), `api/social.js`, `api/discover.js`, `components/PostSheets.jsx` and `mobile/src/screens/inbox/ModerationSheet.tsx` (reports, blocks).

#### `supabase/migrations/20261008173740_hardening.sql`
**What:** Fixes from the Supabase advisors. It revokes API `EXECUTE` on the trigger functions and adds 21 foreign-key indexes. The optional policy split was left in `supabase/pending/`.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** No callers; it's DB hygiene.

#### `supabase/migrations/20261008213950_photo_embeddings_and_feed.sql`
**What:** ML data and the first feed.
- The pgvector extension and table `photo_embeddings` (server-only).
- Column `photos.auto_tags`.
- Service-role RPCs `ml_pending_photos` and `ml_save_photo_analysis`.
- `discover_feed()` v1.

**Made:** 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). (Tim's parallel branch `e495343` also added it.) **Last changed:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw).
**Used by:** **applied.** `services/ml/app/store.py` (`/rest/v1/rpc/ml_pending_photos`, `ml_save_photo_analysis`). `discover_feed` is called from `frontend/src/api/discover.js`. Tests: `supabase/tests/feed_test.sql`.

#### `supabase/migrations/20261008214116_discover_feed_soft_diversity.sql`
**What:** Replaces `discover_feed()`. The hard 2-albums-per-photographer cap becomes a soft score penalty, and slots are reserved for exploration.
**Made:** 2026-10-08 (in `acda51d` and Tim's `e495343`; the JSON credits `e495343`, Timothy Phelps). **Last changed:** unchanged.
**Used by:** **applied.** Superseded by `20261012000100_feed_v2` (which redefines `discover_feed`).

#### `supabase/migrations/20261008220000_revoked_sessions.sql`
**What:** Tim's session denylist. Table `revoked_sessions` (`session_id`, purged after token expiry), RPCs `revoke_my_session()` and `is_my_session_revoked()`.
**Made:** 2026-10-08 · `e495343` "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** unchanged.
**Used by:** **applied.** `backend/api/auth.py` (`rpc('revoke_my_session')`), `backend/dependencies/auth.py`, `backend/core/sessions.py`. See `backend/AUTH.md`. The web app and mobile don't use it.

#### `supabase/migrations/20261009023242_provider_matches.sql`
**What:** RPC `provider_matches()`: a relative "% match" (~60–98) per photographer against the signed-in user's taste vector.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `rpc('provider_matches')` is called from `frontend/src/api/catalog.js`, whose results `api/discover.js` uses. Tests: `supabase/tests/matches_test.sql`. e2e: `sections/social.mjs`. Redefined by `feed_v2`.

#### `supabase/migrations/20261009023437_swipes_undo.sql`
**What:** One RLS policy that lets users delete their own swipes, for Discover undo.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/discover.js` and `api/social.js` (`from('swipes').delete()`). e2e: `sections/social.mjs`.

#### `supabase/migrations/20261009120000_direct_and_group_messages.sql`
**What:** DMs, groups and blocks.
- RPCs `start_direct_message`, `create_group_chat`, `rename_group`, `add_group_members`, `leave_group`.
- `is_blocked_between()` and the `messages_block_check` trigger.
- Adds `conversation_members` to Realtime.

**Made:** 2026-10-09 · `682c20d` "Real messaging between people, photographer map, new posting flow" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** All five RPCs are called from `frontend/src/api/messages.js`. Tests: `supabase/tests/messaging_test.sql`. e2e: `sections/messaging.mjs`.

#### `supabase/migrations/20261009120100_portfolio_owner_select.sql`
**What:** A Storage policy that lets owners `select` their own folder in `portfolio`. Without it, Storage deletes silently left files behind.
**Made:** 2026-10-09 · `682c20d` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** Deleting a post or rolling back an upload in `frontend/src/api/portfolio.js`. e2e: `sections/posting.mjs`.

#### `supabase/migrations/20261010000000_all_verticals.sql`
**What:** Pricing, quantity and capacity for every vertical.
- Price types `per_person`, `per_item`, `daily`.
- Columns `packages.min_quantity` / `max_quantity` and `bookings.quantity`.
- Column `providers.max_concurrent` with slot capacity (`bookings_assign_slot` trigger).
- Redefines `request_booking` and `is_provider_free`. Re-runnable.

**Made:** 2026-10-10 · `1f99925` "All event services, Home/Discover redesign, and the Expo app" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** The core stays after the pivot. `api/bookings.js` (`request_booking`), `api/provider.js` (quantities). Mirrored by `frontend/scripts/e2e/lib/pricing.mjs`. Used by `supabase/demo/demo_data.sql`.

#### `supabase/migrations/20261011000000_share_cards.sql`
**What:** Share cards in chat.
- Columns `messages.shared_provider_id`, `shared_event_id` and `share_preview`.
- The `messages_share_preview` trigger fills a safe snapshot on the server and wipes any preview the client sets.

**Made:** 2026-10-10 · `b9b7a81` "Posting for every vertical, in-app sharing, events with friends, UI pass" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied.** `frontend/src/api/messages.js` (`sendMessage`, `shareToChats`, `shareSupport`, `shareColumnsReady`). Tests: `supabase/tests/share_cards_test.sql`. e2e: `sections/messaging.mjs` (`sharing`).

#### `supabase/migrations/20261011000100_event_groups.sql`
**What:** Events with friends (archived feature).
- Tables `event_candidates` and `event_candidate_votes`.
- Event-chat sync triggers.
- RPCs `create_event_with_chat`, `invite_to_event`, `leave_event`, `post_event_note`, `add_event_candidate`, `set_event_candidate_status`, `event_bookings`, …

**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied, but dead code**: no caller in `frontend/src` or `mobile/src`. `20261018000000_photography_only` drops its tables and functions. A copy lives in `archive/event-platform/supabase/migrations/`.

#### `supabase/migrations/20261011000200_post_credits.sql`
**What:** Table `album_credits` (tag other vendors on a post) with the `album_credits_limit` trigger, plus seeded `occasion-*` tags (archived feature).
**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** **applied, but dead code.** Only `frontend/scripts/backup-nonphoto.mjs` and `supabase/demo/photography_only_setup.sql` mention it. Dropped by `photography_only`.

#### `supabase/migrations/20261012000100_feed_v2.sql`
**What:** Discover feed v2.
- Helpers `taste_profile()` (up to 3 taste groups, centred SigLIP space), `vec_scale()` and `photo_in_category()`.
- Rewrites `discover_feed()` and `provider_matches()`.
- The knobs are constants at the top of the functions.

**Made:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied** (`docs/DATABASE.md` saying "Written" is stale). `api/discover.js` and `api/catalog.js`. Mirrored by `services/ml/eval/feeds.py` (`V2_DEFAULTS`), checked by `eval/sql/parity.mjs` and `eval/sql/feed_v2_smoke.sql`, pinned by `services/ml/tests/test_feed_eval.py`.

#### `supabase/migrations/20261013000000_discover_all_verticals.sql`
**What:** Vendor-card Discover: `discover_vendors()` with the helpers `vendor_traits`, `discover_jaccard` and `discover_norm` (archived feature).
**Made:** 2026-10-12 · `c7028db` "Discover for every vertical (web + mobile), demo vendor portfolios" (briankimdw). **Last changed:** unchanged.
**Used by:** **applied**, and `frontend/src/api/discover.js` still calls `rpc('discover_vendors')`. Once `photography_only` drops it, that call falls back to the in-browser `rankVendors()` (`isMissingFn`), so nothing breaks.

#### `supabase/migrations/20261018000000_photography_only.sql`
**What:** **Destructive pivot. It's guarded and re-runnable.**
- Merges videography into the "Photo & video" vertical (schemas, 5 video services, listings).
- Drops `album_credits`, `event_candidates`, `event_candidate_votes`, the events-with-friends functions and triggers, and `discover_vendors()` with its helpers.
- Deletes the data of the other 16 verticals and every event.
- It refuses to run while non-photo data exists unless `photography_only.backup_done` is set.

**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** **pending (not applied).** Apply it by pasting `supabase/demo/photography_only_setup.sql`, which wraps this file with the guard, the seed and the `schema_migrations` record, after `backup-nonphoto.mjs`. See `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.
**Notes:** Don't `npx supabase db push` before the runbook. Push would try this file without the guard set, and it would abort.

#### `supabase/migrations/20261020000000_photo_edits.sql`
**What:** Non-destructive editing support.
- Column `photos.edit_recipe jsonb`, with the check function `edit_recipe_ok()` (known keys, ranges, ≤ 4 KB).
- `insert` and `update` grants on that column for `authenticated`.
- The `photos_display_changed` trigger: when `display_path` changes, it deletes the photo's embedding (so the ML worker re-analyses it) and clears `phash`. Re-runnable.

**Made:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** unchanged.
**Used by:** **pending (not applied).** `docs/EDITOR.md` says so, and the hosted list confirms it. `frontend/src/api/edits.js` (`editRecipeSupported()` detects the missing column and saves without the recipe), `api/portfolio.js`, `components/editor/PhotoEditor.jsx`, `components/upload/editorBridge.jsx`, `ManagePost.jsx`, `mobile/src/screens/provider/upload/PostPhotos.tsx`. Tests: `supabase/tests/photo_edits_test.sql`.
**Notes:** There's no paste-ready wrapper. Paste the file itself (it's re-runnable), or `db push` once `photography_only` is recorded.

#### `supabase/pending/split_owner_policies.sql`
**What:** Optional performance tidy-up. It splits each owner `FOR ALL` policy into insert, update and delete policies, so they no longer overlap the public `SELECT` policies. Access stays the same.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** **not applied (declined 2026-10-08).** To use it, copy it into a new migration. Mentioned in `docs/DATABASE.md` §6 and `docs/PROGRESS.md`.

#### `supabase/demo/photography_only_setup.sql`
**What:** A paste-ready, single-transaction file:
- 0: the backup guard (replace `'no'` with the backup folder name)
- 1: the `20261018000000_photography_only` migration
- 2: `seed.sql`
- 3: the record in `supabase_migrations.schema_migrations`
- a final check row (every column `true`, `listings_left = 9`)

**Made:** 2026-10-19 · `80615b2` (briankimdw). **Last changed:** unchanged.
**Used by:** runbook step 2, in the SQL Editor. **Pending.** If you change the migration or the seed, update this file too.

#### `supabase/demo/demo_data.sql`
**What:** Demo data for the test users: packages, add-ons, gear, working hours, bookings in every state, double-blind reviews, chats, follows, a shortlist. Photography only. Looks rows up by username and slug, and is safe to re-run.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** pasted into the SQL Editor after `seed-test-users.mjs` (runbook step 4; e2e prerequisite). The old all-verticals version is in `archive/event-platform/supabase/demo/`.

#### `supabase/demo/remove_demo_data.sql`
**What:** Undoes `demo_data.sql` (bookings with their reviews, chats and history, packages, hours, follows, the shortlist, and Brian's demo bookings). It keeps accounts, listings and albums. Run it before deleting test users.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** pasted by hand. Referenced in `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md` and `docs/test-users.md`.

#### `supabase/tests/smoke_test.sql`
**What:** A 22-check test of the schema, auth rules and booking flow: RLS, the no-overlap rule, the RPCs and refunds. It's one `do $$` block that always rolls back by raising the results.
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted into the SQL Editor or run with MCP `execute_sql` after a schema change (`docs/DATABASE.md` §7, runbook step 5). Every line should end in `ok`.

#### `supabase/tests/feed_test.sql`
**What:** `discover_feed` with made-up embeddings: two styles, and a client who likes the warm one. Rolls back.
**Made:** 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261008213950_*`, `214116` and `feed_v2`.

#### `supabase/tests/matches_test.sql`
**What:** `provider_matches()` as `jordanlee`. It needs the demo photographers with analysed photos (run the SigLIP worker first). Rolls back.
**Made:** 2026-10-08 · `9db1724` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand.

#### `supabase/tests/messaging_test.sql`
**What:** DMs, group chats (create, rename, add, leave) and blocks. Rolls back.
**Made:** 2026-10-09 · `682c20d` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261009120000_direct_and_group_messages`.

#### `supabase/tests/share_cards_test.sql`
**What:** Share cards: server-filled `share_preview`, client values wiped, event snapshot privacy. Rolls back.
**Made:** 2026-10-10 · `b9b7a81` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand. Covers `20261011000000_share_cards`.

#### `supabase/tests/photo_edits_test.sql`
**What:** 13 checks: recipe validation, column grants, and the stale-analysis reset when `display_path` changes. Rolls back.
**Made:** 2026-10-19 · `2914c32` (briankimdw). **Last changed:** unchanged.
**Used by:** pasted by hand **after** `20261020000000_photo_edits` is applied. It fails on the hosted DB until then.

---

### `services/ml/`: SigLIP worker and AI photo tools (Python, FastAPI)

Python 3.12, run from `services/ml`, with a git-ignored `.venv/`. Settings come from `services/ml/.env` (`app/config.py` loads only that file). Most of the service was added 2026-10-08 · `acda51d` "Discover ML: SigLIP embeddings, auto-tags and discover_feed" (briankimdw). The AI tools came 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw).

#### `services/ml/README.md`
**What:** Setup and commands for the service: hosting options (laptop, Modal, Railway/Fly/Render, Cloud Run, with a webhook to `/process-pending`), feed tuning (the v2 knobs and the eval commands), and the AI photo tools (models, licences, timings).
**Made:** 2026-10-08 · `acda51d` (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Used by:** linked from the root `README.md`, `docs/AI_TOOLS.md`, `THIRD_PARTY_NOTICES.md`. Current.

#### `services/ml/.env.example`
**What:** The keys to set:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `ML_WEBHOOK_SECRET`
- optional: `SIGLIP_MODEL`, `ML_DEVICE`, `ML_BATCH_SIZE`, `SUPABASE_ANON_KEY`, `ML_ALLOWED_ORIGINS`
- the `AI_*` limits

**Made:** 2026-10-08 · `acda51d` (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` (briankimdw).
**Used by:** copy it to `services/ml/.env`. That `.env` is **also** where `frontend/scripts/lib/admin.mjs` finds the service-role key.

#### `services/ml/.gitignore`
**What:** Ignores `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.env` and `models/` (the downloaded ONNX files).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.

#### `services/ml/requirements.txt`
**What:** transformers < 5, sentencepiece, protobuf, pillow, fastapi, uvicorn, python-multipart, httpx, python-dotenv and numpy, plus pinned `onnxruntime==1.31.0` and `onnx==1.23.2` (for the AI tools) and pytest. Install PyTorch first, separately (the CPU wheel).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** `pip install -r requirements.txt`, `Dockerfile`.

#### `services/ml/Dockerfile`
**What:** CPU image (python:3.12-slim). It bakes in the SigLIP weights and runs `scripts/fetch_models.py` unless built with `--build-arg FETCH_AI_MODELS=0`. The default command is `uvicorn app.main:app --port 8000`; the alternative is `python -m app.worker`.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** future hosting (not deployed yet; the README says "laptop (now)").

#### `services/ml/app/__init__.py`
**What:** Package marker (docstring only).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** every `app.*` module.

#### `services/ml/app/config.py`
**What:** All settings from the environment:
- the model id (768-d, must match `photo_embeddings`) and device
- Supabase URL and keys, the portfolio bucket, the webhook secret, the batch size
- CORS origins plus a LAN regex
- the **AI limits**: 30 MB per upload, 50 MP, a 2048 px edge, a 1024 px upscale input, 30 requests per 600 s, a 60 s queue timeout, `AI_PRELOAD`

**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** `app/main.py`, `worker.py`, `store.py`, `siglip.py`, `auth.py`, `ai/models.py`, `ai/router.py`.

#### `services/ml/app/main.py`
**What:** The FastAPI app (`uvicorn app.main:app --port 8000`).
- `GET /health`.
- `POST /analyze`, `/process-pending` and `/embed-text`, all behind the `X-ML-Secret` header (server-to-server).
- The `/ai/*` router mounted.
- CORS (`Authorization` and `Content-Type` only).
- SigLIP loaded at startup, AI models preloaded in a background thread.

**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `8b9994d`.
**Used by:** uvicorn and `tests/test_ai_tools.py`. Nothing in the repo calls `/process-pending`, `/analyze` or `/embed-text` yet; they're meant for a Supabase Database Webhook or cron.

#### `services/ml/app/worker.py`
**What:** The analysis loop: `run_once()` claims pending photos, embeds and tags them, and saves the results. CLI: `python -m app.worker` (polls every 30 s), `--once`, `--retag` (re-analyses every photo).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation…".
**Used by:** run by hand after new photos are posted (e2e "% match" needs it). Also `app/main.py` (`/process-pending`).

#### `services/ml/app/store.py`
**What:** The Supabase client using the service-role key. It calls `rpc/ml_pending_photos`, downloads from the `portfolio` bucket, and calls `rpc/ml_save_photo_analysis` (embedding and `auto_tags`).
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-11 · `fe263db`.
**Used by:** `app/worker.py`, `app/main.py`. It depends on migration `20261008213950_photo_embeddings_and_feed`.

#### `services/ml/app/siglip.py`
**What:** The `SigLIP` wrapper (`google/siglip-base-patch16-224`). It turns images into 768-d embeddings and auto-tags, and also provides `embed_texts`, `to_pgvector` and pixel-based black-and-white detection.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** `app/main.py`, `app/worker.py`, `eval/embed.py`, `eval/tags_eval.py`, `scripts/try_images.py`.

#### `services/ml/app/tags.py`
**What:** The auto-tag vocabulary: groups for colour, light, mood, style and subject, each with a neutral `_` option. `select_tags()` keeps a tag only when it clearly wins within its group; the thresholds were tuned with `eval/tags_eval.py`.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…".
**Used by:** `app/siglip.py`, `tests/test_tags.py`. After editing it, run `python -m app.worker --retag`. The tags show in the app through `photos.auto_tags` (`api/discover.js`, `api/portfolio.js`).

#### `services/ml/app/auth.py`
**What:** `TokenVerifier`. It checks a Supabase access token with `GET /auth/v1/user` (apikey = `SUPABASE_ANON_KEY`, else the service key) and caches valid tokens for 60 s. Also provides `bearer_token()`.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/__init__.py`
**What:** Package marker for the AI tools.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/router.py`
**What:** `APIRouter(prefix="/ai")`.
- Endpoints: `GET /capabilities` and `POST /remove-background`, `/erase`, `/upscale`.
- Each request goes through `require_user` (bearer token), the in-memory per-user `RateLimiter`, then the size limits. Each tool runs one request at a time, with a queue timeout leading to `503 busy`.
- Error codes are stable (`docs/AI_TOOLS.md`), and the `X-Image-*` and `X-Processing-Ms` headers are exposed.

**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `app/main.py`. Callers: `frontend/src/api/ai.js` (web `components/editor/ai/AiPanel.jsx`, mobile `screens/editor/ai/client.ts`). Tests: `tests/test_ai_tools.py`.

#### `services/ml/app/ai/models.py`
**What:** `ModelRegistry`. It lists which ONNX models are installed in `AI_MODELS_DIR` (BiRefNet-lite, LaMa, Real-ESRGAN x4v3) and loads each one into ONNX Runtime once (lazily, or preloaded).
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`, `tests/test_ai_tools.py`.

#### `services/ml/app/ai/tools.py`
**What:** Pure image-in, image-out functions:
- `remove_background`: BiRefNet at 1024², soft mask.
- `erase`: LaMa at 512², on a crop around the mask.
- `upscale`: x4, or x2 by doing x4 and then a Lanczos downscale.

**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`.

#### `services/ml/app/ai/imaging.py`
**What:** Safe decoding (pixel-count check before decode, EXIF orientation, Pillow bomb guard at 100 MP) and PNG/JPEG encoding.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `app/ai/router.py`.

#### `services/ml/app/ai/srvgg.py`
**What:** The PyTorch `SRVGGNetCompact` architecture (Real-ESRGAN, BSD-3). It's used **only** to export the `.pth` weights to ONNX; the service never imports it.
**Made:** 2026-10-20 · `8b9994d`. **Used by:** `services/ml/scripts/fetch_models.py`.

#### `services/ml/scripts/fetch_models.py`
**What:** Downloads the AI tool models from pinned URLs into `services/ml/models/` (git-ignored, ~440 MB) and verifies their SHA-256. It loads the Real-ESRGAN `.pth` with `weights_only=True` and exports it to ONNX.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `python scripts/fetch_models.py`, once per machine, and in the `Dockerfile`. Without it, `/ai/capabilities` reports the tools as unavailable.

#### `services/ml/scripts/try_images.py`
**What:** Runs SigLIP on local photos without a database. It prints tags, the most similar pairs and text-query scores.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** unchanged.
**Used by:** `python scripts/try_images.py <folder> [--query "moody wedding"]`.

#### `services/ml/tests/test_tags.py`
**What:** Fast tests for `app/tags.py` (group winners, `MAX_TAGS`, black and white). No model download.
**Made:** 2026-10-08 · `acda51d`. **Last changed:** 2026-10-19 · `80615b2`.
**Used by:** `python -m pytest tests`.

#### `services/ml/tests/test_feed_eval.py`
**What:** Synthetic-data tests of the Python feed ports (`eval/feeds.py`: `FeedV1`, `FeedV2`, `_diversify`). These pin the behaviour of the `feed_v2` SQL.
**Made:** 2026-10-11 · `fe263db`. **Last changed:** unchanged.
**Used by:** `python -m pytest tests`.

#### `services/ml/tests/test_ai_tools.py`
**What:** `/ai/*` tests: auth (with a faked token check), limits, rate limiting and capabilities, plus a smoke test per tool on tiny images when the models are installed.
**Made:** 2026-10-20 · `8b9994d`. **Last changed:** unchanged.
**Used by:** `python -m pytest tests`.

#### `services/ml/eval/` (11 files): offline feed and tag evaluation
All added 2026-10-11 · `fe263db` "Discover feed v2 + offline evaluation; repair corrupted feed migration" (briankimdw) and unchanged since. They run by hand with a work folder outside the repo, usually as `.venv/Scripts/python -I eval/<script>.py <workdir>`. The scripts import each other through `sys.path`, which the codemap scan can't see.

#### `services/ml/eval/manifest.csv`
**What:** 632 labeled Creative Commons photos (id, group, url, licence, creator) in 19 style and content groups. Only the manifest is committed; the photos themselves are downloaded.
**Used by:** `eval/dataset.py` (`MANIFEST`), which `embed.py` and `simulate.py` use.

#### `services/ml/eval/dataset.py`
**What:** Builds the labeled set from Openverse. Subcommands: `search`, `search-extra`, `fetch`, `sheets` (contact sheets).
**Used by:** `python eval/dataset.py fetch <workdir>`. Imported by `eval/embed.py`, `eval/simulate.py`.

#### `services/ml/eval/embed.py`
**What:** Embeds the eval photos with SigLIP and caches the result in `<workdir>/emb_<model>.npz`.
**Used by:** `python eval/embed.py <workdir>`. Imported by `simulate.py`, `tags_eval.py`.

#### `services/ml/eval/feeds.py`
**What:** Python ports of the Discover ranking: `Oracle`, `FeedV1`, and `FeedV2` with `V2_DEFAULTS` mirroring `20261012000100_feed_v2.sql`.
**Used by:** `eval/simulate.py`, `eval/tune.py`, `eval/sql/parity_export.py`, `tests/test_feed_eval.py`. When you change the feed SQL, keep this in sync.

#### `services/ml/eval/simulate.py`
**What:** Simulated users swiping. It measures how fast each algorithm learns a taste (scenarios include single and double target groups).
**Used by:** `python eval/simulate.py <workdir> --algos oracle,v1,v2 [--out f.json]`. Imported by `tune.py`, `tags_eval.py`, `sql/parity_export.py`.

#### `services/ml/eval/tune.py`
**What:** Compares ranking variants with P@10 over the learning window (`--set main|cold|clusters|ablation…`).
**Used by:** `python eval/tune.py <workdir> --set ablation`.

#### `services/ml/eval/tags_eval.py`
**What:** Auto-tag precision, recall and false-tag rate against the group labels.
**Used by:** `python eval/tags_eval.py <workdir>`, after you edit `app/tags.py`.

#### `services/ml/eval/report_tables.py`
**What:** Turns `simulate.py --out` JSON into Markdown tables.
**Used by:** `python eval/report_tables.py final.json`.
**Notes:** Its docstring (and the `feed_v2` migration header) mention `eval/REPORT.md`, which isn't committed (the README says so).

#### `services/ml/eval/sql/parity_export.py`
**What:** Parity check, step 1. It exports a catalog, swipe scenarios and the Python `FeedV2` results to a fixture JSON.
**Used by:** `python eval/sql/parity_export.py <workdir> <fixture.json>`.

#### `services/ml/eval/sql/parity.mjs`
**What:** Parity check, step 2. It runs the `feed_v2` migration in PGlite with pgvector and compares `discover_feed` and `provider_matches` with the Python port.
**Used by:** by hand, from a scratch folder: `npm i @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9 && node parity.mjs <migration.sql> <fixture.json>`.

#### `services/ml/eval/sql/feed_v2_smoke.sql`
**What:** A smoke test on the real schema: 2 vendors × 3 albums × 3 photos with random embeddings, so every code path of `discover_feed`, `taste_profile` and `provider_matches` runs.
**Used by:** run by hand (PGlite or the SQL Editor). The runbook lists it among the tests that pass after `photography_only`.

---

### `tools/studio/`: Studio (miniPaint) build

All 9 files were added 2026-10-20 · `8b9994d` "Studio (miniPaint) and AI photo tools for web and mobile" (briankimdw) and are unchanged since. Nothing here is installed into the repo: `build.mjs` copies these files to a temp folder and builds there. Design and decision record: `docs/STUDIO.md`.

#### `tools/studio/build.mjs`
**What:** The pipeline:
1. Download the miniPaint tarball at commit `a79733eb…` (v4.14.3) and check its SHA-256.
2. Stage the upstream `src/` unmodified, with our bridge files next to it.
3. `npm ci --ignore-scripts` from the pinned lockfile.
4. Run webpack. The build fails on AlertifyJS or GPL text, leftover API keys, or a non-MIT/ISC/BSD/Apache licence.
5. Copy the output to `frontend/public/studio/` and write `VERSION.json`.

**Used by:** `node tools/studio/build.mjs [--work <dir>] [--keep]`. Run it when bumping miniPaint (edit `MINIPAINT` commit + sha256) or after changing any file below.

#### `tools/studio/package.json`
**What:** The build-only manifest. Pinned runtime deps of miniPaint (jquery 3.7.1, pica, gif.js.optimized, hermite-resize from a GitHub tarball…) and webpack 5 + babel. **AlertifyJS is deliberately absent.**
**Used by:** `build.mjs` (copied into the scratch folder).

#### `tools/studio/package-lock.json`
**What:** The lockfile for the above (4,157 lines). It makes `npm ci` reproducible.
**Used by:** `build.mjs`.

#### `tools/studio/webpack.config.cjs`
**What:** Bundles upstream `src/` and `bridge/entry.js` into `minipaint.js`. It aliases `alertifyjs` to the shims, runs `strip-keys-loader.js` on `src/js/config.js`, and writes `bundled-packages.json` with the licence check. Paths are relative to the scratch folder.
**Used by:** `build.mjs`.

#### `tools/studio/entry.js`
**What:** The bridge that runs inside the iframe.
- It tweaks miniPaint's config before start: dark theme only, no Pixabay, Google Fonts or external links.
- It imports the upstream `main.js` unchanged.
- It exposes `window.studioBridge`: `ready`, `open(blobOrUrl)`, export and dirty state, documented in `docs/STUDIO.md`.

**Used by:** bundled into `frontend/public/studio/minipaint.js`. The host side is `frontend/src/components/studio/Studio.jsx`. Imports `studio-overrides.css`.

#### `tools/studio/alertify-shim.js`
**What:** An MIT stand-in for AlertifyJS's `error`, `success` and `warning` notices. Notices go to an ARIA live region.
**Used by:** `webpack.config.cjs` (alias replacing `alertifyjs/build/alertify.min.js`).

#### `tools/studio/alertify-shim.css`
**What:** Styles for the shim's notices (`.pm-notices`, `.pm-notice`).
**Used by:** `webpack.config.cjs` (alias replacing `alertify.min.css`).

#### `tools/studio/studio-overrides.css`
**What:** Our dark theme over miniPaint's CSS variables, matching `frontend/src/components/editor/editor.css`. Also the wordmark and the focus ring.
**Used by:** `tools/studio/entry.js` (import).

#### `tools/studio/strip-keys-loader.js`
**What:** A webpack loader that blanks upstream's `pixabay_key` and `google_webfonts_key` in `config.js`. They aren't our keys, and the repo is public.
**Used by:** `webpack.config.cjs`. `build.mjs` re-checks the bundle for those keys.

#### `tools/codemap/` (not tracked yet)
**What:** `scan.mjs` builds `codemap.json`: for every tracked file, the commit that added it, its latest change, `importedBy` and `routes`. This map is written from it.
**Used by:** `node tools/codemap/scan.mjs > tools/codemap/codemap.json`. It's untracked (`git status` shows `?? tools/codemap/`), so it isn't in the JSON's own file list.

---

### `docs/`

#### `docs/DATABASE.md`
**What:** The database and auth design: key decisions, auth, every table, the RLS summary, Storage buckets, the migration rollout table and the CLI workflow. §0 covers the photography-only pivot.
**Made:** 2026-10-08 · `1fb7ec3` "Supabase database + auth setup (phases 0-2)" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` "Cleanup…" (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`. Referenced by migration `20261008171959`.
**Notes:** Mostly current. Stale points:
- `feed_v2` is shown as "Written"; it's applied.
- `20261020000000_photo_edits` is missing from the rollout table.
- The header says the project "is currently empty".
- `event_members` is listed twice.

#### `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`
**What:** Step-by-step switch of the hosted DB to photography only: 1. backup script, 2. `photography_only_setup.sql` with the guard, 3. `delete-nonphoto-users.mjs`, 4. optional re-seed, 5. e2e verification. Also covers undo and offline testing.
**Made:** 2026-10-19 · `80615b2` "Photography-only pivot: database cleanup, scripts, ML service, docs" (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `README.md`, `docs/DATABASE.md`, `docs/PROGRESS.md`, `docs/test-users.md`, both scripts, `photography_only_setup.sql`, the migration and the e2e README. **Current, and not yet carried out.**

#### `docs/AI_TOOLS.md`
**What:** The API contract for `/ai/*`: base URL and auth, common rules (multipart, EXIF, headers), the error-code table, each endpoint, typical CPU times, and web and Expo examples.
**Made:** 2026-10-20 · `8b9994d` (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `frontend/src/api/ai.js`, `mobile/src/shims/env.ts`, both `.env.example` files, `services/ml/app/main.py`, `app/ai/router.py`, `services/ml/README.md`, `docs/EDITOR.md`, `docs/STUDIO.md`. Current.

#### `docs/EDITOR.md`
**What:** The non-destructive photo editor: file map, recipe v1 format, geometry and colour pipeline, UI and accessibility, persistence (migration `20261020000000_photo_edits`, "**Not applied to the hosted DB yet**") and the `api/edits.js` API.
**Made:** 2026-10-19 · `2914c32` "Web: photo editor, easier posting, before & after slider" (briankimdw). **Last changed:** 2026-10-20 · `8b9994d` (briankimdw).
**Used by:** referenced from `docs/STUDIO.md` and the `photo_edits` migration. Current.

#### `docs/STUDIO.md`
**What:** Studio: why miniPaint (comparison with Filerobot and TOAST UI, the GPL AlertifyJS issue), why an iframe, the file map, build steps, the `studioBridge` API and how to update the pin.
**Made:** 2026-10-20 · `8b9994d` (briankimdw). **Last changed:** unchanged.
**Used by:** referenced from `tools/studio/*`, `frontend/public/studio/index.html`, `frontend/src/components/studio/StudioLayer.jsx`, `PhotoEditor.jsx`, `THIRD_PARTY_NOTICES.md`, `docs/EDITOR.md`. Current.

#### `docs/FRONTEND_DATA.md`
**What:** The data layer contract. Screens only call `frontend/src/api/*`. Covers where things live, the object shapes screens get, IDs and links, rules of thumb, the 2026-10-19 posting rework and what the pivot removed.
**Made:** 2026-10-08 · `9db1724` "Connect the frontend to Supabase; remove all mock data" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`. Current.

#### `docs/PROGRESS.md`
**What:** A session-by-session log (newest first: Studio 10-19, pivot 10-18, sharing 10-11, all verticals 10-10…). Also has "Done", "Decisions", "Open items" and "Next steps".
**Made:** 2026-10-08 · `1fb7ec3` (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md`; meant to be updated at the end of each session.
**Notes:** Partly stale:
- The header says "Last updated: 2026-10-18".
- The 10-10 and 10-11 entries still say to paste `all_verticals_setup.sql` and `sharing_events_credits_setup.sql`. Those files are now archived, and the migrations are applied.

#### `docs/PLAN.md`
**What:** The original product and feature spec (photographers first): posting, swipe Discover, profiles, the booking flow, delivery, payments, monetization, extras, the multi-service expansion (now archived) and the roadmap.
**Made:** 2026-10-08 · `8367e87` "Add project plan and mobile React frontend prototype" (briankimdw). **Last changed:** 2026-10-20 · `5f6655d` (briankimdw).
**Used by:** linked from `README.md` and `docs/PROGRESS.md`.
**Notes:** It's a vision doc, and parts disagree with `architecture.md` (see the README's open-decisions table). Its "Architecture" section (Next.js, Turborepo) doesn't match the repo.

#### `docs/test-users.json`
**What:** Throwaway dev logins (`note`, 9 `photographers` with listing details, 5 `clients`). They're **public on purpose**; delete the accounts before launch. Don't reuse the passwords anywhere.
**Made:** 2026-10-08 · `8d9b3b6` "Add test users to docs/ (public, throwaway dev logins)" (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** `frontend/scripts/seed-test-users.mjs` (creates them), `frontend/scripts/e2e/lib/env.mjs` and `context.mjs` (sign in), `frontend/scripts/delete-nonphoto-users.mjs` (the never-delete list). Usernames are also hard-coded in `supabase/demo/*.sql`.

#### `docs/test-users.md`
**What:** The human version of the above: how to seed them, the 9 photographers and 5 clients with what each is set up for, what you can test, and how to clean up later. Email confirmation must stay off for `@example.com`.
**Made:** 2026-10-08 · `8d9b3b6` (briankimdw). **Last changed:** 2026-10-19 · `80615b2` (briankimdw).
**Used by:** linked from `README.md` and `docs/DATABASE.md`. Referenced by `frontend/scripts/e2e/lib/context.mjs` and `env.mjs`. Current.

---

### Quick reference

| I want to… | Do this |
|---|---|
| Add a migration | `npx supabase migration new <name>`, then write re-runnable SQL in `supabase/migrations/`. Apply it with the Supabase MCP or `npx supabase db push` (not before the photography-only runbook; see the note on `20261018000000`). Add a rolled-back test in `supabase/tests/` and regenerate types (`docs/DATABASE.md` §7). |
| Know if a migration is live | Supabase MCP `list_migrations` (project `ktjvbajrfrbwpndforcy`). As of 2026-10-20, applied through `20261013000000`; `photography_only` and `photo_edits` are pending. |
| Switch the hosted DB to photography only | `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`: back up, paste `supabase/demo/photography_only_setup.sql` with the folder name, run `delete-nonphoto-users.mjs`, run e2e. |
| Turn on saved edit recipes | Apply `supabase/migrations/20261020000000_photo_edits.sql`, then paste `supabase/tests/photo_edits_test.sql` (13 × `ok`). |
| Change AI tool limits | Set the `AI_*` variables in `services/ml/.env` (defaults in `services/ml/app/config.py`). Update the tables in `docs/AI_TOOLS.md` too. |
| Add or replace an AI model | `services/ml/app/ai/models.py` (registry), `scripts/fetch_models.py` (pinned URL and sha256), `app/ai/tools.py`, `THIRD_PARTY_NOTICES.md`. |
| Change auto-tags | Edit `services/ml/app/tags.py`, run `python eval/tags_eval.py <workdir>` and `pytest tests`, then `python -m app.worker --retag`. |
| Tune the Discover feed | Change the constants in a **new** migration copying `discover_feed` and `taste_profile` from `20261012000100_feed_v2.sql`. Mirror them in `eval/feeds.py` `V2_DEFAULTS` and re-run `eval/simulate.py`, `tune.py` and the parity check. |
| Get "% match" and Discover ranking for new photos | Run the SigLIP worker: `cd services/ml && python -m app.worker --once`. |
| Rebuild Studio | `node tools/studio/build.mjs`, then commit `frontend/public/studio/`. To bump miniPaint, change `MINIPAINT` (commit and sha256) in `build.mjs` and re-check the licences. |
| Re-seed demo data | `cd frontend && node scripts/seed-test-users.mjs --with-photos`, then paste `supabase/demo/demo_data.sql`. Undo with `supabase/demo/remove_demo_data.sql`. |
| Run the e2e test | `cd frontend && node scripts/e2e/run.mjs` (or `--dry-run`, `--only messaging,rls`). Needs Node ≥ 22.15 and `frontend/.env.local`. |
| Check the schema after a change | Paste `supabase/tests/smoke_test.sql` (and the feature's test) into the SQL Editor; every line should end in `ok`. |
| Refresh this map's facts | `node tools/codemap/scan.mjs > tools/codemap/codemap.json` |

### Commands cheat sheet

```bash
# Web app (http://localhost:5173)
cd frontend && cp .env.example .env.local      # fill in URL + publishable key
bash ./start                                   # or: bash ./start --host  (LAN)
npm run build                                  # production build -> frontend/dist

# Seed / demo / cleanup (service role key read from services/ml/.env, never printed)
cd frontend
node scripts/seed-test-users.mjs [--with-photos]
node scripts/backup-nonphoto.mjs --dry-run && node scripts/backup-nonphoto.mjs
node scripts/delete-nonphoto-users.mjs --dry-run && node scripts/delete-nonphoto-users.mjs
#   SQL Editor: supabase/demo/demo_data.sql | remove_demo_data.sql | photography_only_setup.sql

# End-to-end (publishable key only)
cd frontend
node scripts/e2e/run.mjs [--dry-run] [--only a,b] [--verbose] [--keep] [--pause-for-payment]
node --test scripts/e2e/test/helpers.test.mjs

# Supabase CLI (hosted project, no Docker)
npx supabase login && npx supabase link --project-ref ktjvbajrfrbwpndforcy
npx supabase migration new <name>
npx supabase db push                           # NOT before the photography-only runbook
npx supabase gen types typescript --project-id ktjvbajrfrbwpndforcy > frontend/src/lib/database.types.ts

# ML service (services/ml)
cd services/ml && python -m venv .venv && .venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt
cp .env.example .env
python scripts/fetch_models.py                 # AI tool models (~440 MB) -> models/
uvicorn app.main:app --port 8000               # /health, /ai/*, /process-pending (X-ML-Secret)
python -m app.worker [--once | --retag]        # SigLIP embeddings + auto-tags
python -m pytest tests
python scripts/try_images.py <folder> --query "moody wedding"
python -I eval/dataset.py fetch <W> && python -I eval/embed.py <W> && python -I eval/simulate.py <W> --algos oracle,v1,v2

# Studio
node tools/studio/build.mjs [--work <dir>] [--keep]

# Codemap facts
node tools/codemap/scan.mjs > tools/codemap/codemap.json
```

---

## Tim's services and the archive

This section covers two things that sit beside the live photography app:

1. **Tim Phelps's code** (author `Timothy Phelps` on every file): the FastAPI backend in `backend/`, the plan-driven Claude Code orchestrator in `orchestrator/`, the plan template in `plans/`, and the `/spec` skill in `.claude/`. That's 52 tracked files, each with its own entry below.
2. **`archive/event-platform/`**: the multi-vendor event-platform code that was moved out during the photography-only pivot. That's 140 tracked files, summarised folder by folder in tables.

---

### Part 1: Tim Phelps's code

#### How Tim's code fits into the app

- **The live app mostly doesn't use `backend/`.** Web (`frontend/`) and mobile (`mobile/`) talk to Supabase directly, and the ML service (`services/ml/`, port 8000) handles AI and photos. `backend/` is a separate FastAPI service on **port 8001**. Only one feature calls it: **booking gallery upload on the web**.
  - The call chain is `frontend/src/screens/Chat.jsx` → `components/GalleryUpload.jsx` → `frontend/src/api/gallery.js` `uploadGallery()` → `POST {API_URL}/bookings/{id}/gallery`. It sends the Supabase access token as `Authorization: Bearer`.
  - The upload button only shows for the booking's provider while the booking is `confirmed`, `in_progress` or `delivered`.
  - v1 stores nothing. It only returns a receipt (`stored: false`).
  - Mobile has no client for `backend/`. Nothing in `mobile/src` calls port 8001.
- **Some endpoints have no caller.** No client code calls `POST /auth/logout`, `GET /users/me` or `GET /users/me/profile`. Web (`frontend/src/auth.jsx`) and mobile (`mobile/src/state/auth.tsx`) both sign out with plain `supabase.auth.signOut()`. So the backend's session denylist is never filled in practice. `backend/AUTH.md` lists this as a known limit.
- **Env vars**:
  - `backend/.env` (gitignored) holds `SUPABASE_URL`, `SUPABASE_KEY` (the anon/publishable key, so RLS applies as the user), an optional `SUPABASE_JWT_SECRET` (legacy HS256 tokens) and an optional `CORS_ORIGINS`.
  - The web app uses `VITE_API_URL` (see `frontend/.env.example`). Without it, the URL falls back to `http://<page host>:8001`.
  - ⚠ The default `cors_origins` is only `http://localhost:5173`. Testing from a phone on the LAN (the reason for the host fallback) needs `CORS_ORIGINS` set.
- **Database dependencies**: the logout and revocation code uses `public.revoked_sessions` and the RPCs `revoke_my_session()` / `is_my_session_revoked()`. These come from `supabase/migrations/20261008220000_revoked_sessions.sql` (Tim, `e495343`). The gallery route reads `bookings` and `providers` under RLS.
- **Tim's files outside this section** (covered in their own sections):
  - `frontend/src/api/gallery.js`, `frontend/src/components/GalleryUpload.jsx`, `frontend/src/lib/galleryRules.js`, and his edits to `frontend/src/screens/Chat.jsx` and `frontend/.env.example` (`024a38b`)
  - `frontend/start` (`ee319d7`)
  - the `revoked_sessions` migration and the `supabase/config.toml` token-expiry change (`e495343`)
- **The orchestrator is a dev tool, not part of the app.**
  - **How to run it:** `python3 -m orchestrator start --plan plans/<x>.md` or `--plan specs/<slug>.md`, from the repo root.
  - **What it reads:**
    - `orchestrator/config.toml`
    - the approved plan or spec
    - `orchestrator/prompts/*.md`
    - the vendored plugin in `orchestrator/plugins/code-simplifier/`
  - **What it writes:**
    - `.orchestrator/tasks/<task-id>/` (gitignored): state, the frozen plan, logs and transcripts
    - a git worktree in `../photographer-match.worktrees/<task-id>` on branch `orch/<slug>`
    - then a commit, a push and a PR through `gh`. It never merges.
  - **It has been used once.** PR #7 (`orch/booking-gallery-upload-received-only-v1`) built the gallery upload. Commit `024a38b` has the trailer `Orchestrator-Task: 20261010-150547-booking-gallery-upload-received-only-v1`.
  - **Its checks only cover `backend/` and the frontend build.** It never verifies `mobile/`, `services/ml/` or the Supabase SQL tests.
  - **It's POSIX-only:**
    - `fcntl` in `state.py`
    - `os.killpg` / `start_new_session` in `proc.py`
    - `.venv/bin/...` paths in `config.toml` and `backend/start`
    
    So it needs WSL, Linux or macOS. It won't run in this repo's native Windows checkout. Neither `.orchestrator/` nor the worktree folder exists locally.
- **`.claude/`**: only the `/spec` skill is tracked. `.claude/settings.local.json` is local and ignored by the user's global gitignore. The orchestrator deliberately ignores everything repo-provided in `.claude/` (`--setting-sources user --disable-slash-commands`). The skill's output folder, `specs/`, is gitignored, and none exists locally.

Commits referenced below (all by Timothy Phelps):
- `e495343` (2026-10-08): "pass for auth with supabase login / expiring a token on logout with denylist in db"
- `9258c02` (2026-10-10): "Add plan-driven Claude Code orchestrator and backend checks"
- `9a73d30` (2026-10-10): "Add /spec planning skill and run spec acceptance criteria as checks"
- `024a38b` (2026-10-10): "Booking gallery upload (received-only v1)"
- `ee319d7` (2026-10-10): "orchestrator agent and start scripts for frontend and backend"

#### `backend/` — FastAPI auth + gallery service (Tim) · 21 files

#### `backend/main.py`
**What:** The FastAPI app ("Photographer Match API"). It adds CORS from settings, mounts the `auth`, `users` and `bookings` routers, and serves `GET /health`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (added the bookings router).
**Used by:** `backend/start` (`uvicorn main:app --port 8001`); `tests/test_health.py`, `tests/test_gallery_upload.py`.
**Notes:** Imports are top-level (`from api import …`), so it runs with `backend/` as cwd, not as a package.

#### `backend/config.py`
**What:** Pydantic `Settings` read from `backend/.env`: `supabase_url`, `supabase_key` (anon key), optional `supabase_jwt_secret`, and `cors_origins` (default `["http://localhost:5173"]`). `get_settings()` is cached with `lru_cache`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py`, `dependencies/auth.py`. Tests override it with env vars in `tests/conftest.py`.

#### `backend/api/auth.py`
**What:** `POST /auth/logout` (204). It records the session in the denylist (RPC `revoke_my_session`), marks it revoked in the process cache, then signs the session out at Supabase with scope `local`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). **No HTTP client calls it.** Web and mobile sign out with `supabase.auth.signOut()` only. No tests.

#### `backend/api/users.py`
**What:** `GET /users/me` returns the id and email from the JWT. `GET /users/me/profile` returns the caller's `profiles` row under RLS (404 if missing).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). No client or test calls it.

#### `backend/api/bookings.py`
**What:** `POST /bookings/{booking_id}/gallery` (multipart `photos`). It checks that the booking exists under RLS, that the caller is its provider (`providers.profile_id`), the booking status, the photo count (1–100) and each file. It returns a receipt `{booking_id, received, total_bytes, stored: false, photos}`. Nothing is stored. All files must pass or the whole upload is rejected.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `main.py` (router). Its HTTP client is `frontend/src/api/gallery.js` `uploadGallery()`, used by `components/GalleryUpload.jsx`, which `screens/Chat.jsx` opens. Tested by `tests/test_gallery_upload.py`.

#### `backend/core/gallery.py`
**What:** Upload rules:
- `MAX_PHOTOS=100`, 50 MB per file
- upload statuses `confirmed` / `in_progress` / `delivered`
- JPEG/PNG/WebP/HEIC types, falling back to the file extension for an empty or octet-stream type

`check_photo()` returns `(status, detail)` for the first problem it finds.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/bookings.py`. It's mirrored by hand in `frontend/src/lib/galleryRules.js` (used by `GalleryUpload.jsx` and `Chat.jsx`).

#### `backend/core/sessions.py`
**What:** `RevokedSessions`, a thread-safe per-process cache in front of `public.revoked_sessions`. A "revoked" answer is cached until the token expires. A "not revoked" answer is rechecked every 30 s. Also defines the module singleton `revoked_sessions`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/auth.py`, `dependencies/auth.py`.

#### `backend/dependencies/auth.py`
**What:** FastAPI dependencies:
- `AccessTokenDep`: the bearer token
- `CurrentUser`: verifies the JWT locally with PyJWT, using JWKS ES256/RS256 or the legacy HS256 secret, and checks audience and issuer. It then checks `session_id` against the denylist through RPC `is_my_session_revoked`, which fails closed with 503.
- `SupabaseDep`: a new per-request Supabase client that sends the user's token, so RLS applies

**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `api/auth.py`, `api/users.py`, `api/bookings.py`; `tests/test_gallery_upload.py` (overrides `get_current_user` and `get_supabase`).

#### `backend/AUTH.md`
**What:** Design doc for backend auth: how a request is verified, what logout does, its limits, and the top follow-up of moving the denylist to Redis. Also covers setup (`.env` keys, the `revoked_sessions` migration, 600 s token expiry).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** linked from the root `README.md`.
**Notes:** Its "Run" line has no `--port 8001`. `backend/start` sets the port.

#### `backend/start`
**What:** Bash launcher. It requires `backend/.env`, creates `.venv`, reinstalls `requirements.txt` only when its sha256 changes, then runs `uvicorn main:app --reload --port 8001`. Extra arguments go to uvicorn.
**Made:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (`bash backend/start`, in the root `README.md`). Its sibling is `frontend/start`.
**Notes:** Uses the `.venv/bin/` layout, so it doesn't work with a native Windows venv (`.venv\Scripts`).

#### `backend/requirements.txt`
**What:** Pinned runtime dependencies: fastapi, uvicorn, supabase 2.32 (postgrest, supabase-auth, storage3…), PyJWT/cryptography, httpx, pydantic-settings, and python-multipart (for uploads).
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (python-multipart).
**Used by:** `backend/start`, `requirements-dev.txt` (`-r`), the orchestrator's `[setup]`, the `rerun_on` and `pip-audit` check.

#### `backend/requirements-dev.txt`
**What:** Dev tools on top of the runtime dependencies: pytest, ruff, mypy, pip-audit.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** the orchestrator's `[setup]` (installed into each worktree's `backend/.venv`). It's on the orchestrator's protected-files list.

#### `backend/pyproject.toml`
**What:** Tool config only:
- ruff: py312, line length 100, rules `E F W I B UP`, ignore `B904`
- mypy: with the pydantic plugin
- pytest: `testpaths=tests`, `pythonpath=.`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** ruff, mypy and pytest run from `backend/`, which are the orchestrator's `ruff-lint`/`ruff-format`/`mypy`/`pytest` checks. Protected file.

#### `backend/.gitignore`
**What:** Ignores `.env`, `.venv/`, `__pycache__/`, `*.py[cod]` and `.pytest__cache/`.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** git.
**Notes:** `.pytest__cache/` is a typo (pytest writes `.pytest_cache/`), so that folder isn't ignored here.

#### `backend/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** nothing in practice. The app and tests run with `backend/` as the import root (`pythonpath=.`).

#### `backend/api/__init__.py`
**What:** Empty package marker for the routers.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `from api import auth, bookings, users` in `main.py`.

#### `backend/core/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `core.sessions` and `core.gallery` imports.

#### `backend/dependencies/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-08 · `e495343` · "pass for auth with supabase login / expiring a token on logout with denylist in db" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `dependencies.auth` imports.

#### `backend/tests/conftest.py`
**What:** Sets dummy `SUPABASE_URL`/`SUPABASE_KEY`/`SUPABASE_JWT_SECRET` env vars, so tests never reach the real project.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest (auto-loaded). Protected by the orchestrator. `orchestrator/verify.py` sets the same dummy values.

#### `backend/tests/test_health.py`
**What:** One test: `GET /health` returns `{"status": "ok"}`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest / the orchestrator's `pytest` check.

#### `backend/tests/test_gallery_upload.py`
**What:** 13 test functions, with the status tests parametrised, for the gallery endpoint. They cover the receipt, a missing token, an unknown booking, a caller who isn't the provider, closed and open statuses, 100 vs 101 photos, file types, octet-stream plus extension, empty files, files over 50 MB, and a missing field. Uses a fake Supabase query builder through `dependency_overrides`.
**Made:** 2026-10-10 · `024a38b` · "Booking gallery upload (received-only v1)" (Timothy Phelps). **Last changed:** same commit.
**Used by:** pytest / the orchestrator's `pytest` check.

#### `orchestrator/` — plan-driven Claude Code orchestrator (Tim) · 25 files

**How it works:** an approved plan or spec goes in. The orchestrator then:
1. creates a worktree and an `orch/<slug>` branch
2. runs `claude -p` to implement the plan
3. runs the checks and guards outside the agent
4. sends failures back to Claude, with a limited number of retries
5. runs one code-simplifier pass, which it keeps only if every check still passes
6. on `ship`, commits, pushes and opens a PR

Exit codes: 0 ok, 1 failed, 2 refused, 3 needs a human, 130 stopped.

#### `orchestrator/README.md`
**What:** The full manual:
- the flow (`/spec` or a hand-written plan → verify loop → simplify → ship)
- setup (Claude CLI, `gh`, gitleaks)
- plan and spec requirements, commands and exit codes
- checks, guards, limits, the safety model
- state and logs, and how to run the tests

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** linked from the root `README.md`. The `/spec` skill reads it during its investigation step.
**Notes:** It says the suite has "33 hermetic acceptance tests", but `test_orchestrator.py` has 35 `test_` methods.

#### `orchestrator/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m orchestrator`; `tests/test_orchestrator.py` (`from orchestrator import cli, proc`).

#### `orchestrator/__main__.py`
**What:** Entry point: `raise SystemExit(main())` from `cli`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m orchestrator …` (run by humans; the `/spec` skill prints the command).

#### `orchestrator/cli.py`
**What:** argparse CLI with the subcommands `start`, `resume`, `status`, `stop`, `ship`, `logs` and `list`, plus limit flags (`--max-remediations`, `--budget`, `--timeout`), `--auto-ship`, `--no-simplify` and `--answer`. It finds the repo, loads `config.toml`, and refuses to run when `ORCHESTRATOR_ACTIVE` is set (recursion guard).
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `__main__.py`; `tests/test_orchestrator.py`. Imports `proc`, `report.status_text` and `runner.Orchestrator`.

#### `orchestrator/runner.py`
**What:** The `Orchestrator` class and the task lifecycle: create the task (lock, worktree, frozen plan), implement, verify and remediate within limits, run `_simplify` (a fresh session with `--plugin-dir` and `prompts/simplify.md`, reverted with `git read-tree` on failure), then `ship`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py`. Imports `agent`, `guards`, `proc`, `ship`, `verify`, `plan`, `state` and `report.pr_body`.

#### `orchestrator/agent.py`
**What:** Builds and runs `claude -p --output-format json` with one persistent session per task (`--session-id` / `--resume`), a `--json-schema` end-of-turn status, `dontAsk` permissions, ignored repo settings, a budget cap and `--append-system-prompt-file prompts/system.md`. It parses the result into `AgentTurn`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `runner.py`.

#### `orchestrator/plan.py`
**What:** Parses and validates both formats:
- `plans/TEMPLATE.md` style: `## Objective` … sections and `Status: approved`
- `/spec` files: `## 1.`–`## 12.` sections, `- status: approved`, no unfilled `{…}` slots

It pulls out `AC-n: \`command\`` acceptance checks, Allowed paths and Approvals, and provides a sha256 and a slug.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend".
**Used by:** `runner.py`, `agent.py`, `guards.py`, `verify.py`, `report.py`; tests.

#### `orchestrator/verify.py`
**What:** Runs the `[[checks]]` from `config.toml` in the worktree with a scrubbed environment and dummy Supabase env. It handles `{files}`/`{worktree}` placeholders, `when_changed`, a rerun of each failure to detect flaky checks, offline markers that mark a check unavailable, acceptance commands (`bash -c`), and failure fingerprints for the no-progress stop.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `runner.py`; `guards.py` (`matches`).

#### `orchestrator/guards.py`
**What:** Diff policy run on every iteration:
- **Sent back to Claude:** edits to protected files, changes outside the allowed paths, secret files, added skip/noqa/type-ignore
- **Pauses for a human:** deleted tests, destructive SQL or edits to an existing migration, unless the plan's `## Approvals` allows them

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`.

#### `orchestrator/proc.py`
**What:** Subprocess helpers:
- `scrubbed_env()` with an allowlist, so `GH_TOKEN`, API keys and `SSH_AUTH_SOCK` are dropped
- `run()` with timeouts and process-group kill (`os.killpg`)
- a cooperative `STOP` event
- `git()` / `GitError`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `cli.py`, `runner.py`, `agent.py`, `verify.py`, `guards.py`, `ship.py`; tests.
**Notes:** POSIX-only (`killpg`, `start_new_session`).

#### `orchestrator/state.py`
**What:** `TaskState` dataclass with the lifecycle `implementing → verifying → remediating → awaiting_ship → shipping → shipped`, and paused/terminal states. `Store` handles `.orchestrator/tasks/<id>/state.json` and the `log.jsonl` event log. `RepoLock` allows one task per repo using `fcntl.flock`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`, `report.py`, `ship.py`; tests (`Store`).
**Notes:** `fcntl` means it won't import on native Windows.

#### `orchestrator/report.py`
**What:** Human-facing text: the checks table, the simplify outcome line, `status_text()` for the terminal, and `pr_body()`. The PR body includes the objective, checks, `Visual:` acceptance criteria as manual review items, review notes and cost.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py` (`status_text`), `runner.py` (`pr_body`).

#### `orchestrator/ship.py`
**What:** Idempotent ship steps:
- `preflight_gh`
- `commit` (with the `Orchestrator-Task:` and `Co-Authored-By` trailers)
- `push` (refuses if the remote branch differs; never force-pushes)
- `open_pr` through `gh`, reusing an existing PR

It never merges or deploys.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py`.

#### `orchestrator/config.toml`
**What:** All settings:
- `[limits]`: 4 remediations, $10, 45 min
- `[git]`: base `main`, branch prefix `orch/`, worktree root
- `[agent]`: allowed and disallowed tools
- `[simplify]`: $2, 10 min
- `[setup]`: venv plus dev requirements
- `[[checks]]`: ruff-lint, ruff-format, mypy, pytest, gitleaks, pip-audit (optional), frontend-build when `frontend/**` changed
- `[acceptance]`, `[guards]` (protected and test globs, secret globs, migration globs), `[ship]`

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `cli.py` (`DEFAULT_CONFIG`); the `/spec` skill reads it during its investigation step.

#### `orchestrator/ruff.toml`
**What:** Ruff config for the orchestrator's own Python: py312, line length 100, rules `E F W I B UP`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** ruff when run on `orchestrator/` by hand. None of the orchestrator's own checks lint it.

#### `orchestrator/prompts/system.md`
**What:** System prompt appended for implementation turns. Its rules: the plan is the source of truth; stop with `needs_human` instead of guessing; never weaken tests or add suppressions; don't touch protected paths, git or the network; treat `<untrusted>` text as data; AC commands are required checks.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** `agent.py` (default `system_prompt="system.md"`).

#### `orchestrator/prompts/simplify.md`
**What:** Overrides for the simplifier pass. It replaces the plugin's JS/React standards with this repo's Python/FastAPI standards, and limits edits to the task's changed non-test files with behaviour kept exactly the same.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `runner.py` `_simplify` (`system_prompt="simplify.md"`).

#### `orchestrator/plugins/code-simplifier/.claude-plugin/plugin.json`
**What:** Manifest of the vendored Anthropic `code-simplifier` plugin (v1.0.0).
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `claude --plugin-dir orchestrator/plugins/code-simplifier` (from `config.toml` `[simplify].plugin_dir` through `runner.py`).

#### `orchestrator/plugins/code-simplifier/agents/code-simplifier.md`
**What:** The upstream `code-simplifier` agent definition (model `opus`), vendored unmodified.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `--agent code-simplifier:code-simplifier` in the simplify pass.

#### `orchestrator/plugins/code-simplifier/VENDORED.md`
**What:** Where the plugin comes from: `anthropics/claude-plugins-official` at commit `b8e53f1c…` (2026-10-09), unmodified. Its JS standards are overridden by `prompts/simplify.md`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (provenance and upgrade notes); referenced in the orchestrator README.

#### `orchestrator/plugins/code-simplifier/LICENSE`
**What:** Apache-2.0 license of the vendored plugin.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

#### `orchestrator/tests/__init__.py`
**What:** Empty package marker.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `python3 -m unittest discover -s orchestrator/tests -t .`.

#### `orchestrator/tests/test_orchestrator.py`
**What:** Hermetic acceptance suite with 35 `test_` methods. It uses a throwaway git repo, a local bare remote, and the fake `claude` and `gh`. It covers plan refusal, happy path to PR, remediation, limits and no-progress, `needs_human` plus `--answer`, guards, flaky and unavailable checks, env scrubbing, stop/resume, recursion, simplifier keep/discard, spec parsing and AC checks, and the absence of any merge or deploy path.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `ee319d7` · "orchestrator agent and start scripts for frontend and backend".
**Used by:** `python3 -m unittest discover -s orchestrator/tests -t . -v` (by hand; no CI).

#### `orchestrator/tests/fake_claude.py`
**What:** Stand-in for `claude -p`. It replays `scenario.json` turn by turn (writes, deletes, status, cost, exit codes) and records every call to `calls.jsonl`.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `test_orchestrator.py` (copied into a temp bin dir and set as `[agent].command`).

#### `orchestrator/tests/fake_gh.py`
**What:** Stand-in for the GitHub CLI. It records calls to `gh_calls.jsonl` and keeps PRs in `prs.json`, so `auth status`, `pr list` and `pr create` work.
**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `test_orchestrator.py` (set as `[ship].gh`).

#### `plans/` — hand-written plans (Tim) · 1 file

#### `plans/TEMPLATE.md`
**What:** The template for a hand-written orchestrator plan:
- a title, which becomes the branch and PR title
- `Status: draft`, changed to `approved` once reviewed
- the required `## Objective`, `## Scope`, `## Acceptance criteria` (with the `AC-n: \`cmd\`` form), `## Design constraints` and `## Required tests` sections
- the optional `## Allowed paths` and `## Approvals` sections

**Made:** 2026-10-10 · `9258c02` · "Add plan-driven Claude Code orchestrator and backend checks" (Timothy Phelps). **Last changed:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks".
**Used by:** humans (copy it to `plans/<name>.md`), then `python3 -m orchestrator start --plan …` / `plan.py`. `plans/**` is protected from the agent.
**Notes:** It's the only file in `plans/`. No real plan has been committed. The one orchestrator run (PR #7) used a plan that isn't in the repo.

#### `.claude/` — Claude Code skill (Tim) · 5 files

#### `.claude/skills/spec/SKILL.md`
**What:** The `/spec` skill. It investigates the repo (including the orchestrator README and config), interviews the user in multiple-choice rounds, and writes `specs/<slug>.md` from a 13-section template. A fresh agent then does a dry run of implementing from the spec alone to find gaps, and Gate B asks for approval. It never implements: on approval it prints `python3 -m orchestrator start --plan specs/<slug>.md`.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** Claude Code sessions in this repo (`/spec …`). The spec files it writes are parsed by `orchestrator/plan.py`. `specs/` is gitignored.

#### `.claude/skills/spec/config.yml`
**What:** Skill config: `output_language: en`, pinned (upstream defaults to `auto`/Japanese).
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** `SKILL.md` step 0, which reads it.

#### `.claude/skills/spec/VENDORED.md`
**What:** Where the skill comes from (`dualform-labs/spec-skill` @ `340ea16…`, Apache-2.0) and every change from upstream:
- translated to English
- plans only, never implements
- `draft→approved` statuses only
- `specs/` in this repo
- machine-runnable §11 acceptance criteria
- Allowed paths and Approvals subsections

Also explains why `spec-lint.sh` wasn't vendored.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** humans (provenance); referenced from `SKILL.md`.

#### `.claude/skills/spec/LICENSE`
**What:** Apache-2.0 license copied unchanged from upstream spec-skill.
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

#### `.claude/skills/spec/NOTICE`
**What:** Apache NOTICE file from upstream ("spec-skill, Copyright 2026 dualform-labs").
**Made:** 2026-10-10 · `9a73d30` · "Add /spec planning skill and run spec acceptance criteria as checks" (Timothy Phelps). **Last changed:** same commit.
**Used by:** license compliance only.

---

### Part 2: `archive/event-platform/` — the archived multi-vendor event platform

#### What it is and why

On **2026-10-18** photographer-match went back to **photography only**: one vertical, "Photo & video" (slug `photography`). Everything that only served the wider event-services marketplace was moved here:

- 17 other verticals (venues, catering, DJs…)
- events with friends
- the AI event planner
- occasion and service browse pages
- post credits
- vendor cards in Discover

The archive is **kept for later**. It is not built, not tested and not imported. No file outside `archive/` imports anything in it; every `importedBy` link in `codemap.json` points from one archive file to another. The database schema deliberately stays multi-vertical (`service_categories` JSON Schemas, `providers.vertical_id`, every price type, `events`/`event_members`), so a vertical can come back as data. The full story is in `archive/event-platform/README.md` and `docs/PHOTOGRAPHY_ONLY_RUNBOOK.md`.

- **Full previous state:** git tag **`multi-vendor-snapshot`**. It's an annotated tag pointing to commit `c7028db` (2026-10-12, "Discover for every vertical (web + mobile), demo vendor portfolios"). Every file sits there in its original place. Use the tag to see or run the old app, and this folder to find pieces quickly.
- **Commits that built the archive** (all by briankimdw):
  - `fba56f4` (2026-10-19), "Photography-only pivot: web and mobile apps": moved 108 files with `git mv`, so `renamedFrom` is set, and added 8 copies or extracts.
  - `80615b2` (2026-10-19), "Photography-only pivot: database cleanup, scripts, ML service, docs": added 22 files (copies, the e2e snapshot, the ml-planner shell files, the README).
  - `5f6655d` (2026-10-20), "Cleanup: remove dead code, unused deps and stale docs": moved `docs/QA_CHECKLIST.md` and `docs/UI_SWEEP.md` in from `docs/`.
- **Not in git:** `archive/event-platform/data-backup/` (gitignored). These are the deleted rows and Storage files, written by `frontend/scripts/backup-nonphoto.mjs`.

#### How to restore a piece (summary of the archive README)

General rule: take files from the tag (`git checkout multi-vendor-snapshot -- <path>`) or from here, then re-wire whatever the pivot removed. **Never re-run an old migration.** Write a new one.

- **A vertical** (e.g. catering):
  1. Copy its `service_categories` rows from `supabase/seed_all_verticals.sql` into `supabase/seed.sql`.
  2. Restore `frontend/src/verticals/catalog.js` and `<slug>/config.js` from this folder.
  3. Re-add the test vendors from `docs/test-users-vendors.json` with new passwords.
  4. Copy that vertical's demo data from `demo_data_all_verticals.sql`.
  5. Follow `docs/VERTICALS.md`.
  6. Re-insert old rows from `data-backup/` with the service role.
- **Events with friends:** write a new migration from `20261011000100_event_groups.sql` (`events`/`event_members` still exist), then restore the screens and `scripts/e2e/sections/events.mjs`.
- **Post credits:** new migration from `20261011000200_post_credits.sql`, plus `api/portfolio.credits-and-occasions.js` and `components/upload/Credits.jsx`.
- **AI planner:** see `services/ml-planner/README.md`. Copy `app/planner/` and the tests back into `services/ml/`, re-add the `/plan` block of `main.py`/`config.py`, and add `anthropic` to the requirements.
- **Vendor cards in Discover:** new migration from `20261013000000_discover_all_verticals.sql`, plus the Discover components here.

#### Folder-by-folder

Paths in the tables are relative to `archive/event-platform/`. "Original location" comes from `renamedFrom` in `codemap.json`. For files with no `renamedFrom` (copies and extracts), the original was checked against the pre-pivot tree (`fba56f4^`). Rows marked **(copy)** were confirmed byte-identical to that original. The live repo still has its own trimmed photography-only version of those files, and archived migrations also still exist in `supabase/migrations/`. Authorship: every archived file was originally written by briankimdw. None of it is Tim's.

##### Root · 1 file

| file | what it was | original location | archived in |
|---|---|---|---|
| `README.md` | Archive guide: what was archived, what stayed in the schema, how to restore each feature | new file | `80615b2` |

##### `docs/` · 5 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `EVENT_PLATFORM_PLAN.md` | Plan for growing from a photographer marketplace into a multi-vendor event platform | `docs/EVENT_PLATFORM_PLAN.md` | `fba56f4` |
| `VERTICALS.md` | Checklist for adding a vertical (catalog, config, seed, schemas) | `docs/VERTICALS.md` | `fba56f4` |
| `QA_CHECKLIST.md` | Web QA run record of the multi-vendor app (2026-10-10) | `docs/QA_CHECKLIST.md` | `5f6655d` |
| `UI_SWEEP.md` | UI overflow/clipping sweep record of the multi-vendor app (2026-10-11) | `docs/UI_SWEEP.md` | `5f6655d` |
| `test-users-vendors.json` | The 32 test vendors of the archived verticals, passwords removed (their accounts were deleted) | extract of `docs/test-users.json` (`vendors`) | `80615b2` |

##### `frontend/src/` — top level, `api/`, `lib/`, `screens/` · 11 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `styles.css` | The pre-pivot global stylesheet, including planner, events and vertical styles | `frontend/src/styles.css` **(copy)** | `fba56f4` |
| `api/events.js` | Events-with-friends data layer: events, members, invites, candidate board, votes | `frontend/src/api/events.js` | `fba56f4` |
| `api/planner.js` | Client for the AI planner (`services/ml` `POST /plan`) and saved plans | `frontend/src/api/planner.js` | `fba56f4` |
| `api/home.multi-vertical.js` | The multi-vertical Home/browse builders (old `buildHomeFeed`, `/services/:vertical`, `/occasions/:slug`, the Discover vertical picker) | extract cut from `frontend/src/api/home.js` | `fba56f4` |
| `api/portfolio.credits-and-occasions.js` | Post occasions and post credits (tag the other vendors on a post) | extract cut from `frontend/src/api/portfolio.js` | `fba56f4` |
| `lib/planBrief.js` | Plain-JS display helpers for planner briefs, shared with Expo | `frontend/src/lib/planBrief.js` | `fba56f4` |
| `screens/Events.jsx` | `/events` list and `/events/new` | `frontend/src/screens/Events.jsx` | `fba56f4` |
| `screens/EventDetail.jsx` | `/events/:id` event workspace (chat, invite, hiring board, votes) | `frontend/src/screens/EventDetail.jsx` | `fba56f4` |
| `screens/Occasion.jsx` | `/occasions/:slug` occasion landing page with a "Plan this with AI" box | `frontend/src/screens/Occasion.jsx` | `fba56f4` |
| `screens/Planner.jsx` | `/plan` AI event planner chat screen | `frontend/src/screens/Planner.jsx` | `fba56f4` |
| `screens/ServiceHome.jsx` | `/services/:vertical` vertical landing page (hero, service chips, provider shelves) | `frontend/src/screens/ServiceHome.jsx` | `fba56f4` |

##### `frontend/src/components/` · 23 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `discover/VerticalPicker.jsx` | Discover deck's "what am I swiping" vertical chip and sheet | `frontend/src/components/discover/VerticalPicker.jsx` | `fba56f4` |
| `discover/discover.css` | Pre-pivot Discover styles (`dc-` prefix) | `frontend/src/components/discover/discover.css` **(copy)** | `fba56f4` |
| `events/EventParts.jsx` | Shared event pieces: Add-to-event sheet and button, rows, labels | `frontend/src/components/events/EventParts.jsx` | `fba56f4` |
| `events/EventsShelf.jsx` | "Your events" shelf on Home and Me | `frontend/src/components/events/EventsShelf.jsx` | `fba56f4` |
| `events/PlanSavedActions.jsx` | "Plan it with friends" actions after a planner save | `frontend/src/components/events/PlanSavedActions.jsx` | `fba56f4` |
| `events/events.css` | Styles for the events-with-friends screens | `frontend/src/components/events/events.css` | `fba56f4` |
| `home/Browse.jsx` | Uber Eats-style vertical tiles on Home (→ `/services/:vertical`) | `frontend/src/components/home/Browse.jsx` | `fba56f4` |
| `home/home.css` | Pre-pivot Home, service and occasion styles (`hd-` prefix) | `frontend/src/components/home/home.css` **(copy)** | `fba56f4` |
| `planner/BriefChips.jsx` | "What I understood" brief chips with inline editors | `frontend/src/components/planner/BriefChips.jsx` | `fba56f4` |
| `planner/BudgetBreakdown.jsx` | Stacked budget bar plus rows per category | `frontend/src/components/planner/BudgetBreakdown.jsx` | `fba56f4` |
| `planner/Composer.jsx` | Planner prompt box (hero and docked versions) | `frontend/src/components/planner/Composer.jsx` | `fba56f4` |
| `planner/MyEvents.jsx` | Saved plans list | `frontend/src/components/planner/MyEvents.jsx` | `fba56f4` |
| `planner/PlanCard.jsx` | Home entry card to the planner | `frontend/src/components/planner/PlanCard.jsx` | `fba56f4` |
| `planner/PlanError.jsx` | Planner error state with retry | `frontend/src/components/planner/PlanError.jsx` | `fba56f4` |
| `planner/PlanningState.jsx` | "Thinking" steps and skeletons | `frontend/src/components/planner/PlanningState.jsx` | `fba56f4` |
| `planner/Recommendations.jsx` | Ranked vendor options per category | `frontend/src/components/planner/Recommendations.jsx` | `fba56f4` |
| `planner/SharePlanButton.jsx` | Share a saved plan to chats as an event card | `frontend/src/components/planner/SharePlanButton.jsx` | `fba56f4` |
| `planner/brief.js` | Web brief helpers plus event-type icons | `frontend/src/components/planner/brief.js` | `fba56f4` |
| `planner/devMock.js` | DEV-only stand-in for `POST /plan` (`/plan?mock=1`) | `frontend/src/components/planner/devMock.js` | `fba56f4` |
| `planner/devMock.fixture.json` | Fixture response for `devMock.js` | `frontend/src/components/planner/devMock.fixture.json` | `fba56f4` |
| `upload/Credits.jsx` | Post-credits picker in the upload flow | `frontend/src/components/upload/Credits.jsx` | `fba56f4` |
| `verticals/EmptyVertical.jsx` | "No caterers near you yet" empty state with an invite | `frontend/src/components/verticals/EmptyVertical.jsx` | `fba56f4` |
| `verticals/VerticalSwitcher.jsx` | Airbnb-style vertical row, plus the `VerticalGrid` | `frontend/src/components/verticals/VerticalSwitcher.jsx` | `fba56f4` |

##### `frontend/src/verticals/` · 21 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `catalog.js` | Shared catalog of all 18 verticals and 10 occasions (source of truth for web, Expo and seed) | `frontend/src/verticals/catalog.js` **(copy)** | `fba56f4` |
| `index.js` | Vertical registry: catalog plus per-vertical configs and a generic fallback | `frontend/src/verticals/index.js` **(copy)** | `fba56f4` |
| `fields.js` | Reusable field definitions for vertical configs | `frontend/src/verticals/fields.js` | `fba56f4` |
| `photography/config.js` | Pre-pivot photography config | `frontend/src/verticals/photography/config.js` **(copy)** | `fba56f4` |
| `videography/config.js` | Videography config (films and reels); merged into Photo & video | `frontend/src/verticals/videography/config.js` | `fba56f4` |
| `bar/config.js` | Bar & drinks config (per guest) | `frontend/src/verticals/bar/config.js` | `fba56f4` |
| `cakes/config.js` | Cakes & desserts config (per item or serving) | `frontend/src/verticals/cakes/config.js` | `fba56f4` |
| `catering/config.js` | Catering config (per guest, cuisines, dietary) | `frontend/src/verticals/catering/config.js` | `fba56f4` |
| `decor/config.js` | Decor & design config | `frontend/src/verticals/decor/config.js` | `fba56f4` |
| `entertainment/config.js` | Entertainment config (photo booths, magicians, kids) | `frontend/src/verticals/entertainment/config.js` | `fba56f4` |
| `florals/config.js` | Florals config (per piece or full design) | `frontend/src/verticals/florals/config.js` | `fba56f4` |
| `hair-makeup/config.js` | Hair & makeup config (per person) | `frontend/src/verticals/hair-makeup/config.js` | `fba56f4` |
| `music/config.js` | DJs & live music config (hourly or set price) | `frontend/src/verticals/music/config.js` | `fba56f4` |
| `officiant/config.js` | Officiants config | `frontend/src/verticals/officiant/config.js` | `fba56f4` |
| `planning/config.js` | Planners config (full or day-of) | `frontend/src/verticals/planning/config.js` | `fba56f4` |
| `private-chef/config.js` | Private chefs config (per guest) | `frontend/src/verticals/private-chef/config.js` | `fba56f4` |
| `rentals/config.js` | Rentals config (per item or day) | `frontend/src/verticals/rentals/config.js` | `fba56f4` |
| `staffing/config.js` | Event staff config (hourly per staff member) | `frontend/src/verticals/staffing/config.js` | `fba56f4` |
| `transportation/config.js` | Transportation config (hourly, seat count) | `frontend/src/verticals/transportation/config.js` | `fba56f4` |
| `venue/config.js` | Venues config (per day or hour, capacity) | `frontend/src/verticals/venue/config.js` | `fba56f4` |
| `wellness/config.js` | Wellness config (massage, yoga, training at home) | `frontend/src/verticals/wellness/config.js` | `fba56f4` |

##### `mobile/src/app/`, `components/`, `shims/` · 8 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `mobile/src/app/events.tsx` | expo-router route `/events` → `screens/events/EventsList` | `mobile/src/app/events.tsx` | `fba56f4` |
| `mobile/src/app/events/[id].tsx` | Route `/events/[id]` → `screens/events/EventDetail` | `mobile/src/app/events/[id].tsx` | `fba56f4` |
| `mobile/src/app/events/new.tsx` | Route `/events/new` → `screens/events/NewEvent` | `mobile/src/app/events/new.tsx` | `fba56f4` |
| `mobile/src/app/occasions/[slug].tsx` | Route `/occasions/[slug]` → `screens/catalog/OccasionScreen` | `mobile/src/app/occasions/[slug].tsx` | `fba56f4` |
| `mobile/src/app/plan.tsx` | Route `/plan` → `screens/planner/Planner` | `mobile/src/app/plan.tsx` | `fba56f4` |
| `mobile/src/app/services/[vertical].tsx` | Route `/services/[vertical]` → `screens/catalog/VerticalScreen` | `mobile/src/app/services/[vertical].tsx` | `fba56f4` |
| `mobile/src/components/share/SharePlanButton.tsx` | Native "share a saved plan as an event card" | `mobile/src/components/share/SharePlanButton.tsx` | `fba56f4` |
| `mobile/src/shims/planner-dev-mock.ts` | Native stand-in for the web planner dev mock | `mobile/src/shims/planner-dev-mock.ts` | `fba56f4` |

##### `mobile/src/screens/` · 25 files

| file | what it was | original location | archived in |
|---|---|---|---|
| `catalog/Hero.tsx` | Tinted hero for vertical and occasion pages | `mobile/src/screens/catalog/Hero.tsx` | `fba56f4` |
| `catalog/OccasionScreen.tsx` | Native `/occasions/[slug]` | `mobile/src/screens/catalog/OccasionScreen.tsx` | `fba56f4` |
| `catalog/VerticalScreen.tsx` | Native `/services/[vertical]` | `mobile/src/screens/catalog/VerticalScreen.tsx` | `fba56f4` |
| `discover/VerticalPicker.tsx` | Native Discover vertical picker (all 18 verticals) | `mobile/src/screens/discover/VerticalPicker.tsx` | `fba56f4` |
| `events/AddToEvent.tsx` | "Add to event" sheet (add a vendor to an event board) | `mobile/src/screens/events/AddToEvent.tsx` | `fba56f4` |
| `events/EventDetail.tsx` | Native event workspace `/events/[id]` | `mobile/src/screens/events/EventDetail.tsx` | `fba56f4` |
| `events/EventsList.tsx` | Native `/events` list | `mobile/src/screens/events/EventsList.tsx` | `fba56f4` |
| `events/NewEvent.tsx` | Native `/events/new` form | `mobile/src/screens/events/NewEvent.tsx` | `fba56f4` |
| `events/parts.tsx` | Shared event pieces (avatars, rows, invite sheet, shelf) | `mobile/src/screens/events/parts.tsx` | `fba56f4` |
| `home/CatalogRails.tsx` | Home vertical and occasion rails | `mobile/src/screens/home/CatalogRails.tsx` | `fba56f4` |
| `home/PlannerEntry.tsx` | Home entry card to the planner | `mobile/src/screens/home/PlannerEntry.tsx` | `fba56f4` |
| `planner/Planner.tsx` | Native AI planner chat screen | `mobile/src/screens/planner/Planner.tsx` | `fba56f4` |
| `planner/AiMark.tsx` | Planner accent mark | `mobile/src/screens/planner/AiMark.tsx` | `fba56f4` |
| `planner/BriefChips.tsx` | Native brief chips plus editors | `mobile/src/screens/planner/BriefChips.tsx` | `fba56f4` |
| `planner/BudgetBreakdown.tsx` | Native budget bar and rows | `mobile/src/screens/planner/BudgetBreakdown.tsx` | `fba56f4` |
| `planner/Composer.tsx` | Native planner prompt box | `mobile/src/screens/planner/Composer.tsx` | `fba56f4` |
| `planner/EmptyVertical.tsx` | Native "no vendors near you yet" state | `mobile/src/screens/planner/EmptyVertical.tsx` | `fba56f4` |
| `planner/MyEvents.tsx` | Native saved plans | `mobile/src/screens/planner/MyEvents.tsx` | `fba56f4` |
| `planner/PlanError.tsx` | Native planner error state | `mobile/src/screens/planner/PlanError.tsx` | `fba56f4` |
| `planner/PlanningState.tsx` | Native "thinking" state | `mobile/src/screens/planner/PlanningState.tsx` | `fba56f4` |
| `planner/Recommendations.tsx` | Native ranked options per category | `mobile/src/screens/planner/Recommendations.tsx` | `fba56f4` |
| `planner/brief.ts` | Typed brief helpers plus icons for the app | `mobile/src/screens/planner/brief.ts` | `fba56f4` |
| `provider/VerticalGrid.tsx` | "What do you offer?" grid of every vertical | `mobile/src/screens/provider/VerticalGrid.tsx` | `fba56f4` |
| `provider/upload/Credits.tsx` | Native post-credits picker | `mobile/src/screens/provider/upload/Credits.tsx` | `fba56f4` |
| `provider/upload/ListingPicker.tsx` | "Posting to" listing picker (vendors with several listings) | `mobile/src/screens/provider/upload/ListingPicker.tsx` | `fba56f4` |

##### `scripts/` · 12 files

The `e2e/` files that were copied, not moved, are a snapshot of the pre-pivot multi-vendor e2e suite. The live suite in `frontend/scripts/e2e/` was trimmed to photography-only in the same commit.

| file | what it was | original location | archived in |
|---|---|---|---|
| `seed-vendor-photos.mjs` | Seeds demo portfolio posts for the test vendors of every vertical | `frontend/scripts/seed-vendor-photos.mjs` | `fba56f4` |
| `vendor-photos.json` | 77 CC-licensed demo posts (photo ids from `services/ml/eval/manifest.csv`) | `frontend/scripts/vendor-photos.json` | `fba56f4` |
| `e2e/README.md` | Pre-pivot e2e README (roles, sections) | `frontend/scripts/e2e/README.md` **(copy)** | `80615b2` |
| `e2e/context.mjs` | Shared e2e state (users, modules, cleanup, dates, fixtures) | `frontend/scripts/e2e/lib/context.mjs` **(copy)** | `80615b2` |
| `e2e/sections/anon.mjs` | Signed-out browsing section (multi-vertical) | `frontend/scripts/e2e/sections/anon.mjs` **(copy)** | `80615b2` |
| `e2e/sections/bookings.mjs` | Bookings section with every price type and capacity | `frontend/scripts/e2e/sections/bookings.mjs` **(copy)** | `80615b2` |
| `e2e/sections/events.mjs` | Events-with-friends section | `frontend/scripts/e2e/sections/events.mjs` | `fba56f4` |
| `e2e/sections/messaging.mjs` | Messaging and sharing-cards section (including event cards) | `frontend/scripts/e2e/sections/messaging.mjs` **(copy)** | `80615b2` |
| `e2e/sections/planner.mjs` | AI planner (`POST /plan`) section | `frontend/scripts/e2e/sections/planner.mjs` | `fba56f4` |
| `e2e/sections/posting.mjs` | Posting section (caterer post, occasion plus credits, second listing) | `frontend/scripts/e2e/sections/posting.mjs` **(copy)** | `80615b2` |
| `e2e/sections/preflight.mjs` | Fixture preflight (role listings, caterer…) | `frontend/scripts/e2e/sections/preflight.mjs` **(copy)** | `80615b2` |
| `e2e/sections/rls.mjs` | RLS section (including event fixtures) | `frontend/scripts/e2e/sections/rls.mjs` **(copy)** | `80615b2` |

##### `services/ml-planner/` · 22 files

The AI event planner that used to live in `services/ml/`. It has its own README with restore steps.

| file | what it was | original location | archived in |
|---|---|---|---|
| `README.md` | Archive note, a "here ← came from" table, restore steps, and the original planner README section | new file (embeds the `services/ml/README.md` section) | `80615b2` |
| `.env.example` | ML service env example including the `PLANNER_*` / Anthropic settings | `services/ml/.env.example` **(copy)** | `80615b2` |
| `requirements.txt` | ML requirements including `anthropic` | `services/ml/requirements.txt` **(copy)** | `80615b2` |
| `app/main.py` | ML API as it was, with `/plan`, `/plan/health` and CORS | `services/ml/app/main.py` **(copy)** | `80615b2` |
| `app/config.py` | ML settings as they were, with `PLANNER_*` | `services/ml/app/config.py` **(copy)** | `80615b2` |
| `app/planner/__init__.py` | Planner package doc (text → brief → budget → vendors) | `services/ml/app/planner/__init__.py` | `fba56f4` |
| `app/planner/auth.py` | Verifies the Supabase token on `/plan` | `services/ml/app/planner/auth.py` | `fba56f4` |
| `app/planner/brief.py` | Brief clean-up shared by both engines | `services/ml/app/planner/brief.py` | `fba56f4` |
| `app/planner/budget.py` | Budget split weights per event type | `services/ml/app/planner/budget.py` | `fba56f4` |
| `app/planner/claude.py` | Claude engine (structured brief extraction) | `services/ml/app/planner/claude.py` | `fba56f4` |
| `app/planner/geocode.py` | Place → lat/lng (LA table, then OpenStreetMap) | `services/ml/app/planner/geocode.py` | `fba56f4` |
| `app/planner/rules.py` | Offline rules parser (dates, budgets, guests, places) | `services/ml/app/planner/rules.py` | `fba56f4` |
| `app/planner/schema.py` | `POST /plan` request and response models | `services/ml/app/planner/schema.py` | `fba56f4` |
| `app/planner/search.py` | Compatibility shim to `finders/` | `services/ml/app/planner/search.py` | `fba56f4` |
| `app/planner/service.py` | `/plan` orchestration (understand → split → find) | `services/ml/app/planner/service.py` | `fba56f4` |
| `app/planner/vocab.py` | Event types, vendor categories, style words | `services/ml/app/planner/vocab.py` | `fba56f4` |
| `app/planner/finders/__init__.py` | Finder registry (one per vertical, generic by default) | `services/ml/app/planner/finders/__init__.py` | `fba56f4` |
| `app/planner/finders/base.py` | Shared vendor search and scoring plus Supabase reads | `services/ml/app/planner/finders/base.py` | `fba56f4` |
| `app/planner/finders/generic.py` | Generic finder for any vertical (per price type) | `services/ml/app/planner/finders/generic.py` | `fba56f4` |
| `app/planner/finders/photography.py` | Photography finder (picks a fitting package) | `services/ml/app/planner/finders/photography.py` | `fba56f4` |
| `tests/test_finders.py` | Vertical-aware planner tests (reads `catalog.js`) | `services/ml/tests/test_finders.py` | `fba56f4` |
| `tests/test_planner.py` | Rules engine, budget and Claude request-shape tests | `services/ml/tests/test_planner.py` | `fba56f4` |

##### `supabase/` · 12 files

The four migrations are **reference copies**. The originals stay in `supabase/migrations/`, because migration history must not change. `20261018000000_photography_only.sql` dropped what those migrations created.

| file | what it was | original location | archived in |
|---|---|---|---|
| `seed_all_verticals.sql` | Seed with all 18 verticals, 87 services and every JSON Schema | `supabase/seed.sql` **(copy)** | `80615b2` |
| `migrations/20261010000000_all_verticals.sql` | Pricing units, booking quantities, package minimums, vendor capacity | `supabase/migrations/20261010000000_all_verticals.sql` **(copy)** | `80615b2` |
| `migrations/20261011000100_event_groups.sql` | Events with friends: event chats, invites, candidate board, votes | `supabase/migrations/20261011000100_event_groups.sql` **(copy)** | `80615b2` |
| `migrations/20261011000200_post_credits.sql` | `album_credits` plus occasion tags | `supabase/migrations/20261011000200_post_credits.sql` **(copy)** | `80615b2` |
| `migrations/20261013000000_discover_all_verticals.sql` | `discover_vendors()` vendor-level Discover feed | `supabase/migrations/20261013000000_discover_all_verticals.sql` **(copy)** | `80615b2` |
| `demo/all_verticals_setup.sql` | Paste-ready setup for all verticals (includes the seed) | `supabase/demo/all_verticals_setup.sql` | `fba56f4` |
| `demo/sharing_events_credits_setup.sql` | Paste-ready setup for sharing, events and credits | `supabase/demo/sharing_events_credits_setup.sql` | `fba56f4` |
| `demo/demo_data_all_verticals.sql` | Demo data for photographers plus the vendors of every vertical | `supabase/demo/demo_data.sql` **(copy)** | `80615b2` |
| `demo/remove_demo_data_all_verticals.sql` | Undo script for that demo data | `supabase/demo/remove_demo_data.sql` **(copy)** | `80615b2` |
| `tests/verticals_test.sql` | SQL test: categories, attribute validation, price types, capacity | `supabase/tests/verticals_test.sql` | `fba56f4` |
| `tests/event_groups_test.sql` | SQL test: event chats, invites, board, votes | `supabase/tests/event_groups_test.sql` | `fba56f4` |
| `tests/discover_vendors_test.sql` | SQL test for `discover_vendors()` | `supabase/tests/discover_vendors_test.sql` | `fba56f4` |

**Count check:** 1 + 5 + 11 + 23 + 21 + 8 + 25 + 12 + 22 + 12 = **140** archived files, which matches the 140 `archive/event-platform/` paths in `codemap.json`.
