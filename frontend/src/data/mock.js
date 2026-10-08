// Mock data for the frontend prototype. Nothing here talks to a backend.

export const img = (seed, w = 600, h = 750) => `https://picsum.photos/seed/${seed}/${w}/${h}`
export const avatar = (n) => `https://i.pravatar.cc/150?img=${n}`

export const me = {
  id: 'u0',
  name: 'Alex Rivera',
  username: 'alex.shoots',
  avatar: avatar(12),
  city: 'Los Angeles, CA',
  bio: 'Weekend street shooter. Grad + headshot sessions around LA.',
  clientRating: 4.8,
  clientReviews: 9,
  providerRating: 4.9,
  providerReviews: 23,
  verifiedClient: true,
  followers: 312,
  following: 188,
}

export const cancellationPolicies = {
  flexible: {
    label: 'Flexible',
    tiers: [
      { when: '7+ days before', refund: 100 },
      { when: '2–7 days before', refund: 50 },
      { when: 'Under 48 hours', refund: 0 },
    ],
  },
  moderate: {
    label: 'Moderate',
    tiers: [
      { when: '30+ days before', refund: 100 },
      { when: '14–30 days before', refund: 50 },
      { when: 'Under 14 days', refund: 0 },
    ],
  },
  strict: {
    label: 'Strict',
    tiers: [
      { when: '90+ days before', refund: 50 },
      { when: 'Under 90 days', refund: 0 },
    ],
  },
}

export const serviceCategories = [
  'Wedding', 'Graduation', 'Portrait', 'Event', 'Real estate', 'Product', 'Headshots', 'Coaching', 'Meetups',
]

export const genres = ['Portrait', 'Street', 'Wedding', 'Landscape', 'Event', 'Product', 'Architecture', 'Nature']

