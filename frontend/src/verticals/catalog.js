// The service catalog. photomatch is a photography marketplace: ONE vertical,
// `photography` ("Photo & video"), whose creators sell photo and/or video work.
// This file is the single source of truth shared by:
//   - the web app (frontend/src) and the Expo app (mobile/), so keep it plain JS:
//     no React, no DOM, no imports. Icons are lucide icon *names* (PascalCase);
//     each app maps them to its own icon component.
//   - supabase/seed (service_categories rows use the same slugs)
//
// Removed in the photography pivot (2026-10-18). The multi-vendor catalog (18
// verticals, GROUPS and OCCASIONS) lives in archive/event-platform/frontend/src/verticals/
// and in the git tag `multi-vendor-snapshot`:
//   - VERTICALS now has one entry. GROUPS, OCCASIONS, getOccasion() and verticalsInGroup()
//     were removed once nothing imported them (2026-10-20).
//   - 'videography' is no longer a vertical. Its services (wedding-film, event-recap,
//     social-reels, music-video, drone) belong to photography, and a provider or
//     post still tagged 'videography' in the database counts as photography
//     (normalizeVertical / LEGACY_VERTICALS).
//
// Wording: a creator is a "photographer" in compact UI (counts, card kinds, "Book a
// photographer"); headline copy says "photographers & videographers" (pluralLong)
// and the vertical's name is "Photo & video".
//
// Service slugs keep their original values (wedding, event...) because bookings,
// posts and the database already use them.

export const PHOTO_VERTICAL = 'photography'

// Vertical slugs the database may still hold that now mean photography.
export const LEGACY_VERTICALS = { videography: PHOTO_VERTICAL }

// kind: 'photo' | 'video' (what the service delivers); icon: a lucide icon name.
const SERVICES = [
  { slug: 'wedding', name: 'Wedding', kind: 'photo', icon: 'Heart' },
  { slug: 'graduation', name: 'Graduation', kind: 'photo', icon: 'GraduationCap' },
  { slug: 'portrait', name: 'Portrait', kind: 'photo', icon: 'UserRound' },
  { slug: 'headshots', name: 'Headshots', kind: 'photo', icon: 'Briefcase' },
  { slug: 'event', name: 'Event', kind: 'photo', icon: 'PartyPopper' },
  { slug: 'real-estate', name: 'Real estate', kind: 'photo', icon: 'House' },
  { slug: 'product', name: 'Product', kind: 'photo', icon: 'Package' },
  { slug: 'wedding-film', name: 'Wedding film', kind: 'video', icon: 'Film' },
  { slug: 'event-recap', name: 'Event recap', kind: 'video', icon: 'Clapperboard' },
  { slug: 'social-reels', name: 'Social reels', kind: 'video', icon: 'Smartphone' },
  { slug: 'music-video', name: 'Music video', kind: 'video', icon: 'Music' },
  { slug: 'drone', name: 'Drone', kind: 'video', icon: 'Plane' },
  { slug: 'coaching', name: 'Coaching', kind: 'photo', icon: 'Presentation' },
  { slug: 'meetups', name: 'Meetups', kind: 'photo', icon: 'Users' },
]

// priceUnit: how packages are usually priced ('session' = a fixed price).
// concurrent: false = one booking at a time (a photographer can't shoot two events at once).
export const VERTICALS = [
  {
    slug: PHOTO_VERTICAL, name: 'Photo & video', noun: 'photographer', plural: 'Photographers',
    pluralLong: 'Photographers & videographers',
    icon: 'Camera', tint: '#6366f1', group: 'capture', priceUnit: 'session', concurrent: false, visual: true,
    tagline: 'Weddings, portraits, headshots, films and reels',
    services: SERVICES,
  },
]

// Services for browse chips (Home, Discover, Explore, Search), most asked-for first.
// Coaching and meetups aren't shoots, so they stay out of the chips (still bookable).
export const SERVICE_CHIPS = SERVICES.filter((s) => s.slug !== 'coaching' && s.slug !== 'meetups')

/** 'videography' -> 'photography'; other slugs unchanged (null stays null). */
export const normalizeVertical = (slug) => (slug && LEGACY_VERTICALS[slug]) || slug || null

/** Is this a photo & video vertical slug (photography, or a legacy alias)? Anything else is hidden. */
export const isPhotoVertical = (slug) => normalizeVertical(slug) === PHOTO_VERTICAL

const bySlug = new Map(VERTICALS.map((v) => [v.slug, v]))
const serviceIndex = new Map(VERTICALS.flatMap((v) => v.services.map((s) => [s.slug, { ...s, vertical: v.slug }])))

/** The vertical for a slug ('videography' counts as photography), or undefined. */
export const getVertical = (slug) => bySlug.get(normalizeVertical(slug))

/** The vertical a service slug belongs to (e.g. 'drone' -> photography), or undefined. */
export const verticalOfService = (serviceSlug) => bySlug.get(serviceIndex.get(serviceSlug)?.vertical)

/** { slug, name, kind, icon, vertical } for a service slug, or undefined. */
export const getService = (serviceSlug) => serviceIndex.get(serviceSlug)
