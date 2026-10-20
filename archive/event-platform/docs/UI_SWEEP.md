# UI sweep: overflow, clipping, overlap and wrapping

> **Note (2026-10-18):** this is a record of a run before the photography-only pivot. Checks for the archived features (other verticals, events with friends, the AI planner, occasions, post credits) no longer apply; see `archive/event-platform/README.md`. Moved here from `docs/` on 2026-10-20; file paths below are as they were in the repo at the time (git tag `multi-vendor-snapshot`).

Run: 2026-10-11 (ui-sweep). This is the last layout check before release. It looks for anything that runs off the page, gets clipped, overlaps something else, or wraps badly, on every route and every sheet, menu and dialog. It builds on the earlier audits in [`QA_CHECKLIST.md`](QA_CHECKLIST.md) (then `docs/QA_CHECKLIST.md`) and `mobile/QA_CHECKLIST.md`.

## How it was tested

- **Drivers:** headless Chrome driven over CDP.
  - Web: the Vite dev server.
  - Mobile: the Expo **web** target (`npx expo start --web`).
- **Data:**
  - Signed out: real data.
  - Signed in: a **fake** session from the QA fixtures (client, vendor, new account, unnamed account). Every write was answered locally and never sent.
- **"+long" (stress) runs:** every API response was rewritten before the app saw it. Names, titles and cities got a ~60-character suffix, usernames got an unbroken 30-character handle, bios, notes and messages got a paragraph with an unbroken URL, and every price became a 6-digit amount ($123,456).
- **States:** every route in `frontend/src/App.jsx` and `mobile/src/app/**`, plus every control on each screen.
  - Each button, tab and link-button was clicked automatically.
  - Any `role=dialog` that opened (sheets, menus, pickers, the avatar viewer) was checked as its own state. Inline expansions that changed the page text were checked too.
  - A few flows were scripted, such as the cancel and counter sheets.
- **Widths:** 320, 360, 375, 390 and 414 on both platforms. The web was also checked at 768, which shows the centred phone frame.
- **Viewport heights:**

  | Width | Height |
  |---|---|
  | 320 | 568 |
  | 360 | 740 |
  | 375 | 667 |
  | 390 | 844 |
  | 414 | 896 |
  | 768 | 1024 |

- **Mobile extras:**
  - Dark mode, with `pm:theme=dark` set in storage.
  - Text at 1.5x: every text node scaled to 1.5x. This is the worst case, because it ignores the per-component `maxFontSizeMultiplier` caps.
- **Automated checks, on every state and every width:**
  - The document scrolls sideways.
  - An element sits outside the phone frame (after clipping by its scroll and overflow ancestors).
  - A non-scrolling box clips content that is wider than it is.
  - A child spills out of its parent.
  - Text runs out of its box without an ellipsis.
  - Two interactive elements overlap, or two text runs overlap, checked with a hit test.
  - A sheet is not fully inside the frame.
  - An image is stretched (`object-fit: fill` with the wrong aspect ratio).
  - A button, chip, pill or tab label wraps to two or more lines.
  - Content is still hidden under the tab bar, a sticky bar or the composer after scrolling to the bottom.
- **Screenshots:**
  - Every state at 320 and 390, plus a full-height "tall" capture at 320 (390 for dark mode). They were reviewed by eye in 4-up montages.
  - The scripts and screenshots are in the session scratchpad: `sw/sw-check.js`, `sw/sw-web.mjs`, `sw/sw-mob.mjs`, and `shots/sw-*.png`.

**Coverage:**

| Platform | Distinct states (routes + dialogs + inline states) | States × widths × variants checked |
|---|---|---|
| Web | 189 | 3,996 |
| Mobile | 146 | 2,857 |

The per-state matrix is at the end of this file.

**Result:** 22 layout defects found and fixed: 10 on the web, 12 on mobile. After the fixes, the final passes had no open findings. The findings that remain were reviewed and left on purpose; they are listed below.

## Fixed, web (`frontend/src`)