export const providers = [
  {
    id: 'p1',
    name: 'Maya Chen',
    username: 'mayachen',
    avatar: avatar(47),
    cover: img('maya-cover', 800, 400),
    city: 'Los Angeles, CA',
    serviceArea: 'Los Angeles + 50 km radius',
    travelFee: '$1.50/km beyond service area',
    specialties: ['Wedding', 'Portrait', 'Engagement'],
    categories: ['Wedding', 'Portrait', 'Event'],
    bio: 'Documentary-style wedding and portrait photographer. Warm tones, honest moments, lots of golden hour.',
    rating: 4.9,
    reviewCount: 127,
    idVerified: true,
    pro: true,
    tasteMatch: 94,
    distanceKm: 6,
    followers: '12.4k',
    cancellationPolicy: 'moderate',
    gear: {
      bodies: ['Sony A7 IV', 'Sony A7C'],
      lenses: ['Sony FE 35mm f/1.4 GM', 'Sony FE 85mm f/1.8', 'Sony FE 24-70mm f/2.8 GM II'],
    },
    packages: [
      { id: 'maya-elope', name: 'Elopement', priceType: 'fixed', price: 1200, hours: 2, editedPhotos: 150, editingLevel: 'Natural color grade', turnaroundDays: 14, deliverables: ['Online gallery', 'Print release'], depositPct: 30 },
      { id: 'maya-wedding', name: 'Full-Day Wedding', priceType: 'fixed', price: 4500, hours: 8, editedPhotos: 600, editingLevel: 'Full retouch on highlights', turnaroundDays: 42, deliverables: ['Online gallery', 'Sneak peek in 72h', 'Print release'], depositPct: 30 },
      { id: 'maya-portrait', name: 'Portrait Session', priceType: 'fixed', price: 350, hours: 1, editedPhotos: 40, editingLevel: 'Natural color grade', turnaroundDays: 7, deliverables: ['Online gallery'], depositPct: 50 },
    ],
    addons: [
      { id: 'hour', name: 'Extra hour', price: 250 },
      { id: 'second', name: 'Second shooter', price: 600 },
      { id: 'rush', name: 'Rush delivery (7 days)', price: 300 },
      { id: 'prints', name: 'Print set (20 × 8x10)', price: 150 },
    ],
    unavailable: [2, 3, 9, 10, 16],
    reviews: [
      { name: 'Hannah P.', avatar: avatar(5), rating: 5, date: 'Sep 2026', text: 'Maya made our elopement feel effortless. Photos came back a week early!' },
      { name: 'Marcus T.', avatar: avatar(8), rating: 5, date: 'Aug 2026', text: 'Calm, organized, and the golden hour portraits are unreal.' },
      { name: 'Dana W.', avatar: avatar(20), rating: 4, date: 'Jul 2026', text: 'Beautiful work. Communication was a little slow during peak season.' },
    ],
  },
  {
    id: 'p2',
    name: 'Jonah Reyes',
    username: 'jonahshoots',
    avatar: avatar(13),
    cover: img('jonah-cover', 800, 400),
    city: 'Los Angeles, CA',
    serviceArea: 'LA County',
    travelFee: '$1/km beyond service area',
    specialties: ['Street', 'Event', 'Nightlife'],
    categories: ['Event', 'Portrait'],
    bio: 'Street and event shooter. Fujifilm everything. Low light is my comfort zone.',
    rating: 4.8,
    reviewCount: 64,
    idVerified: true,
    pro: false,
    tasteMatch: 88,
    distanceKm: 11,
    followers: '5.1k',
    cancellationPolicy: 'flexible',
    gear: { bodies: ['Fujifilm X100V', 'Fujifilm X-T5'], lenses: ['XF 23mm f/1.4 R LM WR', 'XF 56mm f/1.2 R WR'] },
    packages: [
      { id: 'jonah-event', name: 'Event Coverage', priceType: 'hourly', price: 150, hours: 3, editedPhotos: 120, editingLevel: 'Film-style grade', turnaroundDays: 5, deliverables: ['Online gallery'], depositPct: 25 },
      { id: 'jonah-street', name: 'Street Portrait Walk', priceType: 'fixed', price: 220, hours: 1.5, editedPhotos: 25, editingLevel: 'Film-style grade', turnaroundDays: 5, deliverables: ['Online gallery'], depositPct: 50 },
    ],
    addons: [
      { id: 'hour', name: 'Extra hour', price: 150 },
      { id: 'rush', name: 'Next-day delivery', price: 120 },
    ],
    unavailable: [1, 5, 6, 12],
    reviews: [
      { name: 'Priya N.', avatar: avatar(32), rating: 5, date: 'Sep 2026', text: 'Jonah captured our launch party perfectly. Total pro.' },
    ],
  },
  {
    id: 'p3',
    name: 'Priya Nair',
    username: 'priya.frames',
    avatar: avatar(32),
    cover: img('priya-cover', 800, 400),
    city: 'Pasadena, CA',
    serviceArea: 'Pasadena + 40 km radius',
    travelFee: '$1.25/km beyond service area',
    specialties: ['Graduation', 'Headshots', 'Family'],
    categories: ['Graduation', 'Headshots', 'Portrait'],
    bio: 'Bright, clean portraits. I specialize in grad sessions and corporate headshots.',
    rating: 5.0,
    reviewCount: 41,
    idVerified: true,
    pro: true,
    tasteMatch: 81,
    distanceKm: 18,
    followers: '3.8k',
    cancellationPolicy: 'flexible',
    gear: { bodies: ['Canon EOS R6 Mark II'], lenses: ['Canon RF 50mm f/1.2L', 'Canon RF 70-200mm f/2.8L'] },
    packages: [
      { id: 'priya-grad', name: 'Graduation Session', priceType: 'fixed', price: 400, hours: 1.5, editedPhotos: 50, editingLevel: 'Skin retouch included', turnaroundDays: 10, deliverables: ['Online gallery', 'Print release'], depositPct: 50 },
      { id: 'priya-headshot', name: 'Headshots', priceType: 'fixed', price: 275, hours: 0.75, editedPhotos: 10, editingLevel: 'Full retouch', turnaroundDays: 3, deliverables: ['Online gallery', 'LinkedIn crops'], depositPct: 50 },
    ],
    addons: [
      { id: 'look', name: 'Extra outfit / location', price: 90 },
      { id: 'rush', name: 'Rush delivery (48h)', price: 100 },
    ],
    unavailable: [4, 7, 8, 14],
    reviews: [
      { name: 'Alex R.', avatar: avatar(12), rating: 5, date: 'Oct 2026', text: 'Super easy to work with, gallery was gorgeous.' },
    ],
  },
  {
    id: 'p4',
    name: 'Leo Okafor',
    username: 'leo.spaces',
    avatar: avatar(59),
    cover: img('leo-cover', 800, 400),
    city: 'Santa Monica, CA',
    serviceArea: 'Westside LA + 30 km radius',
    travelFee: '$2/km beyond service area',
    specialties: ['Real estate', 'Product', 'Architecture'],
    categories: ['Real estate', 'Product'],
    bio: 'Interiors, architecture and product work. HDR done tastefully.',
    rating: 4.7,
    reviewCount: 88,
    idVerified: true,
    pro: false,
    tasteMatch: 63,
    distanceKm: 14,
    followers: '2.2k',
    cancellationPolicy: 'strict',
    gear: { bodies: ['Nikon Z7 II'], lenses: ['Nikkor Z 14-24mm f/2.8 S', 'Nikkor Z MC 105mm f/2.8'] },
    packages: [
      { id: 'leo-listing', name: 'Listing Shoot', priceType: 'fixed', price: 300, hours: 2, editedPhotos: 30, editingLevel: 'HDR blend + sky replace', turnaroundDays: 2, deliverables: ['MLS-ready set', 'Web set'], depositPct: 30 },
      { id: 'leo-product', name: 'Product Catalog', priceType: 'quote', price: null, hours: null, editedPhotos: null, editingLevel: 'Clipping paths, retouch', turnaroundDays: 7, deliverables: ['White background set'], depositPct: 30 },
    ],
    addons: [{ id: 'twilight', name: 'Twilight exterior', price: 175 }],
    unavailable: [0, 6, 13],
    reviews: [],
  },
  {
    id: 'p5',
    name: 'Sofia Marin',
    username: 'sofia.wild',
    avatar: avatar(44),
    cover: img('sofia-cover', 800, 400),
    city: 'Malibu, CA',
    serviceArea: 'Southern California',
    travelFee: 'Quoted per trip',
    specialties: ['Landscape', 'Coaching', 'Meetups'],
    categories: ['Coaching', 'Meetups'],
    bio: 'Landscape photographer. I run small-group sunrise meetups and 1:1 coaching on long exposure.',
    rating: 4.9,
    reviewCount: 52,
    idVerified: false,
    pro: false,
    tasteMatch: 72,
    distanceKm: 32,
    followers: '9.7k',
    cancellationPolicy: 'flexible',
    gear: { bodies: ['Sony A7R V'], lenses: ['Sony FE 16-35mm f/2.8 GM', 'Sony FE 100-400mm GM'] },
    packages: [
      { id: 'sofia-coach', name: '1:1 Coaching', priceType: 'hourly', price: 90, hours: 2, editedPhotos: null, editingLevel: 'Editing walkthrough', turnaroundDays: null, deliverables: ['Settings cheat sheet'], depositPct: 100 },
      { id: 'sofia-meetup', name: 'Sunrise Meetup', priceType: 'fixed', price: 45, hours: 2, editedPhotos: null, editingLevel: null, turnaroundDays: null, deliverables: ['Group spot guide'], depositPct: 100 },
    ],
    addons: [],
    unavailable: [2, 3, 4],
    reviews: [],
  },
  {
    id: 'p6',
    name: 'Diego Alvarez',
    username: 'diego.alvarez',
    avatar: avatar(33),
    cover: img('diego-cover', 800, 400),
    city: 'Long Beach, CA',
    serviceArea: 'Long Beach + 60 km radius',
    travelFee: '$1/km beyond service area',
    specialties: ['Wedding', 'Event', 'Quinceañera'],
    categories: ['Wedding', 'Event'],
    bio: 'Candid, documentary coverage for big families and bigger dance floors. English & Spanish.',
    rating: 4.8,
    reviewCount: 96,
    idVerified: true,
    pro: true,
    tasteMatch: 86,
    distanceKm: 29,
    followers: '6.3k',
    cancellationPolicy: 'moderate',
    gear: { bodies: ['Canon EOS R5', 'Canon EOS R6'], lenses: ['Canon RF 28-70mm f/2L', 'Canon RF 85mm f/1.2L'] },
    packages: [
      { id: 'diego-wedding', name: 'Wedding Day', priceType: 'fixed', price: 3200, hours: 7, editedPhotos: 500, editingLevel: 'Natural color grade', turnaroundDays: 35, deliverables: ['Online gallery', 'Highlight slideshow'], depositPct: 25 },
      { id: 'diego-event', name: 'Party / Event', priceType: 'hourly', price: 175, hours: 4, editedPhotos: 200, editingLevel: 'Natural color grade', turnaroundDays: 10, deliverables: ['Online gallery'], depositPct: 25 },
    ],
    addons: [
      { id: 'second', name: 'Second shooter', price: 450 },
      { id: 'hour', name: 'Extra hour', price: 200 },
    ],
    unavailable: [3, 10, 11],
    reviews: [
      { name: 'Lucia M.', avatar: avatar(23), rating: 5, date: 'Sep 2026', text: 'Diego caught every moment with our abuela. We cried looking at the gallery.' },
    ],
  },
  {
    id: 'p7',
    name: 'Hana Kim',
    username: 'hanakim.studio',
    avatar: avatar(45),
    cover: img('hana-cover', 800, 400),
    city: 'Koreatown, Los Angeles',
    serviceArea: 'Studio + 25 km radius',
    travelFee: '$1.50/km beyond service area',
    specialties: ['Headshots', 'Portrait', 'Editorial'],
    categories: ['Headshots', 'Portrait'],
    bio: 'Studio portraits with a moody, editorial edge. Natural light studio in K-Town.',
    rating: 4.9,
    reviewCount: 73,
    idVerified: true,
    pro: false,
    tasteMatch: 90,
    distanceKm: 4,
    followers: '8.0k',
    cancellationPolicy: 'flexible',
    gear: { bodies: ['Sony A7R V'], lenses: ['Sony FE 50mm f/1.2 GM', 'Sony FE 90mm f/2.8 Macro G'] },
    packages: [
      { id: 'hana-headshot', name: 'Studio Headshots', priceType: 'fixed', price: 225, hours: 0.75, editedPhotos: 6, editingLevel: 'Full retouch', turnaroundDays: 4, deliverables: ['Online gallery', 'LinkedIn crops'], depositPct: 50 },
      { id: 'hana-editorial', name: 'Editorial Portrait', priceType: 'fixed', price: 480, hours: 2, editedPhotos: 25, editingLevel: 'Full retouch', turnaroundDays: 10, deliverables: ['Online gallery', 'Print release'], depositPct: 50 },
    ],
    addons: [
      { id: 'look', name: 'Extra look', price: 80 },
      { id: 'mua', name: 'Hair & makeup touch-ups', price: 150 },
    ],
    unavailable: [0, 1, 7],
    reviews: [],
  },
]

