// Bar & drinks: usually per guest.
import { guestsFilter, maxGuests, menu, minGuests } from '../fields.js'

const BAR_TYPES = [
  { value: 'full-bar', label: 'Full bar' }, { value: 'beer-wine', label: 'Beer & wine' }, { value: 'cocktails', label: 'Cocktails' },
  { value: 'mocktails', label: 'Mocktails' }, { value: 'coffee', label: 'Coffee' },
]

export default {
  priceTypes: ['per_person', 'hourly', 'fixed', 'quote'],
  packageFields: [
    minGuests,
    maxGuests,
    { key: 'hours_included', label: 'Hours of service', type: 'number', min: 1, max: 24, unit: 'hours', short: '{v}h service' },
    { key: 'bartenders', label: 'Bartenders', type: 'number', min: 1, max: 50, unit: 'people', short: '{v} bartenders' },
    { key: 'signature_cocktails', label: 'Signature cocktails', type: 'number', min: 0, max: 20, unit: 'cocktails', short: '{v} signature cocktails' },
    { ...menu, label: 'Drinks menu', placeholder: 'Add a drink' },
    { key: 'alcohol_included', label: 'Drinks included (not just service)', type: 'boolean', short: 'Drinks included' },
    { key: 'glassware_included', label: 'Glassware included', type: 'boolean', short: 'Glassware included' },
  ],
  providerFields: [
    { key: 'bar_types', label: 'Bar types', type: 'tags', options: BAR_TYPES },
    { key: 'max_guests', label: 'Largest event', type: 'number', min: 1, max: 100000, unit: 'guests', short: 'Up to {v} guests' },
    { key: 'provides_alcohol', label: 'Provides the alcohol', type: 'boolean', short: 'Provides alcohol' },
    { key: 'liability_insured', label: 'Liability insured', type: 'boolean', short: 'Insured' },
  ],
  cardKeys: ['bar_types'],
  packageKeys: ['hours_included', 'max_quantity'],
  filters: [guestsFilter, { key: 'bar_types', label: 'Bar', type: 'tags', attr: 'bar_types', options: BAR_TYPES }],
  quantity: { per_person: { label: 'Guests', default: 50 } },
}
