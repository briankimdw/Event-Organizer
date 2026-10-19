// Reusable field definitions for vertical configs (verticals/<slug>/config.js).
// Plain JS (shared with the Expo app): no React, no DOM.
//
// A field describes one key in a provider's or package's `attributes` JSON and
// drives both the edit form (components/verticals/PackageFields) and the
// read-only display (AttributeList, card lines):
//   { key, label, type, ...options }
//   type 'number'  -> min, max, step, unit ('guests'), short ('Up to {v} guests')
//   type 'text'    -> placeholder, maxLength
//   type 'select'  -> options
//   type 'tags'    -> options (suggestions), custom: true to allow free text, max
//   type 'boolean' -> short (shown only when true, e.g. 'Staff included')
// options: strings, or { value, label } when the stored value differs from the label
// (the JSON Schemas use lowercase enums like 'gluten-free').
// `short` is the compact form used on cards and package rows; `{v}` is the value.
// Keys must match the vertical's JSON Schema in supabase/seed.sql (they use
// additionalProperties: false, so unknown keys are rejected).
//
// Two package keys are not attributes but columns on `packages` (the API maps them):
//   min_quantity / max_quantity: how many guests or pieces a package can be booked for.

const o = (value, label) => ({ value, label })

export const DIETARY_OPTIONS = [
  o('vegetarian', 'Vegetarian'), o('vegan', 'Vegan'), o('gluten-free', 'Gluten-free'), o('dairy-free', 'Dairy-free'),
  o('nut-free', 'Nut-free'), o('halal', 'Halal'), o('kosher', 'Kosher'),
]
export const SERVICE_STYLE_OPTIONS = [
  o('buffet', 'Buffet'), o('plated', 'Plated'), o('family-style', 'Family style'), o('stations', 'Stations'),
  o('passed-appetizers', 'Passed appetizers'), o('food-truck', 'Food truck'), o('drop-off', 'Drop-off'),
]
export const CUISINES = [
  'American', 'BBQ', 'Mexican', 'Italian', 'Mediterranean', 'Indian', 'Chinese', 'Japanese', 'Korean', 'Thai',
  'Vietnamese', 'Filipino', 'Middle Eastern', 'French', 'Southern', 'Caribbean', 'Latin', 'Fusion',
]
export const LANGUAGES = ['English', 'Spanish', 'Korean', 'Mandarin', 'Tagalog', 'Vietnamese', 'French', 'Hindi']

export const dietary = { key: 'dietary', label: 'Dietary options', type: 'tags', options: DIETARY_OPTIONS }
export const cuisines = { key: 'cuisines', label: 'Cuisines', type: 'tags', options: CUISINES, custom: true, max: 15 }
export const specialties = { key: 'specialties', label: 'Specialties', type: 'tags', options: [], custom: true, max: 10, placeholder: 'Add a specialty' }
export const languages = { key: 'languages', label: 'Languages', type: 'tags', options: LANGUAGES, custom: true, max: 10 }
export const includes = { key: 'includes', label: 'What’s included', type: 'tags', options: [], custom: true, max: 20, placeholder: 'Add an item' }
export const menu = { key: 'menu', label: 'Menu', type: 'tags', options: [], custom: true, max: 30, placeholder: 'Add a dish' }

// Package columns (not attributes): guest / piece limits.
export const minGuests = { key: 'min_quantity', label: 'Minimum guests', type: 'number', min: 1, max: 100000, unit: 'guests', short: 'Min {v} guests' }
export const maxGuests = { key: 'max_quantity', label: 'Maximum guests', type: 'number', min: 1, max: 100000, unit: 'guests', short: 'Up to {v} guests' }
export const minPieces = { key: 'min_quantity', label: 'Minimum order', type: 'number', min: 1, max: 100000, unit: 'pieces', short: 'Min {v}' }
export const maxPieces = { key: 'max_quantity', label: 'Maximum order', type: 'number', min: 1, max: 100000, unit: 'pieces', short: 'Up to {v}' }

// Filters (Search) that several verticals share. type 'guests' filters on package
// guest limits and provider capacity; type 'tags' / 'select' on a provider attribute.
export const guestsFilter = { key: 'guests', label: 'Guests', type: 'guests', options: [25, 50, 100, 200] }
export const dietaryFilter = { key: 'dietary', label: 'Dietary', type: 'tags', attr: 'dietary', options: DIETARY_OPTIONS }
