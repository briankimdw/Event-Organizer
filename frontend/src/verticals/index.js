// The vertical registry: the shared catalog (catalog.js) plus per-vertical
// configs (verticals/<slug>/config.js) for verticals that need more than catalog
// data: package/provider attribute fields, card detail lines, Search filters,
// price types and booking quantities. Every vertical works without a config
// (the generic fallback below), including ones the database knows about but
// catalog.js doesn't.
//
// Plain JS, shared with the Expo app: no React, no DOM, no browser storage.
//
//   verticalMeta(slug, dbRow?)  catalog entry merged with fallbacks (never undefined)
//   verticalConfig(slug)        { priceTypes, defaultPriceType, packageFields, providerFields,
//                                 cardKeys, packageKeys, filters, quantity, post }
//   priceSuffix(type, pkg?)     ' / person', ' each', ' / day', '/hr', ''
//   quantityFor(pkg, slug)      null, or { label, min, max, default } for per-guest / per-item packages
//   optionsOf(field), optionLabel(field, value)  options as [{ value, label }]
//   attributeLines(fields, attrs, keys?)  ['Up to 200 guests', 'Buffet', ...] (compact)
//   attributeEntries(fields, attrs)       [{ key, label, value, type }] for detail lists
//   cleanAttributes(fields, attrs)        attrs without empty values, numbers coerced (schemas reject nulls)
//   matchesFilters(provider, values, slug) Search filters that run on the client
//   nounFor(slug, n) / countLabel(n, slug) 'caterer' / '3 caterers' ('vendor' for all verticals)
//   lowerFirst(text)            'Catering' -> 'catering' but 'DJs & live music' unchanged (mid-sentence names)
//   sessionNoun(slug)           'shoot' for photo/video, 'session' for wellness, else 'event'
//   deliversMedia(slug)         true for photo/video (delivery gallery); others are just marked done
//   postConfig(slug)            the post composer's wording per vertical: { noun, headline, prompts, title,
//                               caption, showCamera, beforeAfter } (config.js `post`, generic fallback)
//   occasionsFor(slug)          OCCASIONS, the ones that need this vertical first
import { OCCASIONS, VERTICALS, getVertical, verticalOfService } from './catalog.js'
import photography from './photography/config.js'
import videography from './videography/config.js'
import venue from './venue/config.js'
import catering from './catering/config.js'
import privateChef from './private-chef/config.js'
import cakes from './cakes/config.js'
import bar from './bar/config.js'
import music from './music/config.js'
import florals from './florals/config.js'
import hairMakeup from './hair-makeup/config.js'
import rentals from './rentals/config.js'
import transportation from './transportation/config.js'
import entertainment from './entertainment/config.js'
import staffing from './staffing/config.js'
import decor from './decor/config.js'
import planning from './planning/config.js'
import officiant from './officiant/config.js'
import wellness from './wellness/config.js'

export * from './catalog.js'

const CONFIGS = {
  photography, videography, venue, catering, 'private-chef': privateChef, cakes, bar, music, florals,
  'hair-makeup': hairMakeup, rentals, transportation, entertainment, staffing, decor, planning, officiant, wellness,
}

// ---------------------------------------------------------------------------
// Vertical metadata
// ---------------------------------------------------------------------------

// Used for "all verticals" wording and for verticals catalog.js doesn't know.
export const GENERIC = {
  slug: null, name: 'All services', noun: 'vendor', plural: 'Vendors', icon: 'Store', tint: '#64748b', group: 'help',
  priceUnit: 'session', concurrent: false, visual: true, tagline: '', services: [],
}

const titleCase = (s = '') => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** The catalog entry for a vertical slug, merged with fallbacks; `row` (a service_categories row) fills unknown ones. */
export function verticalMeta(slug, row = null) {
  const known = slug ? getVertical(slug) : null
  if (known) return { ...known, known: true }
  if (!slug) return { ...GENERIC, known: false }
  const name = row?.name || titleCase(slug)
  return { ...GENERIC, slug, name, noun: name.toLowerCase(), plural: name, known: false }
}

