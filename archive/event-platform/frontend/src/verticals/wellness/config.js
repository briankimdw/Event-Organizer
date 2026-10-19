// Wellness: massage, yoga and training at home.
import { includes } from '../fields.js'

export default {
  priceTypes: ['fixed', 'hourly', 'per_person', 'quote'],
  packageFields: [
    { key: 'session_minutes', label: 'Session length (minutes)', type: 'number', min: 10, max: 600, unit: 'min', short: '{v} min' },
    { key: 'max_people', label: 'Up to (people)', type: 'number', min: 1, max: 100, unit: 'people', short: 'Up to {v} people' },
    includes,
    { key: 'equipment_included', label: 'Equipment included', type: 'boolean', short: 'Equipment included' },
  ],
  providerFields: [
    { key: 'modalities', label: 'Specialties', type: 'tags', options: ['Swedish massage', 'Deep tissue', 'Vinyasa', 'Pilates', 'Strength'], custom: true, max: 15 },
    { key: 'certifications', label: 'Certifications', type: 'tags', options: [], custom: true, max: 10, placeholder: 'Add a certification' },
    { key: 'comes_to_you', label: 'Comes to you', type: 'boolean', short: 'Comes to you' },
    { key: 'brings_equipment', label: 'Brings equipment', type: 'boolean', short: 'Brings equipment' },
  ],
  cardKeys: ['modalities'],
  packageKeys: ['session_minutes'],
  quantity: { per_person: { label: 'People', default: 2, max: 100 } },
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'session',
    headline: 'Show a session or your space',
    prompts: ['A session setup', 'A group class', 'Your equipment'],
    title: 'e.g. Sunrise yoga for a bridal party',
  },
}
