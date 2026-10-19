// The vertical registry. photomatch has ONE vertical now, `photography` ("Photo &
// video", see catalog.js), but screens stay generic: they ask the registry for wording,
// fields and price types instead of hard-coding them, so a vertical could come back
// later. Plain JS, shared with the Expo app: no React, no DOM, no browser storage.
//
//   verticalMeta(slug?, dbRow?)  catalog entry merged with fallbacks (never undefined);
//                               null / 'videography' -> photography
//   verticalConfig(slug?)       { priceTypes, defaultPriceType, packageFields, providerFields,
//                                 cardKeys, packageKeys, filters, quantity, post }
//   priceSuffix(type, pkg?)     '/hr', '' (and ' / person', ' each', ' / day' for old packages)
//   quantityFor(pkg, slug)      null for photo & video packages (kept for old per-person / per-item rows)
//   optionsOf(field), optionLabel(field, value)  options as [{ value, label }]
//   attributeLines(fields, attrs, keys?)  ['300 edited', '14-day turnaround'] (compact)
//   attributeEntries(fields, attrs)       [{ key, label, value, type }] for detail lists
//   cleanAttributes(fields, attrs)        attrs without empty values, numbers coerced (schemas reject nulls)
//   matchesFilters(provider, values, slug) Search filters that run on the client (none for photography)
//   nounFor(slug, n) / countLabel(n, slug) 'photographer' / '3 photographers'
//   lowerFirst(text)            'Photographers' -> 'photographers' (mid-sentence names)
//   sessionNoun(slug)           'shoot'
//   deliversMedia(slug)         true (bookings end with a delivery gallery)
//   postConfig(slug)            the post composer's wording: { noun, headline, prompts, title,
//                               caption, showCamera, beforeAfter }
//
// Removed in the photography pivot (2026-10-18; the old file is in
// archive/event-platform/frontend/src/verticals/index.js):
//   - the 17 other per-vertical configs (verticals/<slug>/config.js) and fields.js
//   - occasionsFor() now always returns [] (occasions were archived); kept for old imports
//   - GENERIC now uses photography's wording ('photographer'), not 'vendor'
import { VERTICALS, PHOTO_VERTICAL, getVertical, normalizeVertical, verticalOfService } from './catalog.js'
import photography from './photography/config.js'

export * from './catalog.js'

const CONFIGS = { photography }

// ---------------------------------------------------------------------------
// Vertical metadata
// ---------------------------------------------------------------------------

// Fallback for slugs catalog.js doesn't know (rows from the old multi-vendor database;
// the API filters those out, so this is only a safety net).
export const GENERIC = {
  slug: null, name: 'Photo & video', noun: 'photographer', plural: 'Photographers', pluralLong: 'Photographers & videographers',
  icon: 'Camera', tint: '#64748b', group: 'capture', priceUnit: 'session', concurrent: false, visual: true, tagline: '', services: [],
}

const titleCase = (s = '') => s.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** The catalog entry for a vertical slug (null = photography), merged with fallbacks; `row` (a service_categories row) names unknown ones. */
export function verticalMeta(slug = null, row = null) {
  const known = getVertical(slug || PHOTO_VERTICAL)
  if (known) return { ...known, known: true }
  const name = row?.name || titleCase(slug)
  return { ...GENERIC, slug, name, noun: name.toLowerCase(), plural: name, pluralLong: name, known: false }
}

/** The vertical a provider belongs to: always 'photography' for photo & video listings. */
export const verticalSlugOf = (provider) =>
  normalizeVertical(provider?.vertical) || (provider?.categorySlugs || []).map((s) => verticalOfService(s)?.slug).find(Boolean) || PHOTO_VERTICAL

// "Photographers" -> "photographers"; acronyms stay as they are.
export const lowerFirst = (s = '') => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)

/** 'photographer' (n = 1) or 'photographers'. */
export const nounFor = (slug, n = 1) => {
  const m = verticalMeta(slug)
  return n === 1 ? m.noun : lowerFirst(m.plural)
}

/** '1 photographer', '3 photographers'. */
export const countLabel = (n, slug) => `${n} ${nounFor(slug, n)}`

/** What a booking is called: 'shoot' (photo & video). Other slugs (old data) say 'event'. */
export const sessionNoun = (slug) => (!slug || getVertical(slug) ? 'shoot' : 'event')

/** Does this vertical hand over photos / video at the end (a delivery gallery)? True for photo & video. */
export const deliversMedia = (slug) => !slug || !!getVertical(slug)

/** Capitalized noun, e.g. for badges: 'Photographer'. */
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
// The price types photo & video packages use (the package editor offers only these; the
// others above stay so old packages from the multi-vendor database still display).
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
export function verticalConfig(slug = null) {
  if (configCache.has(slug)) return configCache.get(slug)
  const meta = verticalMeta(slug)
  const c = CONFIGS[getVertical(slug || PHOTO_VERTICAL)?.slug] || {}
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

/** The title of a post saved without one: 'Wedding', else 'New post'. (`occasion` and `slug` are ignored now; kept for old callers.) */
export const autoPostTitle = ({ service = null } = {}) => service || 'New post'

/** @deprecated Occasions were archived: always []. */
export const occasionsFor = () => []

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

/** values: { [filter key]: value }. Unknown / empty values pass. (Photography has no attribute filters today.) */
export function matchesFilters(provider, values = {}, slug = null) {
  const filters = verticalConfig(slug || verticalSlugOf(provider)).filters
  return filters.every((f) => {
    const v = values[f.key]
    if (isEmpty(v)) return true
    const attr = provider.attributes?.[f.attr || f.key]
    if (f.type === 'tags') return [].concat(v).every((t) => [].concat(attr || []).includes(t))
    return attr === v
  })
}

/** Verticals in catalog order, each with its config: handy for pickers. */
export const allVerticals = () => VERTICALS.map((v) => ({ ...v, config: verticalConfig(v.slug) }))