/** The vertical a provider belongs to, from its `vertical` slug or its service slugs. Defaults to photography. */
export const verticalSlugOf = (provider) =>
  provider?.vertical || (provider?.categorySlugs || []).map((s) => verticalOfService(s)?.slug).find(Boolean) || 'photography'

// "Photographers" -> "photographers", but "DJs & musicians" stays as is.
export const lowerFirst = (s = '') => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

/** 'caterer' (n = 1) or 'caterers'; slug null = any vertical ('vendor' / 'vendors'). */
export const nounFor = (slug, n = 1) => {
  const m = verticalMeta(slug)
  return n === 1 ? m.noun : lowerFirst(m.plural)
}

/** '1 caterer', '3 caterers', '0 vendors'. */
export const countLabel = (n, slug) => `${n} ${nounFor(slug, n)}`

/** What a booking is called: 'shoot', 'session' or 'event'. */
export const sessionNoun = (slug) => (slug === 'photography' || slug === 'videography' ? 'shoot' : slug === 'wellness' ? 'session' : 'event')

/** Does this vertical hand over photos / video at the end (a delivery gallery)? Others just "mark done". */
export const deliversMedia = (slug) => slug === 'photography' || slug === 'videography'

/** Capitalized noun, e.g. for badges: 'Caterer'. */
export const nounTitle = (slug) => {
  const n = verticalMeta(slug).noun
  return n ? n[0].toUpperCase() + n.slice(1) : ''
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

// price_type enum values. per_person / per_item / daily need the all-verticals migration.
export const PRICE_TYPES = {
  fixed: { label: 'Fixed price', short: 'Fixed' },
  hourly: { label: 'Per hour', short: 'Hourly' },
  per_person: { label: 'Per person', short: 'Per person' },
  per_item: { label: 'Per item', short: 'Per item' },
  daily: { label: 'Per day', short: 'Daily' },
  quote: { label: 'Custom quote', short: 'Quote' },
}
// catalog.js priceUnit -> the price type it implies.
const UNIT_TO_TYPE = { session: 'fixed', hour: 'hourly', person: 'per_person', item: 'per_item', day: 'daily' }
// Price types today's database (before the all-verticals migration) accepts.
export const LEGACY_PRICE_TYPES = ['fixed', 'hourly', 'quote']

/** '/hr', ' / person', ' each' (or ' / centerpiece' when the package names its unit), ' / day', ''. */
export function priceSuffix(type, pkg = null) {
  const unit = pkg?.attributes?.unit_label
  if (type === 'hourly') return '/hr'
  if (type === 'per_person') return ' / person'
  if (type === 'per_item') return unit ? ` / ${unit}` : ' each'
  if (type === 'daily') return ' / day'
  return ''
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const configCache = new Map()

/** A vertical's config with every key filled in (generic fallback for verticals without a config file). */
export function verticalConfig(slug) {
  if (configCache.has(slug)) return configCache.get(slug)
  const meta = verticalMeta(slug)
  const c = CONFIGS[slug] || {}
  const defaultPriceType = UNIT_TO_TYPE[meta.priceUnit] || 'fixed'
  const priceTypes = c.priceTypes || [...new Set([defaultPriceType, 'fixed', 'hourly', 'quote'])]
  const config = {
    priceTypes,
    defaultPriceType: priceTypes[0] || defaultPriceType,
    packageFields: c.packageFields || [],
    providerFields: c.providerFields || [],
    cardKeys: c.cardKeys || [],
    packageKeys: c.packageKeys || [],
    filters: c.filters || [],
    quantity: c.quantity || {},
    post: { ...POST_DEFAULTS, ...(c.post || {}) },
  }
  configCache.set(slug, config)
  return config
}

// ---------------------------------------------------------------------------
// Posting (portfolio posts)
// ---------------------------------------------------------------------------

// What the post composer says when a vertical's config has no `post` block.
// showCamera: offer EXIF camera settings ("shot on"); beforeAfter: offer before / after posts.
const POST_DEFAULTS = {
  noun: 'photo',
  headline: 'Show your work',
  prompts: ['A recent event', 'Your setup', 'Behind the scenes'],
  title: 'e.g. Smith wedding',
  caption: 'The story behind it: the event, the people, the details…',
  showCamera: false,
  beforeAfter: false,
}

/** The post composer's wording and options for a vertical. */
export const postConfig = (slug) => verticalConfig(slug).post

/** The title of a post saved without one: 'Buffet · Wedding', 'Buffet', else the vertical's name. */
export const autoPostTitle = ({ service = null, occasion = null, slug = null } = {}) =>
  [service, occasion].filter(Boolean).join(' · ') || verticalMeta(slug).name || 'New post'

/** Every occasion, the ones that list this vertical in `needs` first (catalog order otherwise). */
export const occasionsFor = (slug) => [...OCCASIONS.filter((o) => o.needs.includes(slug)), ...OCCASIONS.filter((o) => !o.needs.includes(slug))]

// Generic quantity labels when a vertical's config doesn't name them.
// (daily packages are charged once per booked day: the dates picked are the days.)
const QUANTITY_DEFAULTS = {
  per_person: { label: 'Guests', default: 1, max: 2000 },
  per_item: { label: 'Items', default: 1, max: 1000 },
}

/**
 * How many guests / pieces a package is booked for, or null when the price
 * doesn't scale (fixed, hourly, daily, quote). min/max come from the package's
 * min_quantity / max_quantity columns (pkg.minQuantity / maxQuantity), else the
 * config's maxKey attribute (e.g. a rental's `available`).
 */
export function quantityFor(pkg, slug) {
  const type = pkg?.priceType
  if (!QUANTITY_DEFAULTS[type]) return null
  const q = { ...QUANTITY_DEFAULTS[type], ...(verticalConfig(slug).quantity[type] || {}) }
  const a = pkg.attributes || {}
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const min = Math.max(1, num(pkg.minQuantity) ?? 1)
  const capped = num(pkg.maxQuantity) ?? (q.maxKey ? num(a[q.maxKey]) : null)
  const max = Math.max(min, capped ?? q.max)
  const unit = type === 'per_item' && a.unit_label ? a.unit_label : null
  const label = unit ? `${unit[0].toUpperCase()}${unit.slice(1)}s` : q.label
  return { type, label, min, max, default: Math.min(max, Math.max(min, q.default ?? min)) }
}

// ---------------------------------------------------------------------------
// Attributes (display + forms)
// ---------------------------------------------------------------------------

/** A field's options as [{ value, label }] (configs may list plain strings). */
export const optionsOf = (field) => (field.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }))
/** The label for a stored value ('gluten-free' -> 'Gluten-free'); unknown values show as stored. */
export const optionLabel = (field, value) => optionsOf(field).find((o) => o.value === value)?.label ?? String(value)

