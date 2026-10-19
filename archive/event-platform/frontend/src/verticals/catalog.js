// The service catalog: every kind of vendor the marketplace supports, and the
// occasions people plan. This file is the single source of truth shared by:
//   - the web app (frontend/src) and the Expo app (mobile/), so keep it plain JS:
//     no React, no DOM, no imports. Icons are lucide icon *names* (PascalCase);
//     each app maps them to its own icon component.
//   - supabase/seed (service_categories rows use the same slugs)
//   - services/ml/app/planner (vendor category slugs in vocab.py / budget.py)
//
// Slugs are global: a service slug must not repeat across verticals (the DB
// enforces service_categories.slug unique). Photography's services keep their
// original slugs (wedding, event...) because bookings and the planner already use them.
//
// priceUnit: how packages in this vertical are usually priced.
//   'session' fixed price · 'hour' hourly · 'person' per guest · 'item' per piece · 'day' per day
// concurrent: true when one vendor can serve several events at the same time
//   (caterers, rental companies). False = one booking at a time (a photographer).

export const VERTICALS = [
  {
    slug: 'photography', name: 'Photography', noun: 'photographer', plural: 'Photographers',
    icon: 'Camera', tint: '#6366f1', group: 'capture', priceUnit: 'session', concurrent: false, visual: true,
    tagline: 'Weddings, portraits, headshots and more',
    services: [
      { slug: 'wedding', name: 'Wedding' },
      { slug: 'graduation', name: 'Graduation' },
      { slug: 'portrait', name: 'Portrait' },
      { slug: 'event', name: 'Event' },
      { slug: 'headshots', name: 'Headshots' },
      { slug: 'real-estate', name: 'Real estate' },
      { slug: 'product', name: 'Product' },
      { slug: 'coaching', name: 'Coaching' },
      { slug: 'meetups', name: 'Meetups' },
    ],
  },
  {
    slug: 'videography', name: 'Videography', noun: 'videographer', plural: 'Videographers',
    icon: 'Video', tint: '#8b5cf6', group: 'capture', priceUnit: 'session', concurrent: false, visual: true,
    tagline: 'Wedding films, recaps and reels',
    services: [
      { slug: 'wedding-film', name: 'Wedding film' },
      { slug: 'event-recap', name: 'Event recap' },
      { slug: 'social-reels', name: 'Social reels' },
      { slug: 'music-video', name: 'Music video' },
      { slug: 'drone', name: 'Drone' },
    ],
  },
  {
    slug: 'venue', name: 'Venues', noun: 'venue', plural: 'Venues',
    icon: 'Building', tint: '#0ea5e9', group: 'place', priceUnit: 'day', concurrent: false, visual: true,
    tagline: 'Gardens, lofts, rooftops and ballrooms',
    services: [
      { slug: 'wedding-venue', name: 'Wedding venue' },
      { slug: 'party-space', name: 'Party space' },
      { slug: 'rooftop', name: 'Rooftop' },
      { slug: 'garden-estate', name: 'Garden & estate' },
      { slug: 'restaurant-buyout', name: 'Restaurant buyout' },
      { slug: 'studio-space', name: 'Studio space' },
    ],
  },
  {
    slug: 'catering', name: 'Catering', noun: 'caterer', plural: 'Caterers',
    icon: 'UtensilsCrossed', tint: '#f97316', group: 'food', priceUnit: 'person', concurrent: true, visual: true,
    tagline: 'Buffets, plated dinners and food trucks',
    services: [
      { slug: 'full-service-catering', name: 'Full service' },
      { slug: 'buffet', name: 'Buffet' },
      { slug: 'plated-dinner', name: 'Plated dinner' },
      { slug: 'food-truck', name: 'Food truck' },
      { slug: 'drop-off-catering', name: 'Drop-off' },
      { slug: 'brunch', name: 'Brunch' },
    ],
  },
  {
    slug: 'private-chef', name: 'Private chefs', noun: 'chef', plural: 'Private chefs',
    icon: 'ChefHat', tint: '#ea580c', group: 'food', priceUnit: 'person', concurrent: false, visual: true,
    tagline: 'A chef in your home for the night',
    services: [
      { slug: 'chef-dinner', name: 'Dinner party' },
      { slug: 'tasting-menu', name: 'Tasting menu' },
      { slug: 'meal-prep', name: 'Meal prep' },
      { slug: 'cooking-class', name: 'Cooking class' },
    ],
  },
  {
    slug: 'cakes', name: 'Cakes & desserts', noun: 'baker', plural: 'Bakers',
    icon: 'CakeSlice', tint: '#ec4899', group: 'food', priceUnit: 'item', concurrent: true, visual: true,
    tagline: 'Wedding cakes, dessert tables, cookies',
    services: [
      { slug: 'wedding-cake', name: 'Wedding cake' },
      { slug: 'celebration-cake', name: 'Celebration cake' },
      { slug: 'dessert-table', name: 'Dessert table' },
      { slug: 'cupcakes-cookies', name: 'Cupcakes & cookies' },
    ],
  },
  {
    slug: 'bar', name: 'Bar & drinks', noun: 'bartender', plural: 'Bartenders',
    icon: 'Wine', tint: '#be123c', group: 'food', priceUnit: 'person', concurrent: true, visual: true,
    tagline: 'Mobile bars, mixologists, coffee carts',
    services: [
      { slug: 'mobile-bar', name: 'Mobile bar' },
      { slug: 'bartender', name: 'Bartender' },
      { slug: 'mixology', name: 'Signature cocktails' },
      { slug: 'coffee-cart', name: 'Coffee cart' },
    ],
  },
  {
    slug: 'music', name: 'DJs & live music', noun: 'musician', plural: 'DJs & musicians',
    icon: 'Music', tint: '#14b8a6', group: 'entertainment', priceUnit: 'hour', concurrent: false, visual: false,
    tagline: 'DJs, bands, string quartets, MCs',
    services: [
      { slug: 'dj', name: 'DJ' },
      { slug: 'live-band', name: 'Live band' },
      { slug: 'solo-musician', name: 'Solo musician' },
      { slug: 'string-quartet', name: 'String quartet' },
      { slug: 'mc', name: 'MC / host' },
    ],
  },
  {
    slug: 'entertainment', name: 'Entertainment', noun: 'entertainer', plural: 'Entertainers',
    icon: 'Sparkles', tint: '#eab308', group: 'entertainment', priceUnit: 'hour', concurrent: false, visual: true,
    tagline: 'Magicians, photo booths, kids parties',
    services: [
      { slug: 'photo-booth', name: 'Photo booth' },
      { slug: 'magician', name: 'Magician' },
      { slug: 'kids-entertainer', name: 'Kids entertainer' },
      { slug: 'face-painting', name: 'Face painting' },
      { slug: 'dancers', name: 'Dancers' },
      { slug: 'caricature', name: 'Caricature artist' },
    ],
  },
  {
    slug: 'florals', name: 'Florals', noun: 'florist', plural: 'Florists',
    icon: 'Flower2', tint: '#f43f5e', group: 'style', priceUnit: 'item', concurrent: true, visual: true,
    tagline: 'Bouquets, centerpieces, installations',
    services: [
      { slug: 'bridal-bouquet', name: 'Bouquets' },
      { slug: 'centerpieces', name: 'Centerpieces' },
      { slug: 'ceremony-florals', name: 'Ceremony arch' },
      { slug: 'floral-installation', name: 'Installations' },
    ],
  },
  {
    slug: 'decor', name: 'Decor & design', noun: 'designer', plural: 'Event designers',
    icon: 'Palette', tint: '#a855f7', group: 'style', priceUnit: 'session', concurrent: true, visual: true,
    tagline: 'Balloons, backdrops, lighting, themes',
    services: [
      { slug: 'balloon-decor', name: 'Balloons' },
      { slug: 'backdrops', name: 'Backdrops' },
      { slug: 'lighting-design', name: 'Lighting' },
      { slug: 'themed-decor', name: 'Themed decor' },
      { slug: 'tablescapes', name: 'Tablescapes' },
    ],
  },
  {
    slug: 'hair-makeup', name: 'Hair & makeup', noun: 'artist', plural: 'Hair & makeup artists',
    icon: 'Brush', tint: '#d946ef', group: 'style', priceUnit: 'person', concurrent: false, visual: true,
    tagline: 'Bridal glam, hair styling, nails',
    services: [
      { slug: 'bridal-makeup', name: 'Bridal makeup' },
      { slug: 'event-makeup', name: 'Event makeup' },
      { slug: 'hair-styling', name: 'Hair styling' },
      { slug: 'nails', name: 'Nails' },
      { slug: 'lashes-brows', name: 'Lashes & brows' },
    ],
  },
  {
    slug: 'rentals', name: 'Rentals', noun: 'rental company', plural: 'Rental companies',
    icon: 'Armchair', tint: '#64748b', group: 'place', priceUnit: 'item', concurrent: true, visual: true,
    tagline: 'Tables, chairs, tents, linens, AV',
    services: [
      { slug: 'tables-chairs', name: 'Tables & chairs' },
      { slug: 'tents', name: 'Tents' },
      { slug: 'linens', name: 'Linens' },
      { slug: 'av-equipment', name: 'Sound & AV' },
      { slug: 'bounce-houses', name: 'Bounce houses' },
    ],
  },
  {
    slug: 'planning', name: 'Planners', noun: 'planner', plural: 'Planners',
    icon: 'ClipboardList', tint: '#0f766e', group: 'help', priceUnit: 'session', concurrent: true, visual: false,
    tagline: 'Full planning or day-of coordination',
    services: [
      { slug: 'full-planning', name: 'Full planning' },
      { slug: 'day-of-coordination', name: 'Day-of coordination' },
      { slug: 'proposal-planning', name: 'Proposal planning' },
      { slug: 'corporate-planning', name: 'Corporate events' },
    ],
  },
  {
    slug: 'officiant', name: 'Officiants', noun: 'officiant', plural: 'Officiants',
    icon: 'BookHeart', tint: '#7c3aed', group: 'help', priceUnit: 'session', concurrent: false, visual: false,
    tagline: 'Ceremonies your way',
    services: [
      { slug: 'wedding-officiant', name: 'Wedding ceremony' },
      { slug: 'vow-renewal', name: 'Vow renewal' },
      { slug: 'elopement-officiant', name: 'Elopement' },
    ],
  },
  {
    slug: 'transportation', name: 'Transportation', noun: 'driver', plural: 'Transportation',
    icon: 'Car', tint: '#334155', group: 'help', priceUnit: 'hour', concurrent: true, visual: true,
    tagline: 'Limos, party buses, classic cars',
    services: [
      { slug: 'limo', name: 'Limo' },
      { slug: 'party-bus', name: 'Party bus' },
      { slug: 'classic-car', name: 'Classic car' },
      { slug: 'guest-shuttle', name: 'Guest shuttle' },
    ],
  },
  {
    slug: 'staffing', name: 'Event staff', noun: 'staffing team', plural: 'Event staff',
    icon: 'Users', tint: '#475569', group: 'help', priceUnit: 'hour', concurrent: true, visual: false,
    tagline: 'Servers, valet, security, cleanup',
    services: [
      { slug: 'servers', name: 'Servers' },
      { slug: 'valet', name: 'Valet' },
      { slug: 'security', name: 'Security' },
      { slug: 'cleanup-crew', name: 'Cleanup crew' },
    ],
  },
  {
    slug: 'wellness', name: 'Wellness', noun: 'practitioner', plural: 'Wellness pros',
    icon: 'Leaf', tint: '#16a34a', group: 'self', priceUnit: 'session', concurrent: false, visual: true,
    tagline: 'Massage, yoga and training at home',
    services: [
      { slug: 'massage', name: 'Massage' },
      { slug: 'yoga', name: 'Yoga' },
      { slug: 'personal-training', name: 'Personal training' },
      { slug: 'spa-day', name: 'Spa day' },
    ],
  },
]

