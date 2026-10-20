# Mobile app (Expo)

**photomatch** for iOS and Android: a marketplace for photographers and videographers (one
vertical, `photography`, shown as "Photo & video"). React Native + **Expo SDK 57** (RN 0.86,
React 19.2), **expo-router** (file-based routes that mirror the web routes), TypeScript.
It reuses the web app's plain-JS data layer (`frontend/src/api`, `lib`, `verticals`) directly,
with no copies. See [Shared code](#shared-code-the-bridge).

## Photography pivot (2026-10-18)

The app used to be a multi-vendor event marketplace ("Event Organizer"). It's photography only
now; photographers and videographers are treated the same. The removed screens are kept, not
built, in `archive/event-platform/mobile/` (same relative paths; git tag `multi-vendor-snapshot`
has the full previous state):

- Events with friends (`/events`, `/events/[id]`, `/events/new`, the "Add to event" buttons,
  "Your events" on Home / Me, the event board button in chats). Old event chats come back from
  the shared `api/messages.js` as group chats; an old shared event shows as a small stub card.
- The AI planner (`/plan`, `screens/planner/**`, `SharePlanButton`, the Home planner card, the
  `EXPO_PUBLIC_PLANNER_URL` env and the `planner-dev-mock` shim/redirect).
- Occasion and service pages (`/occasions/[slug]`, `/services/[vertical]`, `screens/catalog/**`,
  Home's vertical / occasion rails), the Discover vertical picker, the New listing vertical grid.
- Post credits between vendors (the Upload / Edit post picker, credit chips in the gallery,
  "Tagged in" on profiles) and the post occasion picker. Old posts still show their occasion tag.
- `?event=` on `/book/[providerId]`; one listing per person (no listing switcher / picker).

Brand: the visible name is **photomatch** (`app.json` `name`, the sign-in wordmark, share
texts; `BRAND` in `src/lib/photo.ts`). The `slug` (`event-organizer`) and URL **scheme
`eventorganizer`** are unchanged on purpose, so existing deep links and the Supabase redirect
URLs (`eventorganizer://**`) keep working.

Until the database cleanup runs, the live data still has non-photo listings. The shared queries
keep only photo & video listings (`isPhotoVertical`, which also counts old `videography` rows);
the app filters its own listings / covers the same way (`isPhotoListing` in `src/lib/photo.ts`).

Everything here works in **Expo Go** (no native build needed). Keep it that way: only add
libraries that Expo Go bundles, and always install them with `npx expo install <pkg>`.

## Run it

```bash
cd mobile
npm install
cp .env.example .env        # then fill it in (see below)
npx expo start              # scan the QR code with Expo Go
```

- **Phone (Expo Go)**: install *Expo Go* from the App Store / Play Store, put the phone on the
  **same Wi-Fi** as the computer, scan the QR code (iPhone: Camera app; Android: Expo Go).
  On a different network or behind a strict router: `npx expo start --tunnel`.
- **Android emulator**: start one from Android Studio, then press `a` in the Expo terminal.
- **iOS**: on Windows there's no iOS simulator; use a real iPhone with Expo Go.
- **Web** (quick look in a browser, also used for screenshots): `npx expo start --web --port 8090`.
  Not a product target: some things (maps, image picking) behave differently.
- After changing `babel.config.js`, `metro.config.js` or `.env`, restart with `npx expo start --clear`.

`.env` (git-ignored; template `.env.example`):

| Variable | What |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Same project as `frontend/.env.local` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key only (safe in a client; RLS protects data). Never a service-role key. |

Checks (run before you hand work back):

```bash
npm run typecheck                                    # tsc --noEmit
npx expo export --platform android --output-dir dist-check   # proves Metro resolves everything
rm -rf dist-check
npx expo-doctor
```

## Folder layout

```
mobile/
  index.ts              entry: loads src/shims/install first, then expo-router
  metro.config.js       the shared-code bridge (watchFolders, resolver, redirects)
  babel.config.js       babel-preset-expo + babel/shared-env-plugin.js
  babel/                the import.meta.env rewrite for shared files
  src/
    app/                ROUTES ONLY. Thin files: `export { default } from '@/screens/...'`
      _layout.tsx         providers (gesture, nav theme, Auth, Store) + root Stack + Toast
      (tabs)/             the 5 tabs: index (Home), discover, bookings, inbox, me
      u/[id].tsx  search.tsx  book/[providerId].tsx  bookings/[id]/...  inbox/[id].tsx ...
    screens/            one file (or folder) per web screen; screen-only parts live next to it
      home/  discover/  profile/  gallery/  bookings/  inbox/  provider/  account/
      Search.tsx  SignIn.tsx  Me.tsx
    components/         app-wide UI primitives (import from '@/components')
    hooks/              React hooks (useQuery = typed wrapper of the shared one)
    state/              auth.tsx (session + profile), store.tsx (follows, shortlist, toast...)
    lib/                supabase.ts (the one client), a11y.ts, photo.ts (BRAND, isPhotoListing)
    shims/              browser APIs for shared code + native stand-ins for web-only modules
    theme.ts            design tokens (colors light/dark, radius, space, font) + makeStyles;
                        AppThemeProvider / useThemePreference: Light (default) / Dark / System,
                        chosen in Settings, saved in AsyncStorage `pm:theme` (not the phone's setting)
    types.ts            types inferred from the shared JS (Provider, Package, Vertical)
```

Imports: `@/...` = `mobile/src/...`, `@shared/...` = `frontend/src/...`.

Keyboard: wrap a screen's body (list + input/footer) in `<KeyboardView bottomInset={insets.bottom}>`
from `@/components`. It pads itself by exactly the part the keyboard covers, so it works on iOS and
on Android edge-to-edge (where `KeyboardAvoidingView` with `behavior={undefined}` often does nothing)
without react-native-keyboard-controller, which Expo Go doesn't include.

Store (`useStore()`), same as the web's: `myProvider` (your photo & video listing), `myProviders`
(normally just that one; old data may have two), `selectProvider(id)`, `refreshProvider(selectId?)`.

## Conventions for porting a web screen

1. Find the web screen in `frontend/src/screens/X.jsx` and its route in `frontend/src/App.jsx`.
2. Create `src/screens/X.tsx` (or `src/screens/x/` with `X.tsx` + its parts) and add the
   route file under `src/app/` as `export { default } from '@/screens/X'`.
3. **Data**: call the same shared functions the web screen calls, from `@shared/api/*.js`, through
   `useQuery` from `@/hooks/useQuery` (same behavior as the web hook, typed). No mock data, no
   copied queries. Shaping helpers in `@shared/api/home.js` (buildHomeFeed, serviceCounts,
   buildExploreTiles...) and `@shared/verticals/index.js` (SERVICE_CHIPS, priceSuffix,
   attributeLines, verticalConfig...) are shared too: use them instead of re-deriving.
4. **Navigation**: `react-router` -> `expo-router`.
   `<Link to="/u/1">` / `navigate('/u/1')` -> `router.push('/u/1')` or `router.push({ pathname: '/u/[id]', params: { id } })`;
   `navigate(-1)` -> `router.back()`; `useParams` / `useSearchParams` -> `useLocalSearchParams()`;
   `setParams` -> `router.setParams()`. Requiring sign-in:
   `router.push({ pathname: '/sign-in', params: { next: pathname } })` (see Profile's `contact`).
5. **UI**: no web CSS, no `className`. Use the primitives (`Screen`, `Text`, `Button`, `Chip`,
   `Card`, `Sheet`, `Avatar`, `Photo`, `ProviderCard`, `PriceLabel`, `VerticalIcon`, `Loading` /
   `EmptyState` / `ErrorState` / `SignInPrompt`...) and style the rest with `makeStyles`:
   ```tsx
   const useStyles = makeStyles((t) => ({ box: { padding: t.space.lg, backgroundColor: t.c.soft, borderRadius: t.radius.lg } }))
   ```
   Colors only from `t.c` (light/dark aware); the token names match the web's CSS variables
   (`--ink` -> `c.ink`, `--muted` -> `c.muted`, `--accent` -> `c.accent`...). Icons: `lucide-react-native`
   (same names as the web's `lucide-react`; pass `color`, there's no `currentColor`).
   `<img>` -> `<Photo>` (expo-image). `<input>` -> `<TextField>`. Web `Sheet` -> `Sheet` (Modal).
6. **State**: `useAuth()` / `useStore()` from `@/state/*` have the same shape as the web's.
   `useStore().toast('...')` shows a toast.
7. Put a `TODO(port): ...` line at the top of a screen for anything you skipped.
8. Don't edit `frontend/**`. If shared code needs a fix for native, add a shim/redirect here and
   list it under *Portability issues* so it can be fixed at the source later.

TypeScript note: the shared JS is type-inferred (`allowJs`). JS default params such as
`dates = []` infer as `never[]`; cast the argument (`searchProviders({ dates } as any)`).
`slug = null` infers as `null`: call `verticalMeta()` / `verticalConfig()` with no argument
(there is one vertical) instead of passing a slug.
Typed routes (`.expo/types/router.d.ts`) regenerate when `npx expo start` runs; after adding a
route, start the dev server once before `npm run typecheck`.

## Shared code (the bridge)

`metro.config.js`:

- `watchFolders` includes `../frontend/src`, so Metro can bundle those files.
- **Bare imports from shared files resolve from `mobile/node_modules`**: the custom
  `resolveRequest` re-resolves any package import whose origin is in `frontend/src` as if it came
  from `mobile/index.ts`. So `react`, `@supabase/supabase-js`... are this app's copies (one React,
  one Supabase client). `frontend/node_modules` is also on the `blockList`.
  Verified on the iOS export: a single `react`, a single `@supabase/supabase-js`, nothing from
  `frontend/node_modules`.
- **Redirects** (any import that resolves to the left file gets the right file instead):

  | Web file | Native file | Why |
  | --- | --- | --- |
  | `frontend/src/lib/supabase.js` | `src/lib/supabase.ts` | `import.meta.env`, browser session storage. Native client: AsyncStorage, `autoRefreshToken` + AppState start/stop, `persistSession`, `detectSessionInUrl: false` |
  | `frontend/src/lib/images.js` | `src/shims/images.ts` | canvas / `createImageBitmap` / `exifr`. Same exports via expo-image-manipulator, plus native upload helpers (`fileBlob`, `makeDisplayFile`, `toCompatible`) |

- `@shared/*` alias -> `frontend/src/*` (Metro resolver + `tsconfig.json` `paths`).
- New files and functions in `frontend/src/api/*` need nothing: import them and go. If a new shared
  file uses a browser-only API, add a shim or a redirect and a row below.

`babel/shared-env-plugin.js` rewrites `import.meta.env.X` (only in files under `frontend/src`) to
`globalThis.__SHARED_ENV__.X`, which `src/shims/env.ts` fills from the `EXPO_PUBLIC_*` values:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `DEV: false` (keeps web dev tools off),
`PROD`, `MODE`.

`src/shims/install.ts` runs before anything else (from `index.ts`) and only fills gaps, so the
web target keeps the real browser APIs.

## Portability issues (to fix at the source eventually)

| Shared file | Web-only thing | Workaround here | Fix at source |
| --- | --- | --- | --- |
| `lib/supabase.js` | `import.meta.env`, URL session detection | redirect to `src/lib/supabase.ts` | inject the client (or keep the redirect) |
| `api/portfolio.js` | `import.meta.env` (storage URL/key) | Babel env rewrite | build the URL from the client |
| `api/portfolio.js` | `File`/`Blob` uploads through XHR, `file.name`/`file.size`, `crypto.randomUUID` | pass `fileBlob(uri, name, type)` results (Blob + name; `screens/provider/upload/uploadQueue.ts`); `crypto.randomUUID` shim (expo-crypto) | accept `{ uri, name, type, size }` |
| `api/locations.js` | `localStorage` (last location), `navigator.geolocation`, `DOMException` | global `localStorage` shim (in-memory, hydrated from / written to AsyncStorage, `ls:` prefix); `navigator.geolocation.getCurrentPosition` shim on expo-location (permission prompt, `code 1` = denied); `DOMException` shim | location provider param |
| `api/discover.js` | `localStorage` (the deck's service chip, `read/writeDeckChoice`) | the same `localStorage` shim | storage adapter param |
| `lib/images.js` | `exifr`, `createImageBitmap`, `<canvas>`, `URL.createObjectURL` | redirect to `src/shims/images.ts` (expo-image-manipulator; EXIF from the picker's `exif: true`). **Untested on device** | split pure helpers from the browser pipeline |
| `lib/format.js` | `avatarUrl()` returns an SVG `data:` URL for people without a photo | `Avatar` draws the same initials + color natively | return `{ initials, hue }` too |
| `auth.jsx`, `store.jsx` | React context files with web imports | ported to `src/state/*` with the same value shape | n/a (UI layer) |
| `api/messages.js`, `api/portfolio.js`... | JS default params infer as `null` / `never[]` in TS (`sendMessage(id, { text })`, `getMyProvider(uid, pick)`) | `as any` at the call | JSDoc types |
| `api/portfolio.js` `getMyProvider()` | MyWork / AiReview on the web use the oldest listing, not the selected one | native passes the selected listing id / checks all listings | pass the selected id on the web too |
| `components/upload/PostFields.jsx` | `<input type="date">` | a `YYYY-MM-DD` text field with validation (EXIF date pre-filled) | n/a (UI) |
| `shims/images.ts` `readCameraSettings` | no `taken_on` (the web reads it from EXIF) | `screens/provider/upload/usePhotoItems.ts` adds it from `DateTimeOriginal` | add it in the shim |

Web-only screens features to re-think natively: Leaflet maps (use `react-native-maps`), the DOM
swipe deck (use gesture-handler + reanimated), `navigator.share` (RN `Share`), Google OAuth.

## Auth notes

- Email + password, sign-up, magic link **code** entry and password reset work in Expo Go
  (`src/screens/SignIn.tsx`) with no dashboard changes.
- Email **links** (magic link, sign-up confirmation, password reset) open the app at `/auth/callback`
  or `/reset-password`, which finish the sign-in from the URL (`src/screens/account/authLink.ts`
  handles `?code=` (PKCE: exchangeCodeForSession), `#access_token=&refresh_token=` (implicit:
  setSession), `?token_hash=&type=` (verifyOtp) and `error_description`). For Supabase to send
  people back to the app, add these in **Supabase dashboard > Authentication > URL Configuration
  > Redirect URLs** (nothing has been changed there):
  - `eventorganizer://**` (development / store builds; the app sends `eventorganizer://auth/callback?next=...`
    and `eventorganizer://reset-password`, and the `?next=` query needs the `**` glob to match)
  - `exp://**` (Expo Go; the dev URL is `exp://<LAN-ip>:8081/--/auth/callback`, and the IP changes per
    network. Wildcards are supported; remove this one before production)
  - for the web target only: `http://localhost:8081/**` (or whatever port you run on)
  The Site URL stays the web app's. Links only work on the device that has the app; the 6-digit
  code from the same email always works.
- New accounts (no display name) are sent to `/welcome?next=...` by `src/state/WelcomeGate.tsx`
  (mounted in the root layout), like the web App does, except on the auth routes.
- **Google sign-in:** Supabase's Google page in an in-app browser (`expo-web-browser` auth session +
  `signInWithOAuth`), finished by `authLink.ts`. Works in Expo Go once `exp://**` (and `eventorganizer://**`
  for builds) are allowed Redirect URLs in Supabase. Google's native account picker would need a dev build.
- Deep link scheme: `eventorganizer://` (app.json; kept from the old name so existing links keep
  working). App name: "photomatch".

## Web screens -> native status

| Web route | Web screen | Native | Owner (proposed) |
| --- | --- | --- | --- |
| `/` | Home.jsx | **Ported** (search, photo + video service chips, bookings tiles via `bookings/NeedsAction`, shelves from `buildHomeFeed`, Explore teaser, "Shoot photo or video?" card + invite via RN `Share`) | A |
| `/search` | Search.jsx | **Ported** (list + map via `react-native-maps` with "Search this area", service chips, date picker, distance filter/sort; TODO: pin clustering) | A |
| `/u/:id` | Profile.jsx | **Ported** (availability strip, your dates, avatar viewer, followers sheet, review detail, map preview; TODO: report/block menu) | A |
| `/sign-in` | SignIn.jsx | **Ported** (Google via browser session) | C |
| `/me` | Me.jsx (+ Dashboard.jsx) | **Ported**: hero + edit, Hiring/Business switch, client view, checklist, stat tiles, Dashboard tabs (requests, calendar + blackouts, service area, packages (fixed / hourly / quote; photo + video fields), portfolio). `?tab=` opens a tab | C |
| `/discover` | Discover.jsx (+ components/discover) | **Ported** (swipe deck on gesture-handler + reanimated, service chips, sheets, match moment, vendor cards for photographers without posts; Explore masonry with service filters) | A |
| `/gallery/:personId`, `/post/:id` | Gallery.jsx | **Ported** (paged albums/photos, pinch-peek zoom, hold to hide UI; TODO: persistent zoom, before/after, owner edit, report, collections) | A |
| `/book/:providerId` | BookingRequest.jsx | **Ported** | B |
| `/bookings` | Bookings.jsx | **Ported** | B |
| `/bookings/:id` | BookingDetail.jsx | **Ported** | B |
| `/bookings/:id/delivery` | Delivery.jsx | **Ported** | B |
| `/bookings/:id/review` | Review.jsx | **Ported** | B |
| `/inbox` | Inbox.jsx | **Ported** (live via `subscribeToInbox`, unread dots, tab badge) | C |
| `/inbox/new` | NewMessage.jsx (+ PeoplePicker) | **Ported** | C |
| `/inbox/:id` | Chat.jsx | **Ported** (realtime, optimistic send/retry, day separators, receipts, typing, ChatInfo, report/block on long-press) | C |
| `/upload` | Upload.jsx (+ components/upload) | **Ported** (photos and video stills: expo-image-picker multi-select, arrows to reorder; date is a YYYY-MM-DD field). **Upload untested on device** | C |
| `/my-work` | MyWork.jsx | **Ported** (grid, reorder, `?post=` owner view + edit/delete; TODO: reuse the Gallery viewer) | C |
| `/new-listing` | NewListing.jsx | **Ported** (straight to the photo & video listing setup) | C |
| `/verify` | Verify.jsx | **Ported** | C |
| `/settings` | Settings.jsx | **Ported** | C |
| `/ai-review/:id` | AiReview.jsx | **Ported** | C |
| `/welcome` | Welcome.jsx | **Ported**; root layout redirects there when `needsWelcome` (`state/WelcomeGate.tsx`) | C |
| `/reset-password` | ResetPassword.jsx | **Ported** (also finishes the reset link's sign-in) | C |
| `/auth/callback` | AuthCallback.jsx | **Ported** (`screens/account/authLink.ts`) | C |

Archived (not routes any more; see [Photography pivot](#photography-pivot-2026-10-18)): `/plan`,
`/events`, `/events/:id`, `/events/new`, `/services/:vertical`, `/occasions/:slug`. Old links to
them land on the not-found screen.
