// Officiants: ceremonies. Not a visual vertical.
import { languages } from '../fields.js'

export default {
  priceTypes: ['fixed', 'quote'],
  packageFields: [
    { key: 'ceremony_minutes', label: 'Ceremony length (minutes)', type: 'number', min: 5, max: 240, unit: 'min', short: '{v}-min ceremony' },
    { key: 'meetings', label: 'Meetings before', type: 'number', min: 0, max: 20, unit: 'meetings', short: '{v} meetings' },
    { key: 'custom_ceremony', label: 'Custom-written ceremony', type: 'boolean', short: 'Custom ceremony' },
    { key: 'rehearsal_included', label: 'Rehearsal included', type: 'boolean', short: 'Rehearsal' },
    { key: 'license_filing', label: 'Files the marriage license', type: 'boolean', short: 'License filing' },
  ],
  providerFields: [
    { key: 'ceremony_types', label: 'Ceremonies', type: 'tags', options: ['Religious', 'Non-religious', 'Interfaith', 'Cultural', 'Elopement'], custom: true, max: 10 },
    languages,
    { key: 'ordained_by', label: 'Ordained by', type: 'text', placeholder: 'Universal Life Church', maxLength: 120 },
  ],
  cardKeys: ['ceremony_types'],
  packageKeys: ['ceremony_minutes'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'ceremony',
    headline: 'Share a ceremony',
    prompts: ['The ceremony moment', 'Your ceremony setup', 'You with the couple'],
    title: 'e.g. Beach ceremony at sunset',
  },
}
