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