// What the taste model has learned from my swipes so far.
export const tasteProfile = {
  swipes: 48,
  styles: [
    { tag: 'warm tones', weight: 0.82 },
    { tag: 'golden hour', weight: 0.74 },
    { tag: 'candid', weight: 0.66 },
    { tag: 'moody', weight: 0.58 },
    { tag: 'low-light', weight: 0.51 },
    { tag: 'soft light', weight: 0.44 },
  ],
  corrections: ['black & white'],
}

export const otherUsers = [
  { id: 'u5', name: 'Kai Tanaka', username: 'kai.film', avatar: avatar(15) },
  { id: 'u6', name: 'Rosa Diaz', username: 'rosa.d', avatar: avatar(25) },
  { id: 'u7', name: 'Jordan Lee', username: 'jlee', avatar: avatar(52) },
]

export const getPerson = (id) =>
  id === me.id ? me : providers.find((p) => p.id === id) || otherUsers.find((u) => u.id === id)

export const getProvider = (id) => providers.find((p) => p.id === id)

// Is this provider free on a given date? The next 14 days come from each provider's
// `unavailable` list (offset 0 = Oct 8, 2026); later dates are faked with a stable hash.
const AVAILABILITY_START = new Date(2026, 9, 8)
export const isAvailable = (provider, date) => {
  const offset = Math.round((date - AVAILABILITY_START) / 86400000)
  if (offset >= 0 && offset < 14) return !provider.unavailable.includes(offset)
  let h = 7
  for (const ch of `${provider.id}-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`) h = (h * 31 + ch.charCodeAt(0)) % 997
  return h % 100 >= 22
}

