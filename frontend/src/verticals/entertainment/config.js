// Entertainment: photo booths, magicians, kids' parties.
import { includes } from '../fields.js'

const AGES = [{ value: 'kids', label: 'Kids' }, { value: 'teens', label: 'Teens' }, { value: 'adults', label: 'Adults' }, { value: 'all-ages', label: 'All ages' }]

export default {
  priceTypes: ['hourly', 'fixed', 'quote'],
  packageFields: [
    { key: 'performers', label: 'Performers', type: 'number', min: 1, max: 50, unit: 'people', short: '{v} performers' },
    { key: 'setup_minutes', label: 'Setup time (minutes)', type: 'number', min: 0, max: 480, unit: 'min', short: '{v}-min setup' },
    includes,
    { key: 'prints_included', label: 'Prints included', type: 'boolean', short: 'Prints included' },
  ],
  providerFields: [
    { key: 'acts', label: 'Acts', type: 'tags', options: ['Photo booth', 'Magic', 'Face painting', 'Balloon art', 'Dancers', 'Caricatures'], custom: true, max: 10 },
    { key: 'age_groups', label: 'Best for', type: 'tags', options: AGES },
    { key: 'space_needed', label: 'Space needed', type: 'text', placeholder: '10×10 ft, near an outlet', maxLength: 120 },
    { key: 'outdoor_ok', label: 'Can perform outdoors', type: 'boolean', short: 'Outdoors OK' },
  ],
  cardKeys: ['acts'],
  packageKeys: ['performers'],
  filters: [{ key: 'age_groups', label: 'Best for', type: 'tags', attr: 'age_groups', options: AGES }],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'act',
    headline: 'Show your act',
    prompts: ['Mid-performance', 'Your setup', 'Guests having fun'],
    title: 'e.g. Photo booth at a 30th birthday',
  },
}
