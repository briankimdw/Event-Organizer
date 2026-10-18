# Accountable

A self-accountability phone app (iOS + Android) built with Expo / React Native + TypeScript.
Set daily goals, check them off, and watch your streaks.

## Run it on your phone
```bash
npm install
npx expo start      # scan the QR code with the Expo Go app
```

## Scripts
- `npm run typecheck` — TypeScript check
- `npm test` — streak logic tests
- `npx expo-doctor` — project health check

## Structure
- `app/` — screens (expo-router, file-based): `(tabs)/index` Today, `(tabs)/progress`, `new-goal` modal
- `src/state/store.tsx` — goals + check-ins, persisted on-device with AsyncStorage
- `src/lib/` — pure logic (dates, streaks) with tests
- `src/ui/theme.ts` — light/dark colors

## Roadmap ideas
Daily reminder notifications, accountability partner (shared check-ins), cloud sync/login (Supabase), penalties/stakes for missed days, weekly review, home-screen widget.

## Moving to its own repo
This folder is self-contained. From the parent repo:
`git subtree split -P accountability-app -b accountable-only`, then push that branch to a new repo.