export const findPackage = (pkgId) => {
  for (const p of providers) {
    const pkg = p.packages.find((x) => x.id === pkgId)
    if (pkg) return { provider: p, pkg }
  }
  return {}
}

export const posts = [
  {
    id: 'post1', authorId: 'p1', type: 'carousel', photos: ['maya-1', 'maya-2', 'maya-3', 'maya-4'],
    caption: 'Golden hour at the observatory with these two. Shot wide open the whole time.',
    location: 'Griffith Observatory, Los Angeles', genre: 'Wedding', tags: ['goldenhour', 'engagement'],
    autoTags: ['couple', 'warm tones', 'backlit'],
    exif: { body: 'Sony A7 IV', lens: 'Sony FE 85mm f/1.8', focal: '85mm', aperture: 'f/1.8', shutter: '1/500s', iso: '100', flash: 'Off', date: 'Sep 14, 2026' },
    realPhoto: true, watermark: true, likes: 1284, ago: '2h', following: true, trending: true,
    comments: [
      { userId: 'p2', text: 'That backlight 🔥' },
      { userId: 'u6', text: 'What preset is this?' },
    ],
  },
  {
    id: 'post2', authorId: 'p2', type: 'single', photos: ['jonah-1'],
    caption: 'Rainy night on Broadway. ISO 6400 and no regrets.',
    location: 'Downtown Los Angeles', genre: 'Street', tags: ['nightstreet', 'x100v'],
    autoTags: ['neon', 'rain', 'moody', 'low-light'],
    exif: { body: 'Fujifilm X100V', lens: 'Fujinon 23mm f/2', focal: '23mm', aperture: 'f/2', shutter: '1/60s', iso: '6400', flash: 'Off', date: 'Oct 1, 2026' },
    realPhoto: true, watermark: false, likes: 842, ago: '5h', following: true, trending: true,
    comments: [{ userId: 'u5', text: 'The reflections!!' }],
  },
  {
    id: 'post3', authorId: 'p3', type: 'beforeafter', photos: ['priya-ba'],
    caption: 'Before / after on a grad portrait. Lifted shadows, warmed skin, cleaned up the background.',
    location: 'UCLA, Los Angeles', genre: 'Portrait', tags: ['grad2026', 'editing'],
    autoTags: ['portrait', 'outdoor', 'soft light'],
    exif: { body: 'Canon EOS R6 Mark II', lens: 'Canon RF 50mm f/1.2L', focal: '50mm', aperture: 'f/1.4', shutter: '1/1000s', iso: '200', flash: 'Off', date: 'Jun 12, 2026' },
    realPhoto: false, watermark: true, likes: 513, ago: '1d', following: false, trending: true,
    comments: [],
  },
  {
    id: 'post4', authorId: 'p5', type: 'single', photos: ['sofia-1'],
    caption: '30 second exposure at El Matador. Meetup this Saturday if you want to learn it.',
    location: 'El Matador Beach, Malibu', genre: 'Landscape', tags: ['longexposure', 'seascape'],
    autoTags: ['ocean', 'blue hour', 'rocks'],
    exif: { body: 'Sony A7R V', lens: 'Sony FE 16-35mm f/2.8 GM', focal: '18mm', aperture: 'f/11', shutter: '30s', iso: '64', flash: 'Off', date: 'Sep 28, 2026' },
    realPhoto: true, watermark: false, likes: 2210, ago: '1d', following: true, trending: true,
    comments: [{ userId: 'p1', text: 'Stunning as always' }],
  },
  {
    id: 'post5', authorId: 'u5', type: 'single', photos: ['kai-1'],
    caption: 'First roll through the new lens. Black and white suits this street.',
    location: 'Little Tokyo, Los Angeles', genre: 'Street', tags: ['bw', 'streetphotography'],
    autoTags: ['black & white', 'people', 'urban'],
    exif: { body: 'Leica Q2 Monochrom', lens: 'Summilux 28mm f/1.7', focal: '28mm', aperture: 'f/5.6', shutter: '1/250s', iso: '400', flash: 'Off', date: 'Oct 3, 2026' },
    realPhoto: false, watermark: false, likes: 96, ago: '2d', following: true, trending: false,
    comments: [],
  },
  {
    id: 'post6', authorId: 'p4', type: 'carousel', photos: ['leo-1', 'leo-2', 'leo-3'],
    caption: 'Mid-century in Silver Lake. Twilight exteriors are always worth it.',
    location: 'Silver Lake, Los Angeles', genre: 'Architecture', tags: ['interiors', 'twilight'],
    autoTags: ['interior', 'wide-angle', 'warm light'],
    exif: { body: 'Nikon Z7 II', lens: 'Nikkor Z 14-24mm f/2.8 S', focal: '16mm', aperture: 'f/8', shutter: '1/4s', iso: '100', flash: 'Off', date: 'Sep 30, 2026' },
    realPhoto: true, watermark: true, likes: 377, ago: '3d', following: false, trending: true,
    comments: [],
  },
]

