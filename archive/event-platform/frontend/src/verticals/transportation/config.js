// Transportation: hourly, with a seat count.
import { includes } from '../fields.js'

export default {
  priceTypes: ['hourly', 'fixed', 'quote'],
  packageFields: [
    { key: 'vehicle', label: 'Vehicle', type: 'text', placeholder: 'Stretch limo, Sprinter van…', maxLength: 80 },
    { key: 'passengers', label: 'Passengers', type: 'number', min: 1, max: 100, unit: 'seats', short: 'Seats {v}' },
    { key: 'min_hours', label: 'Minimum hours', type: 'number', min: 1, max: 24, unit: 'hours', short: '{v}h minimum' },
    includes,
    { key: 'chauffeur_included', label: 'Chauffeur included', type: 'boolean', short: 'Chauffeur' },
  ],
  providerFields: [
    { key: 'licensed', label: 'Licensed & insured', type: 'boolean', short: 'Licensed' },
  ],
  cardKeys: [],
  packageKeys: ['vehicle', 'passengers'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'ride',
    headline: 'Show your fleet',
    prompts: ['A car dressed for a wedding', 'Inside the party bus', 'The fleet lined up'],
    title: 'e.g. Vintage Rolls for the couple',
  },
}