// Sections for browsing all verticals ("everything" sheets, the Discover grid).
export const GROUPS = [
  { slug: 'capture', name: 'Capture the day' },
  { slug: 'place', name: 'Place & setup' },
  { slug: 'food', name: 'Food & drinks' },
  { slug: 'entertainment', name: 'Music & entertainment' },
  { slug: 'style', name: 'Look & style' },
  { slug: 'help', name: 'Planning & logistics' },
  { slug: 'self', name: 'Treat yourself' },
]

// Occasions people plan. `needs` lists vertical slugs, most important first;
// the AI planner's event types (services/ml/app/planner/vocab.py) use the same slugs.
export const OCCASIONS = [
  { slug: 'wedding', name: 'Wedding', icon: 'Heart', tint: '#f43f5e',
    needs: ['venue', 'catering', 'photography', 'florals', 'music', 'videography', 'hair-makeup', 'cakes', 'officiant', 'planning', 'rentals', 'transportation'] },
  { slug: 'birthday', name: 'Birthday', icon: 'PartyPopper', tint: '#f59e0b',
    needs: ['venue', 'catering', 'cakes', 'decor', 'music', 'entertainment', 'photography'] },
  { slug: 'graduation', name: 'Graduation', icon: 'GraduationCap', tint: '#2563eb',
    needs: ['photography', 'catering', 'venue', 'decor', 'cakes'] },
  { slug: 'engagement', name: 'Proposal', icon: 'Gem', tint: '#e11d48',
    needs: ['photography', 'planning', 'florals', 'private-chef', 'music'] },
  { slug: 'corporate', name: 'Corporate', icon: 'Briefcase', tint: '#0f172a',
    needs: ['venue', 'catering', 'bar', 'photography', 'staffing', 'rentals', 'planning'] },
  { slug: 'baby-shower', name: 'Baby shower', icon: 'Baby', tint: '#06b6d4',
    needs: ['venue', 'catering', 'cakes', 'decor', 'photography'] },
  { slug: 'quinceanera', name: 'Quinceañera', icon: 'Crown', tint: '#c026d3',
    needs: ['venue', 'catering', 'music', 'photography', 'hair-makeup', 'cakes', 'decor'] },
  { slug: 'dinner-party', name: 'Dinner party', icon: 'Utensils', tint: '#ea580c',
    needs: ['private-chef', 'bar', 'florals', 'staffing'] },
  { slug: 'bachelor', name: 'Bachelor/ette', icon: 'Martini', tint: '#9333ea',
    needs: ['transportation', 'bar', 'private-chef', 'wellness', 'photography'] },
  { slug: 'holiday-party', name: 'Holiday party', icon: 'Gift', tint: '#16a34a',
    needs: ['venue', 'catering', 'bar', 'music', 'photography', 'decor'] },
]

const bySlug = new Map(VERTICALS.map((v) => [v.slug, v]))
const serviceIndex = new Map(VERTICALS.flatMap((v) => v.services.map((s) => [s.slug, { ...s, vertical: v.slug }])))

/** The vertical for a slug, or undefined. */
export const getVertical = (slug) => bySlug.get(slug)

/** The vertical a service slug belongs to (e.g. 'buffet' -> catering), or undefined. */
export const verticalOfService = (serviceSlug) => bySlug.get(serviceIndex.get(serviceSlug)?.vertical)

/** { slug, name, vertical } for a service slug, or undefined. */
export const getService = (serviceSlug) => serviceIndex.get(serviceSlug)

export const getOccasion = (slug) => OCCASIONS.find((o) => o.slug === slug)

/** Verticals in a browsing group, in catalog order. */
export const verticalsInGroup = (group) => VERTICALS.filter((v) => v.group === group)

/** "per person", "per hour"... for a price unit ('' for a flat session price). */
export const unitLabel = (unit) => ({ hour: 'per hour', person: 'per person', item: 'each', day: 'per day' })[unit] || ''
