// Private chefs: per guest, smaller parties.
import { cuisines, dietary, dietaryFilter, guestsFilter, maxGuests, menu, minGuests } from '../fields.js'

export default {
  priceTypes: ['per_person', 'fixed', 'hourly', 'quote'],
  packageFields: [
    minGuests,
    maxGuests,
    { key: 'courses', label: 'Courses', type: 'number', min: 1, max: 20, unit: 'courses', short: '{v} courses' },
    menu,
    dietary,
    { key: 'groceries_included', label: 'Groceries included', type: 'boolean', short: 'Groceries included' },
    { key: 'cleanup_included', label: 'Cleanup included', type: 'boolean', short: 'Cleanup included' },
    { key: 'serving_staff_included', label: 'Serving staff included', type: 'boolean', short: 'Serving staff' },
  ],
  providerFields: [
    cuisines,
    dietary,
    { key: 'max_guests', label: 'Largest party', type: 'number', min: 1, max: 500, unit: 'guests', short: 'Up to {v} guests' },
    { key: 'training', label: 'Training', type: 'text', placeholder: 'Le Cordon Bleu, 10 years in fine dining', maxLength: 120 },
  ],
  cardKeys: ['cuisines'],
  packageKeys: ['courses', 'max_quantity'],
  filters: [guestsFilter, dietaryFilter],
  quantity: { per_person: { label: 'Guests', default: 8 } },
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'dish',
    headline: 'Share a dish',
    prompts: ['A plated course', 'A menu, course by course', 'Your kitchen at work'],
    title: 'e.g. Five-course dinner at home',
  },
}
