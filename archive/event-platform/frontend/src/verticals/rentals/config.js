// Rentals: per item, sometimes per day.
import { minPieces } from '../fields.js'

export default {
  priceTypes: ['per_item', 'daily', 'fixed', 'quote'],
  packageFields: [
    { key: 'item', label: 'Item', type: 'text', placeholder: 'Chiavari chair, 20×30 tent…', maxLength: 80 },
    { key: 'available', label: 'How many you have', type: 'number', min: 1, max: 100000, unit: 'items', short: '{v} available' },
    minPieces,
    { key: 'dimensions', label: 'Size', type: 'text', placeholder: '60" round', maxLength: 80 },
    { key: 'color', label: 'Color', type: 'text', placeholder: 'Gold', maxLength: 40 },
    { key: 'delivery_included', label: 'Delivery included', type: 'boolean', short: 'Delivery included' },
    { key: 'setup_included', label: 'Setup included', type: 'boolean', short: 'Setup included' },
  ],
  providerFields: [
    { key: 'delivery', label: 'Delivers', type: 'boolean', short: 'Delivers' },
    { key: 'setup', label: 'Sets up', type: 'boolean', short: 'Sets up' },
  ],
  cardKeys: [],
  packageKeys: ['item', 'available'],
  // maxKey: the package attribute that caps the quantity (the stock on hand).
  quantity: { per_item: { label: 'Items', default: 10, maxKey: 'available', max: 5000 } },
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'setup',
    headline: 'Show your rentals set up',
    prompts: ['A tent at night', 'Tables and chairs, set', 'Linens and place settings'],
    title: 'e.g. Sailcloth tent for 150',
  },
}