| # | Problem (before) | Fix |
|---|---|---|
| W1 | Booking header at 320: a long vendor name and package were squeezed into a 1–2 word column ("Golden / Spoon / Catering") next to the status pill. | `.person-row` wraps: the pill drops to its own line, right-aligned (`styles.css`). |
| W2 | "Message ‹long business name›": `.row > .btn.grow` used `nowrap` plus `min-width: max-content`, so the button ran 280–370px off-screen. | `min-width: fit-content`: one line when it fits, wraps inside a full-width button when it doesn't (`styles.css`). |
| W3 | Unbroken links and handles in notes, offers and handles ran 22–54px out of their box. A centred bio with a URL widened the profile header, and both sides were clipped. | `body { overflow-wrap: break-word }`, `p { overflow-wrap: anywhere }` (`styles.css`). |
| W4 | Chat header: a long name ran under the "Conversation details" button. | `.topbar-name > .profile-link` ellipsizes (`styles.css`). |
| W5 | Past bookings: the status pill spilled 8px out of the card next to a long package name. | `.bk-body > .row.between` gets a gap, and the title can shrink (`styles.css`). |
| W6 | Calendar and map-pin icons collapsed to dots next to long text. | `.inline-icon > svg, .row > svg { flex-shrink: 0 }` (`styles.css`). |
| W7 | Profile specialty chips and "Find more ‹service›" chips spilled 67–159px. | Chips in a wrapping `.chips` list are `max-width: 100%` and wrap inside themselves; scroll rails are unchanged (`styles.css`). |
| W8 | Bookings › "Needs your attention" at 320: the button squeezed the title to 1–2 words per line. | `.attention-card` wraps, and the button drops under the text (`styles.css`). |
| W9 | Me (vendor) at 320: the "2" requests badge sat on top of the "Photographer" label. | The badge moves to the corner of the tab, like an app badge (`styles.css`). |
| W10 | Me header at 320: "@handle · 📍 City" broke word by word ("Culver / City, / CA") and spilled 22–41px. | The handle and city wrap as whole units; the city ellipsizes if it is huge (`screens/Me.jsx`, `.me-meta` in `styles.css`). |

## Fixed, mobile (`mobile/src`)

| # | Problem (before) | Fix |
|---|---|---|
| M1 | Booking header: the name was squeezed to "(" or "M…" by the badges and the status pill, at every width up to 390. | `PersonRow` wraps, and the pill drops to its own line (`screens/bookings/parts.tsx`). |
| M2 | Price rows: a long label pushed the amount onto three lines ("$12 / 3,45 / 6"). | The amount never shrinks (`parts.tsx` `Row`). |
| M3 | Booking actions: "Message ‹name›" and "Cancel request" both wrapped to two lines. Counter sheet: the price input spilled 25px. | The actions row wraps, with buttons sized to their label. The input gets `minWidth: 0` (`screens/bookings/BookingDetail.tsx`). |
| M4 | Bookings › attention cards: the title was squeezed to three lines at 320. | The button drops under the text (`screens/bookings/Bookings.tsx`). |
| M5 | Vendor profile: "Book Golden Spoon Catering" wrapped to two lines at every width. A long city and the specialty chips ran 73–106px off-screen. | Book gets its own full-width line when it doesn't fit (`AddToEventButton` gains a `style` prop). The city text shrinks, and the chip row spans the full width (`screens/profile/Profile.tsx`, `screens/events/AddToEvent.tsx`). |
| M6 | Me header: a long @handle spilled 147–153px; with a city it was cut to "@…". | The handle ellipsizes but keeps up to 65% of the row (`screens/account/MeParts.tsx`). |
| M7 | Web preview only: unbroken words (links, handles) don't break on the web the way they do on a phone, so bubbles and bios were clipped. | The `Text` primitive adds `wordBreak: 'break-word'` on web only (`components/Text.tsx`). |
| M8 | At 1.5x text: the "Plan it" send button was pushed 34px out of the Home and Occasion planner fields. | The inputs get `minWidth: 0` and the send button doesn't shrink (`screens/home/PlannerEntry.tsx`, `screens/catalog/OccasionScreen.tsx`). The chat and planner composers get the same, as a precaution. |
| M9 | At 1.5x text: the Discover header (tabs and pills) overflowed, and the likes count spilled out of its pill. | The header wraps, and the pills go to the right on their own line (`screens/discover/DiscoverHeader.tsx`). |
| M10 | At 1.5x text: Shortlist sheet "Messa-ge" broke mid-word. | The actions row wraps (`screens/discover/DeckSheets.tsx`). |
| M11 | At 1.5x text: vendor requests "Coun-ter" broke mid-word. | The Accept / Counter / Decline row wraps (`screens/provider/Dashboard.tsx`). |
| M12 | At 1.5x text: the web map stand-in's "Travels up to…" line sat under the "Open map" pill. | Bottom padding (`components/map/MapPreview.web.tsx`; native shows a real map with no label). |

