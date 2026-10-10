// Cakes & desserts: priced per item (a cake, a dozen) or per serving.
import { dietary, dietaryFilter, maxPieces, minPieces, specialties } from '../fields.js'

export default {
  priceTypes: ['per_item', 'per_person', 'fixed', 'quote'],
  packageFields: [
    minPieces,
    maxPieces,
    { key: 'servings', label: 'Serves', type: 'number', min: 1, max: 5000, unit: 'people', short: 'Serves {v}' },
    { key: 'tiers', label: 'Tiers', type: 'number', min: 1, max: 10, unit: 'tiers', short: '{v} tiers' },
    { key: 'flavors', label: 'Flavors', type: 'tags', options: ['Vanilla', 'Chocolate', 'Red velvet', 'Lemon', 'Carrot', 'Strawberry'], custom: true, max: 20 },
    dietary,
    { key: 'delivery_included', label: 'Delivery included', type: 'boolean', short: 'Delivery included' },
    { key: 'setup_included', label: 'Setup included', type: 'boolean', short: 'Setup included' },
  ],
  providerFields: [
    specialties,
    dietary,
    { key: 'delivery', label: 'Delivers', type: 'boolean', short: 'Delivers' },
    { key: 'tastings', label: 'Offers tastings', type: 'boolean', short: 'Tastings' },
  ],
  cardKeys: ['specialties'],
  packageKeys: ['servings', 'tiers'],
  filters: [dietaryFilter],
  quantity: { per_item: { label: 'Items', default: 1, max: 500 }, per_person: { label: 'Servings', default: 50 } },
}