// A portfolio is a list of albums: one post per shoot (a wedding, a grad session...) with
// several photos. Real posts come first, then generated albums titled from the person's specialties.
const ALBUM_TITLES = {
  Wedding: ['Nguyen–Park wedding', 'Garden wedding at Descanso', 'Courthouse elopement', 'Vineyard wedding in Malibu'],
  Portrait: ['Golden hour portraits', 'Studio portraits', 'Family session'],
  Engagement: ['Beach engagement', 'Downtown engagement'],
  Street: ['Rainy night downtown', 'Little Tokyo walk'],
  Event: ['Product launch party', 'Rooftop birthday'],
  Nightlife: ['Club night in Hollywood'],
  Graduation: ['UCLA class of 2026', 'USC grad session'],
  Headshots: ['Team headshots', 'Actor headshots'],
  Family: ['Family at the park'],
  'Real estate': ['Venice modern listing', 'Craftsman in Pasadena'],
  Product: ['Skincare launch', 'Coffee brand catalog'],
  Architecture: ['Downtown towers'],
  Landscape: ['Eastern Sierra', 'Big Sur coast'],
  Coaching: ['Long exposure workshop'],
  Meetups: ['Sunrise meetup'],
  Quinceañera: ['Sofia’s quinceañera'],
  Editorial: ['Editorial: monochrome'],
}
const SHUTTERS = ['1/250s', '1/500s', '1/125s', '1/1000s', '1/60s']
const ISOS = ['100', '200', '400', '800', '1600']
const MONTHS = ['Sep 2026', 'Aug 2026', 'Jul 2026', 'Jun 2026', 'May 2026']