## Reviewed, left as is

These were flagged by the automated checks, then looked at in screenshots and judged to be intended:

- **Tile captions that wrap to two lines.** Home service tiles ("Decor & design") and the New listing grid ("Cakes & desserts") are icon tiles with a centred caption, not pills, and the grid keeps rows even.
  - Plan-with-AI example rows, share-sheet target captions ("Wedding crew") and the "Block @‹long handle›" menu row are also full-width rows or captions where two lines are fine.
- **Full-width buttons with two lines at 1.5x text.** "Pay deposit · coming soon" and "Open chat with ‹name›" are capped at two lines by the `Button` primitive's `numberOfLines={2}`.
  - Narrow stat tiles break words at 1.5x on a 320 phone. iOS and Android do the same.
- **Things that are cut off on purpose:**
  - Horizontal rails (shelves, occasion cards, availability strip, service rail): the next card peeks in, and they scroll.
  - Gallery and reel carousels: the off-screen slides are hidden, and the slides themselves are not cut.
  - Stacked group avatars ("RD +2") overlap by design.
  - The sign-in hero collage bleeds off the edges by design.
- **Discover › Explore "under the tab bar".** This only appears while the next page of results is loading. At the real end ("You're all caught up"), the last row clears the tab bar (checked: last item bottom 733 < tab bar top 776).
- **Measurement noise:**
  - RN-web text running 3–6px past its box: the trailing space at a line break is counted in the measured box. Nothing is visibly cut.
  - Inline "Terms of Service / Privacy Policy" links that wrap mid-sentence: inline spans on two lines have bounding boxes that overlap.

**For auth-design:** no overflow or clipping issues on any auth screen at any width (web sign-in, sign-up, email step, reset, callback, welcome; mobile sign-in, sign-up, welcome, reset, callback). One non-layout note: the wordmark says "photomatch" on the web and "Event Organizer" on mobile. Both are unchanged.

## Before / after screenshots (scratchpad `shots/`)

| Fix | Before | After |
|---|---|---|
| M1/M3 booking header and actions | `sw-mcli-bookings_b0000000_0000_4000_8000_000000000003-320tall.png` | `sw-mcliS2-bookings_b0000000_0000_4000_8000_000000000001-320tall.png`, `sw-mcliD-bookings_b0000000_0000_4000_8000_000000000003-390tall.png` |
| W1 booking header | `sw-cli-bookings_b0000000_0000_4000_8000_000000000003-320.png` | `sw-fx1-bookings_b0000000_0000_4000_8000_000000000003-320.png` |
| W2/W3 long names, links | `sw-cliS-bookings_b0000000_0000_4000_8000_000000000001-320.png` | `sw-cliS2t-bookings_b0000000_0000_4000_8000_000000000001-320tall.png` (montage `sw-M-cliS2t.png`) |
| W8/W9 attention cards, role badge | `sw-ven-me-320.png`, `sw-cli-bookings-320.png` | `sw-after-ven-me-320.png`, `sw-after-cli-bookings-320tall.png` |
| W10 Me header | `sw-cli-me-320.png` | `sw-fx3-me-320tall.png` |
| M5/M6 profile and Me with long data | `sw-mcliS-u_8159543c_6832_4049_bcf8_d1965b00824f-320.png` (montage `sw-M-mS1.png`) | `sw-mcliS2-u_ddd0f0a0_2aad_4148_a8fb_57d37d00855f-320tall.png`, `sw-mcliS2-me-320tall.png` (montage `sw-M-mS2.png`) |
| M8/M9/M10 at 1.5x text | `sw-mcliF-home-320tall.png`, `sw-mcliF-discover-320.png`, `sw-mcliF-discover_Shortlist_dialog_Your_shortlist_-320.png` (montage `sw-M-mF1.png`) | `sw-moccF-home-320.png`, `sw-mcliF2-discover-320.png` |
| 768 frame centring | n/a | `sw-fx6-bookings_b0000000_0000_4000_8000_000000000003_cancel_sheet-768.png` |