const isEmpty = (v) => v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v))
const fmtNumber = (n) => Number(n).toLocaleString('en-US')
// Unit words used by the configs: people -> person, hours -> hour, guests -> guest... (min, staff stay).
const SINGULAR = { people: 'person', staff: 'staff', min: 'min' }
export const singular = (w) => SINGULAR[w] ?? (/ies$/.test(w) ? w.replace(/ies$/, 'y') : /[^s]s$/.test(w) ? w.slice(0, -1) : w)

/** One field's value as text ('Up to 200 guests', 'Buffet, Plated', 'Setup included'), or null. */
export function formatField(field, value, { short = true } = {}) {
  if (isEmpty(value)) return null
  if (field.type === 'boolean') return short ? field.short || field.label : 'Yes'
  if (field.type === 'tags') return [].concat(value).map((v) => optionLabel(field, v)).join(', ')
  if (field.type === 'select') return optionLabel(field, value)
  if (field.type === 'number') {
    const v = fmtNumber(value)
    const one = Number(value) === 1
    // "1 people" -> "1 person", "{v} tiers" -> "1 tier" (the word right after the number).
    if (short && field.short) return field.short.replace(/\{v\}( (\w+))?/, (m, sp, word) => (word ? `${v} ${one ? singular(word) : word}` : v))
    return field.unit ? `${v} ${one ? singular(field.unit) : field.unit}` : v
  }
  return String(value)
}