// Small variations per photo so an album doesn't show identical settings on every frame.
const vary = (exif, i) => (i === 0 ? exif : { ...exif, shutter: SHUTTERS[(i + 1) % SHUTTERS.length], iso: ISOS[(i + 2) % ISOS.length] })

export const galleryFor = (personId) => {
  const person = getPerson(personId)
  const real = posts
    .filter((p) => p.authorId === personId)
    .map((p) => ({
      id: p.id, title: p.caption.split('.')[0], location: p.location, date: p.exif.date, type: p.type,
      photos: p.photos.map((seed, i) => ({ seed, exif: vary(p.exif, i) })),
      genre: p.genre, tags: p.tags, autoTags: p.autoTags, caption: p.caption, realPhoto: p.realPhoto,
    }))
  const gear = person.gear || { bodies: ['Camera'], lenses: ['50mm f/1.8'] }
  const specialties = person.specialties || ['Portrait']
  const generated = Array.from({ length: 5 }, (_, a) => {
    const genre = specialties[a % specialties.length]
    const titles = ALBUM_TITLES[genre] || [`${genre} session`]
    const lens = gear.lenses[a % gear.lenses.length]
    const exif = {
      body: gear.bodies[a % gear.bodies.length], lens,
      focal: (lens.match(/(\d+)(?:-\d+)?mm/) || [, '50'])[1] + 'mm',
      aperture: (lens.match(/f\/[\d.]+/) || ['f/2.8'])[0],
      shutter: SHUTTERS[a % SHUTTERS.length], iso: ISOS[a % ISOS.length], flash: 'Off', date: MONTHS[a],
    }
    const count = 2 + ((personId.charCodeAt(1) + a * 3) % 5) // 2–6 photos
    return {
      id: `${personId}-album-${a}`, title: titles[Math.floor(a / specialties.length) % titles.length],
      location: person.city, date: MONTHS[a], type: 'photo',
      photos: Array.from({ length: count }, (_, i) => ({ seed: `${personId}-album-${a}-${i}`, exif: vary(exif, i) })),
      genre, tags: [], autoTags: [], caption: null, realPhoto: false,
    }
  })
  return [...real, ...generated]
}

// My own posts (shown on my profile). One is held in the AI-review queue.
export const myPosts = [
  { id: 'mine1', seed: 'alex-1', status: 'published' },
  { id: 'mine2', seed: 'alex-2', status: 'published' },
  { id: 'mine3', seed: 'alex-3', status: 'under_ai_review', aiScore: 0.87 },
  { id: 'mine4', seed: 'alex-4', status: 'published' },
  { id: 'mine5', seed: 'alex-5', status: 'published' },
  { id: 'mine6', seed: 'alex-6', status: 'published' },
]

export const collections = [
  { id: 'col1', name: 'Wedding inspo', count: 24, cover: 'maya-2' },
  { id: 'col2', name: 'Night street', count: 11, cover: 'jonah-1' },
  { id: 'col3', name: 'Grad poses', count: 7, cover: 'priya-ba' },
]

