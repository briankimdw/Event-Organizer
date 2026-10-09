# Test users

Fake accounts for testing the app with "real" users on the Supabase project **Event Organizer**.
These are throwaway logins for development. The repo is public, so anyone can see them: **delete these users before launch** (see "Cleaning up later").

- The `@example.com` addresses can't receive mail. That's fine because **email confirmation is turned off** (Authentication → Sign In / Providers → Email). If you turn it back on, these sign-ups will fail.
- "Forgot password" and "email me a sign-in link" won't work for these accounts, since nobody gets the emails. Use the passwords below.
- Every password is unique and random. Don't reuse them anywhere real.

## Fastest: create them all with one command

1. Put your service role key in `services/ml/.env` (copy `services/ml/.env.example`; the key is in Supabase → Project Settings → API Keys). Never commit it.
2. Run:
   ```
   cd frontend
   node scripts/seed-test-users.mjs --with-photos
   ```
   This creates all 12 accounts (already confirmed, names and usernames set, so no Welcome step), the 7 photographer listings (published), and 17 sample albums / 70 photos. Leave out `--with-photos` for accounts only. It's safe to re-run.
3. Then log in as anyone below with their email + password.
4. Optional, SigLIP tags for the new photos: `cd services/ml` then `.venv/Scripts/python -m app.worker --once`.

## Or: sign each one up by hand

1. Open the app → **Me → Sign in or create an account** → **Create account** tab.
2. Enter the email and password below → **Create account**.
3. On the **Welcome** screen, enter the name and username from the table.
4. **Photographers only:** tap **Post** (Home) → fill in *Set up your photographer profile* with the profile link, city and "what do you shoot" below → then post the albums listed. Use your own photos or free ones (e.g. unsplash.com).
5. Use **Me → Settings → Log out** before signing up the next account. Or use a private/incognito window for each one, so you can stay signed in as several users at once.

## Photographers (7)

| # | Name | Username | Email | Password |
|---|---|---|---|---|
| 1 | Maya Chen | mayachen | mayachen.test@example.com | `CuUa-VQ3a-aqRM!` |
| 2 | Jonah Reyes | jonahshoots | jonahshoots.test@example.com | `BMeY-UBWG-mpwx!` |
| 3 | Priya Nair | priya.frames | priyaframes.test@example.com | `ntX5-rj8a-THWd!` |
| 4 | Leo Okafor | leo.spaces | leospaces.test@example.com | `MtmK-CkTj-BWbj!` |
| 5 | Sofia Marin | sofia.wild | sofiawild.test@example.com | `tpDK-vKHe-Qgv3!` |
| 6 | Diego Alvarez | diego.alvarez | diegoalvarez.test@example.com | `dgHg-BFNW-kyQx!` |
| 7 | Hana Kim | hanakim.studio | hanakimstudio.test@example.com | `Ghcn-4MWk-mBRm!` |

### Photographer profile details (for "Set up your photographer profile")

**1. Maya Chen**
- Profile link: `maya-chen-photo` · City: Los Angeles, CA
- What do you shoot: Wedding, Portrait, Event
- Bio (Me → Edit): Documentary-style wedding and portrait photographer. Warm tones, honest moments, lots of golden hour.
- Albums to post: Nguyen–Park wedding (Wedding, 6 photos) · Golden hour portraits (Portrait, 4) · Beach engagement (Portrait, 2)

**2. Jonah Reyes**
- Profile link: `jonah-reyes` · City: Los Angeles, CA
- What do you shoot: Event, Portrait
- Bio (Me → Edit): Street and event shooter. Low light is my comfort zone.
- Albums to post: Rainy night downtown (Event, 3) · Product launch party (Event, 5) · Street portrait walk (Portrait, 3)

**3. Priya Nair**
- Profile link: `priya-frames` · City: Pasadena, CA
- What do you shoot: Graduation, Headshots, Portrait
- Bio (Me → Edit): Bright, clean portraits. Grad sessions and corporate headshots.
- Albums to post: UCLA class of 2026 (Graduation, 4) · Team headshots (Headshots, 6) · Before/after grad edit (Before/After)

**4. Leo Okafor**
- Profile link: `leo-spaces` · City: Santa Monica, CA
- What do you shoot: Real estate, Product
- Bio (Me → Edit): Interiors, architecture and product work. HDR done tastefully.
- Albums to post: Venice modern listing (Real estate, 5) · Skincare launch (Product, 4)

**5. Sofia Marin**
- Profile link: `sofia-wild` · City: Malibu, CA
- What do you shoot: Coaching, Meetups
- Bio (Me → Edit): Landscape photographer. Small-group sunrise meetups and 1:1 long-exposure coaching.
- Albums to post: Sunrise at El Matador (Meetups, 4) · Long exposure workshop (Coaching, 3)

**6. Diego Alvarez**
- Profile link: `diego-alvarez` · City: Long Beach, CA
- What do you shoot: Wedding, Event
- Bio (Me → Edit): Candid coverage for big families and bigger dance floors. English & Spanish.
- Albums to post: Garden wedding at Descanso (Wedding, 6) · Rooftop birthday (Event, 4)

**7. Hana Kim**
- Profile link: `hana-kim-studio` · City: Koreatown, Los Angeles
- What do you shoot: Headshots, Portrait
- Bio (Me → Edit): Studio portraits with a moody, editorial edge.
- Albums to post: Actor headshots (Headshots, 5) · Editorial: monochrome (Portrait, 4, black and white)

## Clients (5)

| # | Name | Username | Email | Password | Persona / what to test |
|---|---|---|---|---|---|
| 1 | Jordan Lee | jordanlee | jordanlee.test@example.com | `kXqB-hR8N-s9MS!` | Graduating senior looking for a grad session. Good for: browsing, Discover swipes, shortlist, requesting a booking. |
| 2 | Sam Patel | sampatel | sampatel.test@example.com | `RBs2-JDMs-nXhK!` | Office manager booking team headshots. Good for: Search with filters and dates. |
| 3 | Taylor Brooks | taylorb | taylorb.test@example.com | `Ch7g-dwdY-7Hky!` | First-time client planning an engagement shoot. Good for: the brand-new-user experience (no swipes yet). |
| 4 | Rosa Diaz | rosa.d | rosad.test@example.com | `zqy7-U7dX-Kghf!` | Planning a wedding for next June. Good for: date search, messaging photographers. |
| 5 | Kai Tanaka | kai.film | kaifilm.test@example.com | `XZEm-bv6f-uf9n!` | Loves moody black and white street photos. Good for: testing Discover taste matching (swipe only B&W/moody shots). |

## What you can test with them today

| Works with real data now | Still mock (same for every account) |
|---|---|
| Sign up, log in, log out, set password | Home, Search and Discover photographers |
| Welcome step (name + username), Edit profile | Bookings, Inbox and chat |
| Photographer setup + posting albums (single / album / before-after) | Packages, calendar and requests on the Photographer side of Me |
| Portfolio tab + full-screen viewer for your posts | Reviews, payments |
| SigLIP tags + embeddings for posted photos (run `python -m app.worker --once` in `services/ml`) | Discover feed (the `discover_feed()` function exists but the screen isn't connected yet) |

## Cleaning up later

Supabase → **Authentication → Users** → search `example.com` → select → **Delete user**. Deleting a user also removes their profile, photographer listing and albums. Uploaded photo files stay in Storage, under a folder named with the user's id, and can be deleted from **Storage**.
