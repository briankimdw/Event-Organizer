// Florals: per piece (bouquet, centerpiece) or a full design.
import { maxPieces, minPieces } from '../fields.js'

export default {
  priceTypes: ['per_item', 'fixed', 'quote'],
  packageFields: [
    minPieces,
    maxPieces,
    { key: 'pieces', label: 'Pieces included', type: 'number', min: 1, max: 1000, unit: 'pieces', short: '{v} pieces' },
    { key: 'flowers', label: 'Flowers', type: 'tags', options: ['Roses', 'Peonies', 'Ranunculus', 'Dahlias', 'Eucalyptus', 'Orchids', 'Wildflowers'], custom: true, max: 20 },
    { key: 'color_palette', label: 'Colors', type: 'tags', options: ['White & green', 'Blush', 'Bold', 'Pastel', 'Earthy'], custom: true, max: 10 },
    { key: 'vessels_included', label: 'Vases included', type: 'boolean', short: 'Vases included' },
    { key: 'delivery_included', label: 'Delivery included', type: 'boolean', short: 'Delivery included' },
    { key: 'setup_included', label: 'Setup included', type: 'boolean', short: 'Setup included' },
  ],
  providerFields: [
    { key: 'styles', label: 'Styles', type: 'tags', options: ['Romantic', 'Modern', 'Garden', 'Minimal', 'Boho', 'Tropical'], custom: true, max: 10 },
    { key: 'flowers', label: 'Favorite flowers', type: 'tags', options: ['Roses', 'Peonies', 'Ranunculus', 'Dahlias', 'Orchids'], custom: true, max: 30 },
    { key: 'foam_free', label: 'Foam-free', type: 'boolean', short: 'Foam-free' },
    { key: 'delivery', label: 'Delivers', type: 'boolean', short: 'Delivers' },
  ],
  cardKeys: ['styles'],
  packageKeys: ['pieces'],
  quantity: { per_item: { label: 'Pieces', default: 1, max: 200 } },
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'arrangement',
    headline: 'Show an arrangement',
    prompts: ['A bridal bouquet', 'Centerpieces on the tables', 'A ceremony arch'],
    title: 'e.g. Garden roses and peonies',
  },
}