export const discoverCards = [
  { id: 'd1', authorId: 'p1', category: 'Wedding', tags: ['warm tones', 'golden hour', 'backlit'], reason: 'Because you liked warm, backlit couple shots', exif: '85mm · f/1.8 · 1/800s · ISO 100' },
  { id: 'd2', authorId: 'p2', category: 'Event', tags: ['moody', 'low-light', 'candid'], reason: 'Because you liked moody, low-light shots', exif: '23mm · f/1.4 · 1/60s · ISO 3200' },
  { id: 'd3', authorId: 'p6', category: 'Wedding', tags: ['candid', 'documentary', 'dance floor'], reason: 'Matches your taste for candid moments', exif: '28mm · f/2 · 1/200s · ISO 1600' },
  { id: 'd4', authorId: 'p4', category: 'Real estate', tags: ['architecture', 'wide-angle', 'symmetry'], reason: 'Something new: architecture', exploration: true, exif: '14mm · f/8 · 1/125s · ISO 64' },
  { id: 'd5', authorId: 'p7', category: 'Headshots', tags: ['moody', 'studio', 'editorial'], reason: 'Moody like the shots you saved, but in studio', exif: '50mm · f/2 · 1/160s · ISO 200' },
  { id: 'd6', authorId: 'p3', category: 'Graduation', tags: ['soft light', 'outdoor', 'bright'], reason: 'Matches your taste for soft natural light', exif: '50mm · f/1.4 · 1/1000s · ISO 200' },
  { id: 'd7', authorId: 'p1', category: 'Portrait', tags: ['golden hour', 'warm tones', 'portrait'], reason: 'Because you liked golden-hour portraits', exif: '35mm · f/1.4 · 1/1250s · ISO 100' },
  { id: 'd8', authorId: 'p5', category: 'Coaching', tags: ['long exposure', 'ocean', 'blue hour'], reason: 'Something new: learn long exposure', exploration: true, exif: '18mm · f/11 · 30s · ISO 64' },
  { id: 'd9', authorId: 'p6', category: 'Event', tags: ['candid', 'warm tones', 'family'], reason: 'Popular with people who like Maya Chen', exif: '85mm · f/1.2 · 1/500s · ISO 400' },
  { id: 'd10', authorId: 'p2', category: 'Portrait', tags: ['film-style', 'street portrait', 'low-light'], reason: 'Because you liked moody, low-light shots', exif: '56mm · f/1.2 · 1/125s · ISO 1600' },
  { id: 'd11', authorId: 'p7', category: 'Portrait', tags: ['moody', 'editorial', 'soft light'], reason: 'Matches your taste for moody portraits', exif: '90mm · f/2.8 · 1/200s · ISO 100' },
  { id: 'd12', authorId: 'p4', category: 'Product', tags: ['product', 'studio', 'minimal'], reason: 'Something new: product', exploration: true, exif: '105mm · f/11 · 1/160s · ISO 100' },
  { id: 'd13', authorId: 'p3', category: 'Headshots', tags: ['bright', 'clean', 'corporate'], reason: 'Highly rated for headshots near you', exif: '70mm · f/4 · 1/200s · ISO 100' },
  { id: 'd14', authorId: 'p1', category: 'Wedding', tags: ['candid', 'warm tones', 'ceremony'], reason: 'Because you liked warm, candid moments', exif: '35mm · f/2 · 1/400s · ISO 320' },
].map((c) => ({ ...c, seeds: [1, 2, 3].map((n) => `${c.id}-${c.authorId}-${n}`) }))

export const conversations = [
  {
    id: 'c1', kind: 'booking', bookingId: 'b1', memberIds: ['p1'],
    messages: [
      { from: 'p1', text: 'Hi Alex! Thanks for booking. Can you send me the venue address and a rough timeline?', time: 'Sep 21' },
      { from: 'u0', text: 'Of course, ceremony is at 4pm at Malibu Rocky Oaks. I’ll send the full run sheet this week.', time: 'Sep 21' },
      { from: 'p1', sharedPostId: 'post1', text: 'Something like this for the couple portraits?', time: 'Sep 22' },
      { from: 'u0', text: 'Yes exactly that!!', time: 'Sep 22' },
    ],
  },
  {
    id: 'c2', kind: 'inquiry', memberIds: ['p2'],
    messages: [
      { from: 'u0', text: 'Hey Jonah, do you shoot product launches? About 80 guests, evening event.', time: 'Oct 5' },
      { from: 'p2', text: 'Yep! Event Coverage package is a good fit. What date are you thinking?', time: 'Oct 5' },
    ],
  },
  {
    id: 'c3', kind: 'group', title: 'Weekend photo walk', memberIds: ['u5', 'u6'],
    messages: [
      { from: 'u5', text: 'Little Tokyo Saturday 7am?', time: 'Oct 6' },
      { from: 'u6', text: 'I’m in. Bringing the 28mm.', time: 'Oct 6' },
      { from: 'u5', sharedPostId: 'post5', text: 'Last week’s roll', time: 'Oct 6' },
    ],
  },
]

export const bookingSteps = ['requested', 'confirmed', 'in_progress', 'delivered', 'completed']

export const statusLabels = {
  requested: 'Requested',
  countered: 'Counter offer',
  accepted: 'Accepted · pay deposit',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
  declined: 'Declined',
  cancelled_by_client: 'Cancelled by you',
  cancelled_by_provider: 'Cancelled by provider',
  disputed: 'Disputed',
  refunded: 'Refunded',
}