/** Compact lines for cards / package rows. keys: limit to these attribute keys, in this order. */
export function attributeLines(fields = [], attrs = {}, keys = null) {
  const list = keys ? keys.map((k) => fields.find((f) => f.key === k)).filter(Boolean) : fields
  return list.map((f) => formatField(f, attrs?.[f.key])).filter(Boolean)
}

/** [{ key, label, value, type }] for every field with a value (detail lists). */
export function attributeEntries(fields = [], attrs = {}) {
  return fields
    .map((f) => ({ key: f.key, label: f.label, type: f.type, value: formatField(f, attrs?.[f.key], { short: false }), raw: attrs?.[f.key] }))
    .filter((e) => e.value != null)
}

/** attrs without empty values, with numbers coerced; keys without a field are kept as they are. */
export function cleanAttributes(fields = [], attrs = {}) {
  const out = { ...(attrs || {}) }
  for (const f of fields) {
    let v = out[f.key]
    if (f.type === 'number' && v !== '' && v != null) {
      v = Number(v)
      if (!Number.isNaN(v)) {
        if (f.min != null) v = Math.max(f.min, v)
        if (f.max != null) v = Math.min(f.max, v)
        if (!f.step || Number.isInteger(f.step)) v = Math.round(v)
      }
    }
    if (f.type === 'text' && typeof v === 'string') v = v.trim()
    if (f.type === 'tags' && Array.isArray(v)) v = [...new Set(v.map((t) => String(t).trim()).filter(Boolean))].slice(0, f.max || 50)
    if (f.type === 'boolean') v = v ? true : undefined
    if (isEmpty(v)) delete out[f.key]
    else out[f.key] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Search filters (client side)
// ---------------------------------------------------------------------------

// Can this provider host / serve `guests` people? Capacity and package guest
// limits must fit; providers with no limits anywhere count as a match.
function fitsGuests(provider, guests) {
  const a = provider.attributes || {}
  const cap = Math.max(Number(a.capacity_standing) || 0, Number(a.capacity_seated) || 0, Number(a.max_guests) || 0)
  if (cap && cap < guests) return false
  if (Number(a.min_guests) > guests) return false
  const limited = (provider.packages || []).filter((p) => p.minQuantity != null || p.maxQuantity != null || p.attributes?.passengers != null)
  if (!limited.length) return true
  return limited.some((p) => guests >= Number(p.minQuantity ?? 0) && guests <= Number(p.maxQuantity ?? p.attributes?.passengers ?? Infinity))
}

/** values: { guests: 100, dietary: ['Vegan'], setting: 'Outdoor' }. Unknown / empty values pass. */
export function matchesFilters(provider, values = {}, slug = null) {
  const filters = verticalConfig(slug || verticalSlugOf(provider)).filters
  return filters.every((f) => {
    const v = values[f.key]
    if (isEmpty(v)) return true
    if (f.type === 'guests') return fitsGuests(provider, Number(v))
    const attr = provider.attributes?.[f.attr || f.key]
    if (f.type === 'tags') return [].concat(v).every((t) => [].concat(attr || []).includes(t))
    return attr === v
  })
}

/** Verticals in catalog order, each with its config: handy for pickers. */
export const allVerticals = () => VERTICALS.map((v) => ({ ...v, config: verticalConfig(v.slug) }))
