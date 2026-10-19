// Planners: full planning or day-of coordination. Not a visual vertical.
import { includes, languages, specialties } from '../fields.js'

export default {
  priceTypes: ['fixed', 'hourly', 'quote'],
  packageFields: [
    { key: 'months_of_planning', label: 'Months of planning', type: 'number', min: 0, max: 36, unit: 'months', short: '{v} months of planning' },
    { key: 'day_of_hours', label: 'Day-of hours', type: 'number', min: 0, max: 24, unit: 'hours', short: '{v}h on the day' },
    { key: 'meetings', label: 'Meetings', type: 'number', min: 0, max: 100, unit: 'meetings', short: '{v} meetings' },
    includes,
    { key: 'vendor_referrals', label: 'Vendor referrals', type: 'boolean', short: 'Vendor referrals' },
    { key: 'budget_tracking', label: 'Budget tracking', type: 'boolean', short: 'Budget tracking' },
  ],
  providerFields: [
    specialties,
    languages,
    { key: 'certifications', label: 'Certifications', type: 'tags', options: [], custom: true, max: 10, placeholder: 'Add a certification' },
    { key: 'team_size', label: 'Team size', type: 'number', min: 1, max: 200, unit: 'planners', short: 'Team of {v}' },
  ],
  cardKeys: ['specialties'],
  packageKeys: ['months_of_planning', 'day_of_hours'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'event',
    headline: 'Show an event you planned',
    prompts: ['The finished room', 'A moment you planned', 'The details'],
    title: 'e.g. Vineyard wedding weekend',
  },
}
