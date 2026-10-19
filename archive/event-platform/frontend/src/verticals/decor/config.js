// Decor & design: balloons, backdrops, lighting, themes.
import { includes } from '../fields.js'

export default {
  priceTypes: ['fixed', 'per_item', 'quote'],
  packageFields: [
    { key: 'theme', label: 'Theme', type: 'text', placeholder: 'Boho garden, neon glow…', maxLength: 80 },
    includes,
    { key: 'color_palette', label: 'Colors', type: 'tags', options: ['Gold & white', 'Pastel', 'Bold', 'Neutral'], custom: true, max: 10 },
    { key: 'setup_included', label: 'Setup included', type: 'boolean', short: 'Setup included' },
    { key: 'teardown_included', label: 'Teardown included', type: 'boolean', short: 'Teardown included' },
  ],
  providerFields: [
    { key: 'styles', label: 'Styles', type: 'tags', options: ['Balloons', 'Backdrops', 'Lighting', 'Tablescapes', 'Florals'], custom: true, max: 10 },
    { key: 'themes', label: 'Themes', type: 'tags', options: [], custom: true, max: 20, placeholder: 'Add a theme' },
    { key: 'inventory_owned', label: 'Owns their decor', type: 'boolean', short: 'Own inventory' },
  ],
  cardKeys: ['styles'],
  packageKeys: ['theme'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'design',
    headline: 'Show a room you styled',
    prompts: ['A balloon installation', 'Your backdrop', 'A tablescape'],
    title: 'e.g. Boho baby shower',
    beforeAfter: true,
  },
}