## Build checks

| Check | Result |
|---|---|
| `cd frontend && npm run build` | pass |
| `cd mobile && npx tsc --noEmit` | pass |
| `npx expo export --platform android` | pass: Android bundle, 3,973 modules. The output was deleted afterwards. |

## Matrix

**Columns:**
- **Variants:** the world (out = signed out, client, vendor, new acct, unnamed acct), plus "+long" (stress data), "@1.5x" (text) and "dark", where each was run.
- **Widths:** the widths each state was measured at.

**Result:**
- **pass:** no defect at any width.
- **fixed:** at least one defect in an earlier run, fixed by the changes above and passing in the final runs.

State names are route › the control clicked › the dialog it opened. Ids are the fixture or real ids.

### Web

| State (route › trigger / dialog) | Variants checked | Widths | Result |
|---|---|---|---|
| `/` | out, client, unnamed acct, new acct, out+long, client+long | 320 360 375 390 414 768 | fixed |
| `/ › [Add Sofia Marin to an event] dialog "Add to event"` | client, new acct | 320 360 375 390 414 768 | pass |
| `/ › [Share Sofia Marin] dialog "Share"` | out, client, new acct | 320 360 375 390 414 768 | pass |
| `/ai-review/5639c870-85a8-403a-8e44-264234be8631` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/ai-review/x` | out, out+long | 320 360 375 390 414 768 | pass |
| `/auth/callback` | out | 320 360 375 390 414 768 | pass |
| `/book/8159543c-6832-4049-bcf8-d1965b00824f` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/book/a6089673-52fc-4809-8d46-640b8836833e` | out, out+long | 320 360 375 390 414 768 | pass |
| `/book/ddd0f0a0-2aad-4148-a8fb-57d37d00855f` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/bookings` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings › [Monday, October #, # booking: declined]` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings › [Past bookings · #]` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings › [Saturday, October #, # booking: requested]` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings › [Thursday, October #, # booking: delivered]` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings › [Wednesday, October #, # booking: delivered]` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000001` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000001 › [Cancel request] dialog "Cancel request?"` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000002` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000002 › [Cancel] dialog "Cancel booking?"` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000003` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000003 › [Cancel] dialog "Cancel booking?"` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000004` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000004 › [Cancel] dialog "Cancel booking?"` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000005` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000005/delivery` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000005/review` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000006` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000006/delivery` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000007` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000007/review` | client, client+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000008` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000009` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000010` | client, client+long | 320 360 375 390 414 768 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000011` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000011 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000011 › [Offer another price] dialog "Offer a differen` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000012` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000012 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000012 › [Send a price] dialog "Offer a different price` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000013` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000013 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000014` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000014 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000015` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000015 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000016` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000016/delivery` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000017` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/discover` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/discover › [Not into this] dialog "Not into this"` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/discover › [Shortlist, #] dialog "Your shortlist"` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/discover › [Showing Photography. Change] dialog "Swipe through"` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/discover › [Your taste] dialog "Your taste"` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/discover?mode=explore` | out, out+long | 320 360 375 390 414 768 | pass |
| `/events` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001` | client, client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Invite] dialog "Invite friends to plan"` | client, client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [More] dialog "Event"` | client, client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Share event] dialog "Share"` | client, client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Status: Considering. Change] dialog "Golden Spo` | client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Status: Considering. Change] dialog "Golden Spo` | client | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Status: Shortlisted. Change] dialog "The Glassh` | client+long | 320 360 375 390 414 768 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Status: Shortlisted. Change] dialog "The Glassh` | client | 320 360 375 390 414 768 | pass |
| `/events/new` | out, client, unnamed acct, new acct, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/events/new › [Invite friends] dialog "Invite friends"` | client, new acct, client+long | 320 360 375 390 414 768 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f` | out, vendor, out+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Album details] dialog "Beach engagement Extrao` | out+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Album details] dialog "Beach engagement"` | out, vendor | 320 360 375 390 414 768 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Edit or delete this post] dialog "Your post"` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Save] dialog "Save to collection"` | out, vendor, out+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Share] dialog "Share"` | out, vendor, out+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/inbox` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000a1` | client, client+long | 320 360 375 390 414 768 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000a1 › [Wedding crew] dialog "Group"` | client | 320 360 375 390 414 768 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000b1` | client, vendor, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000b1 › [Conversation details] dialog "Details"` | client, vendor, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000d1` | client, vendor, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000d1 › [Conversation details] dialog "Details"` | client, vendor, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000e1` | client, client+long | 320 360 375 390 414 768 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000e1 › [Sam’s #th] dialog "Details"` | client | 320 360 375 390 414 768 | pass |
| `/inbox/new` | client, client+long | 320 360 375 390 414 768 | pass |
| `/me` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me › [Edit] dialog "Edit profile"` | client, vendor, new acct, client+long, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me › [Identity verified. What does this mean?] dialog "ID verified"` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me › [Photographer # new requests #]` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me › [Vendor Start taking bookings]` | client, new acct, client+long | 320 360 375 390 414 768 | fixed |
| `/me › [View Jo New’s profile photo] dialog "Jo New’s profile photo"` | new acct | 320 360 375 390 414 768 | pass |
| `/me › [View Maya Chen’s profile photo] dialog "Maya Chen’s profile photo"` | vendor | 320 360 375 390 414 768 | fixed |
| `/me › [View Sam Patel’s profile photo] dialog "Sam Patel’s profile photo"` | client | 320 360 375 390 414 768 | fixed |
| `/me?tab=calendar` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me?tab=calendar › [Photographer # new requests #]` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/me?tab=packages` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me?tab=packages › [Photographer # new requests #]` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/me?tab=portfolio` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me?tab=portfolio › [Photographer # new requests #]` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/me?tab=requests` | vendor, vendor+long | 320 360 375 390 414 768 | fixed |
| `/me?tab=requests › [Photographer # new requests #]` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/my-work` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/new-listing` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/nope` | out, out+long | 320 360 375 390 414 768 | pass |
| `/occasions/birthday` | out, out+long | 320 360 375 390 414 768 | pass |
| `/occasions/birthday › [Photography: covered]` | out | 320 360 375 390 414 768 | pass |
| `/occasions/nope` | out, out+long | 320 360 375 390 414 768 | pass |
| `/occasions/wedding` | out, out+long | 320 360 375 390 414 768 | pass |
| `/occasions/wedding › [Photography: covered]` | out | 320 360 375 390 414 768 | pass |
| `/plan` | out, client, unnamed acct, new acct, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/plan › [A wedding in Napa, June #–# #, about $#k all in, #]` | client, new acct, client+long | 320 360 375 390 414 768 | pass |
| `/plan › [My events] dialog "My events"` | client, new acct, client+long | 320 360 375 390 414 768 | pass |
| `/plan?q=Wedding%20for%20120%20guests%20in%20Pasadena%20next%20June` | client, client+long | 320 360 375 390 414 768 | pass |
| `/plan?q=Wedding%20for%20120%20guests%20in%20Pasadena%20next%20June › [New plan]` | client, client+long | 320 360 375 390 414 768 | pass |
| `/post/5639c870-85a8-403a-8e44-264234be8631` | out, out+long | 320 360 375 390 414 768 | pass |
| `/post/5639c870-85a8-403a-8e44-264234be8631 › [Album details] dialog "Golden hour portraits Extr` | out+long | 320 360 375 390 414 768 | fixed |
| `/post/5639c870-85a8-403a-8e44-264234be8631 › [Album details] dialog "Golden hour portraits"` | out | 320 360 375 390 414 768 | pass |
| `/reset-password` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search › [Any date · pick the dates you need] dialog "When do you need them?"` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search › [Filters] dialog "Filters"` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search › [Top rated] dialog "Sort by"` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search?q=wedding` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search?v=catering` | out, out+long | 320 360 375 390 414 768 | pass |
| `/search?v=photography&view=map` | out, out+long | 320 360 375 390 414 768 | pass |
| `/services/catering` | out, out+long | 320 360 375 390 414 768 | pass |
| `/services/catering › [Share Seoul Food Truck] dialog "Share"` | out | 320 360 375 390 414 768 | pass |
| `/services/nope` | out, out+long | 320 360 375 390 414 768 | pass |
| `/services/photography` | out, out+long | 320 360 375 390 414 768 | pass |
| `/services/photography › [Share Sofia Marin] dialog "Share"` | out | 320 360 375 390 414 768 | pass |
| `/services/venue` | out, out+long | 320 360 375 390 414 768 | pass |
| `/services/venue › [Share The Glasshouse DTLA] dialog "Share"` | out | 320 360 375 390 414 768 | pass |
| `/settings` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/settings › [Delete account] dialog "Delete your account"` | client, vendor, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/sign-in` | out, out+long | 320 360 375 390 414 768 | pass |
| `/sign-in › [Continue with email]` | out | 320 360 375 390 414 768 | pass |
| `/sign-in?mode=signup` | out, out+long | 320 360 375 390 414 768 | pass |
| `/sign-in?mode=signup › [Continue with email]` | out | 320 360 375 390 414 768 | pass |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [# follower] dialog "Followers · 1"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Identity verified. What does this mean?] dialog "ID ` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [More] dialog "Options"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Rated #.# from # review. Show reviews]` | out | 320 360 375 390 414 768 | pass |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Reviews]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Share] dialog "Share"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Verified Pro. What does this mean?] dialog "Verified` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [View DJ Nova’s profile photo] dialog "DJ Nova’s prof` | out | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [# followers] dialog "Followers · 4"` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Add to event] dialog "Add to event"` | client, client+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Gear]` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Identity verified. What does this mean?] dialog "ID ` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [More] dialog "Options"` | out, client, out+long, client+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Packages]` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Portfolio]` | vendor, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Rated #.# from # reviews. Show reviews]` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Reviews]` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Share] dialog "Share"` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Verified Pro. What does this mean?] dialog "Verified` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [View Maya Chen’s profile photo] dialog "Maya Chen’s ` | out, client, vendor | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [#-star review by Kai T., Sep #. Read the` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [Gear]` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [Packages]` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [Portfolio]` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [Reviews]` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/a6089673-52fc-4809-8d46-640b8836833e` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Identity verified. What does this mean?] dialog "ID ` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [More] dialog "Options"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Packages]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Reviews]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Share] dialog "Share"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Verified Pro. What does this mean?] dialog "Verified` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [View The Glasshouse DTLA’s profile photo] dialog "Th` | out | 320 360 375 390 414 768 | pass |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af › [More] dialog "Options"` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af › [Share] dialog "Share"` | out, out+long | 320 360 375 390 414 768 | pass |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af › [View Rosa Diaz’s profile photo] dialog "Rosa Diaz’s ` | out | 320 360 375 390 414 768 | pass |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [# follower] dialog "Followers · 1"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Identity verified. What does this mean?] dialog "ID ` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [More] dialog "Options"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Packages]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Rated #.# from # reviews. Show reviews]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Reviews]` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Share] dialog "Share"` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Verified Pro. What does this mean?] dialog "Verified` | out, out+long | 320 360 375 390 414 768 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [View Golden Spoon Catering’s profile photo] dialog "` | out | 320 360 375 390 414 768 | pass |
| `/u/nobody-here` | out, out+long | 320 360 375 390 414 768 | pass |
| `/upload` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/verify` | out, client, vendor, out+long, client+long, vendor+long | 320 360 375 390 414 768 | pass |
| `/welcome` | out, unnamed acct | 320 360 375 390 414 768 | pass |
| `/welcome › [Continue with email]` | out | 320 360 375 390 414 768 | pass |

### Mobile (Expo)

| State (route › trigger / dialog) | Variants checked | Widths | Result |
|---|---|---|---|
| `/` | out, client, unnamed acct, new acct, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | fixed |
| `/ai-review/5639c870-85a8-403a-8e44-264234be8631` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/ai-review/x` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/auth/callback` | out | 320 360 375 390 414 | pass |
| `/book/8159543c-6832-4049-bcf8-d1965b00824f` | out, client, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | fixed |
| `/book/a6089673-52fc-4809-8d46-640b8836833e` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/book/ddd0f0a0-2aad-4148-a8fb-57d37d00855f` | out, client, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | fixed |
| `/bookings` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | fixed |
| `/bookings › [Wed Oct # #]` | client, client+long | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000001` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000001 › [Cancel request] dialog "Cancel request?"` | client, client+long, client@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000002` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000002 › [Cancel] dialog "Cancel booking?"` | client, client+long, client@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000003` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000003 › [Cancel] dialog "Cancel booking?"` | client, client+long, client@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000004` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000004 › [Cancel] dialog "Cancel booking?"` | client, client+long, client@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000005` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000005/delivery` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000005/review` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000006` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000006/delivery` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000007` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000007/review` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000008` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000009` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000010` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000011` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000011 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000011 › [Offer another price] dialog "Offer a differen` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000012` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000012 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000012 › [Send a price] dialog "Offer a different price` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/bookings/b0000000-0000-4000-8000-000000000013` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000013 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000014` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000014 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000015` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000015 › [Cancel] dialog "Cancel booking?"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000016` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000016/delivery` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/bookings/b0000000-0000-4000-8000-000000000017` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/discover` | out, client, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | fixed |
| `/discover › [Shortlist, #] dialog "Your shortlist"` | out, client, out+long, client+long, client@1.5x, out@1.5x | 320 360 375 390 414 | fixed |
| `/discover › [Showing Photography] dialog "Swipe through"` | out, client, out+long, client+long, client@1.5x, out@1.5x | 320 360 375 390 414 | fixed |
| `/discover › [Your taste] dialog "Your taste"` | out, client, out+long, client+long, client@1.5x, out@1.5x | 320 360 375 390 414 | fixed |
| `/discover?mode=explore` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/events` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [DJ Nova] dialog "DJ Nova"` | client, client@1.5x | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Golden Spoon Catering] dialog "Golden Spoon Cat` | client, client@1.5x | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Invite] dialog "Invite friends to plan"` | client, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [More] dialog "Event"` | client, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [Share event] dialog "Share"` | client, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/events/e0000000-0000-4000-8000-000000000001 › [The Glasshouse DTLA] dialog "The Glasshouse DTL` | client, client@1.5x | 320 360 375 390 414 | pass |
| `/events/new` | out, client, unnamed acct, new acct, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | pass |
| `/events/new › [Invite friends] dialog "Invite friends"` | client, new acct, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/events/new › [Pick a date] dialog "When is it?"` | client, new acct, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f` | out, vendor, out+long, vendor+long, out@1.5x, vendor@1.5x, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Album details] dialog "Beach engagement Extrao` | out+long, vendor+long | 320 360 375 390 414 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Album details] dialog "Beach engagement"` | out, vendor, out@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/gallery/8159543c-6832-4049-bcf8-d1965b00824f › [Share] dialog "Share"` | out, vendor, out+long, vendor+long, out@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/inbox` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | fixed |
| `/inbox/c0000000-0000-4000-8000-0000000000a1` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000a1 › [Wedding crew, group details] dialog "Group"` | client, client@1.5x | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000b1` | client, vendor, client+long, vendor+long, client@1.5x, vendor@1.5x, client dark, vendor dark | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000b1 › [Conversation details] dialog "Details"` | client, vendor, client+long, vendor+long, client@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000d1` | client, vendor, client+long, vendor+long, client@1.5x, vendor@1.5x, client dark, vendor dark | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000d1 › [Conversation details] dialog "Details"` | client, vendor, client+long, vendor+long, client@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000e1` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/inbox/c0000000-0000-4000-8000-0000000000e1 › [Sam’s #th, group details] dialog "Details"` | client, client@1.5x | 320 360 375 390 414 | pass |
| `/inbox/new` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/me` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | fixed |
| `/me › [Edit] dialog "Edit profile"` | client, vendor, new acct, client+long, vendor+long, client@1.5x, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/me?tab=calendar` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | fixed |
| `/me?tab=calendar › [# Booked in Oct]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/me?tab=calendar › [# New requests]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/me?tab=calendar › [Open the map] dialog "Service area"` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/me?tab=packages` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/me?tab=packages › [# Booked in Oct]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/me?tab=packages › [# New requests]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/me?tab=portfolio` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | pass |
| `/me?tab=portfolio › [# Booked in Oct]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | pass |
| `/me?tab=portfolio › [# New requests]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/me?tab=requests` | vendor, vendor+long, vendor@1.5x, vendor dark | 320 360 375 390 414 | fixed |
| `/me?tab=requests › [# Booked in Oct]` | vendor, vendor+long, vendor@1.5x | 320 360 375 390 414 | fixed |
| `/my-work` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/new-listing` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/nope` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/occasions/birthday` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | fixed |
| `/occasions/nope` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/occasions/wedding` | out, out+long, out@1.5x, out dark, client@1.5x | 320 360 375 390 414 | fixed |
| `/plan` | out, client, unnamed acct, new acct, out+long, client+long, client@1.5x, out@1.5x, client dark, out dark | 320 360 375 390 414 | pass |
| `/plan › [A wedding in Napa, June #–# #, about $#k all in, #]` | client, new acct, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/plan › [My events] dialog "My events"` | client, new acct, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/plan?q=Wedding` | client@1.5x | 320 375 414 | pass |
| `/plan?q=Wedding%20for%20120%20guests%20in%20Pasadena%20next%20June` | client, client+long, client@1.5x, client dark | 320 360 375 390 414 | pass |
| `/plan?q=Wedding%20for%20120%20guests%20in%20Pasadena%20next%20June › [New plan]` | client, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/post/5639c870-85a8-403a-8e44-264234be8631` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | fixed |
| `/reset-password` | out | 320 360 375 390 414 | pass |
| `/search` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/search › [Dates: any date] dialog "When do you need them?"` | out, out+long, out@1.5x | 320 360 375 390 414 | pass |
| `/search › [Filters] dialog "Filters"` | out, out+long, out@1.5x | 320 360 375 390 414 | pass |
| `/search › [Sort: Top rated] dialog "Sort by"` | out, out+long, out@1.5x | 320 360 375 390 414 | pass |
| `/search?q=wedding` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/search?q=wedding › [Clear text]` | out, out+long, out@1.5x | 320 360 375 390 414 | pass |
| `/search?v=catering` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/search?v=photography&view=map` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/services/catering` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/services/nope` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/services/photography` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/services/venue` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/settings` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/settings › [Delete account] dialog "Delete your account"` | client, vendor, client+long, vendor+long, client@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/sign-in` | out | 320 360 375 390 414 | pass |
| `/sign-in › [Create an account]` | out | 320 360 375 390 414 | pass |
| `/sign-in?mode=signup` | out | 320 360 375 390 414 | pass |
| `/sign-in?mode=signup › [Create an account]` | out | 320 360 375 390 414 | pass |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [# follower] dialog "Followers · 1"` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Rated #.# from # reviews. Show reviews]` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [Share] dialog "Share"` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/1e69bffd-c610-4310-a72e-4f2bd70dc0a5 › [View DJ Nova’s profile photo] dialog "DJ Nova @djnov` | out | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [# followers] dialog "Followers · 4"` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Add to event] dialog "Add to event"` | client, client+long, client@1.5x | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Rated #.# from # reviews. Show reviews]` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [Share] dialog "Share"` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f › [View Maya Chen’s profile photo] dialog "Maya Chen @m` | out, client, vendor | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/u/8159543c-6832-4049-bcf8-d1965b00824f?tab=reviews › [#-star review by Kai T., Sep #. Read the` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [Share] dialog "Share"` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/a6089673-52fc-4809-8d46-640b8836833e › [View The Glasshouse DTLA’s profile photo] dialog "Th` | out | 320 360 375 390 414 | fixed |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/u/bf844795-757a-452f-8884-e106d2ebd8af › [View Rosa Diaz’s profile photo] dialog "Rosa Diaz @r` | out | 320 360 375 390 414 | pass |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f` | out, out+long, out@1.5x, out dark, client+long, client@1.5x | 320 360 375 390 414 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [# follower] dialog "Followers · 1"` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Rated #.# from # reviews. Show reviews]` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [Share] dialog "Share"` | out, out+long, out@1.5x | 320 360 375 390 414 | fixed |
| `/u/ddd0f0a0-2aad-4148-a8fb-57d37d00855f › [View Golden Spoon Catering’s profile photo] dialog "` | out | 320 360 375 390 414 | fixed |
| `/u/nobody-here` | out, out+long, out@1.5x, out dark | 320 360 375 390 414 | pass |
| `/upload` | out, client, vendor, unnamed acct, new acct, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | pass |
| `/verify` | out, client, vendor, out+long, client+long, vendor+long, client@1.5x, out@1.5x, vendor@1.5x, client dark, out dark, vendor dark | 320 360 375 390 414 | fixed |
| `/welcome` | out, unnamed acct | 320 360 375 390 414 | pass |
| `/welcome › [Create an account]` | out | 320 360 375 390 414 | pass |