export const bookings = [
  {
    id: 'b1', providerId: 'p1', packageId: 'maya-wedding', addonIds: ['second'],
    date: 'Jun 18, 2027', time: '2:00 PM', location: 'Malibu Rocky Oaks', travelFee: 0,
    total: 5100, depositPaid: true, status: 'confirmed', policy: 'moderate', conversationId: 'c1',
    history: [
      { status: 'requested', at: 'Sep 20, 2026' },
      { status: 'accepted', at: 'Sep 20, 2026' },
      { status: 'confirmed', at: 'Sep 21, 2026' },
    ],
  },
  {
    id: 'b2', providerId: 'p3', packageId: 'priya-grad', addonIds: ['look'],
    date: 'Sep 26, 2026', time: '5:00 PM', location: 'UCLA campus', travelFee: 0,
    total: 490, depositPaid: true, status: 'delivered', policy: 'flexible', deliveryExpiresDays: 23,
    history: [
      { status: 'requested', at: 'Sep 2, 2026' },
      { status: 'confirmed', at: 'Sep 3, 2026' },
      { status: 'in_progress', at: 'Sep 26, 2026' },
      { status: 'delivered', at: 'Oct 4, 2026' },
    ],
  },
  {
    id: 'b3', providerId: 'p2', packageId: 'jonah-street', addonIds: [],
    date: 'Aug 30, 2026', time: '6:30 PM', location: 'Arts District', travelFee: 0,
    total: 220, depositPaid: true, status: 'completed', policy: 'flexible', myReview: null, theirReviewSubmitted: true,
    history: [
      { status: 'requested', at: 'Aug 20, 2026' },
      { status: 'confirmed', at: 'Aug 20, 2026' },
      { status: 'in_progress', at: 'Aug 30, 2026' },
      { status: 'delivered', at: 'Sep 3, 2026' },
      { status: 'completed', at: 'Sep 5, 2026' },
    ],
  },
  {
    id: 'b4', providerId: 'p4', packageId: 'leo-listing', addonIds: ['twilight'],
    date: 'Oct 21, 2026', time: '4:00 PM', location: 'Echo Park', travelFee: 24,
    total: 499, depositPaid: false, status: 'requested', policy: 'strict', expiresIn: '41h',
    history: [{ status: 'requested', at: 'Oct 6, 2026' }],
  },
]

// What I see as a provider: incoming requests from clients.
export const incomingRequests = [
  {
    id: 'r1', client: { name: 'Jordan Lee', avatar: avatar(52), rating: 4.9, reviews: 6, verified: true },
    packageName: 'Graduation Session', date: 'Oct 24, 2026', time: '4:00 PM', location: 'UCLA campus',
    total: 380, note: 'Two outfits, would love some shots by Royce Hall.', expiresIn: '31h', status: 'requested',
  },
  {
    id: 'r2', client: { name: 'Sam Patel', avatar: avatar(60), rating: 4.2, reviews: 3, verified: false },
    packageName: 'Headshots', date: 'Oct 15, 2026', time: '10:00 AM', location: 'Culver City office',
    total: 640, note: 'Team of 4 people, need consistent backgrounds.', expiresIn: '9h', status: 'requested',
  },
  {
    id: 'r3', client: { name: 'Taylor Brooks', avatar: avatar(9), rating: null, reviews: 0, verified: false },
    packageName: 'Street Portrait Walk', date: 'Nov 2, 2026', time: '7:00 AM', location: 'Arts District',
    total: 180, note: 'First time booking a photographer!', expiresIn: '46h', status: 'requested',
  },
]

export const myPackages = [
  { id: 'mp1', name: 'Graduation Session', priceType: 'fixed', price: 380, hours: 1.5, editedPhotos: 40, editingLevel: 'Natural', turnaroundDays: 10, depositPct: 50 },
  { id: 'mp2', name: 'Headshots', priceType: 'fixed', price: 160, hours: 0.5, editedPhotos: 8, editingLevel: 'Full retouch', turnaroundDays: 5, depositPct: 50 },
  { id: 'mp3', name: 'Street Portrait Walk', priceType: 'hourly', price: 120, hours: 1.5, editedPhotos: 20, editingLevel: 'Film-style', turnaroundDays: 7, depositPct: 50 },
]

// Day-of-month → calendar state for my provider calendar (October 2026).
export const myCalendar = {
  4: 'booked', 11: 'booked', 15: 'held', 18: 'blackout', 19: 'blackout', 24: 'held', 25: 'booked',
}

export const cameraRoll = Array.from({ length: 15 }, (_, i) => `roll-${i + 1}`)
