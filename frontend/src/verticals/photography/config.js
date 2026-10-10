// Photography: the original vertical. Keys match the photography JSON Schemas in supabase/seed.sql.
export const EDITING_LEVELS = ['Natural color grade', 'Film-style grade', 'Full retouch']

export default {
  priceTypes: ['fixed', 'hourly', 'quote'],
  packageFields: [
    { key: 'edited_photos', label: 'Edited photos', type: 'number', min: 0, max: 10000, unit: 'photos', short: '{v} edited' },
    { key: 'turnaround_days', label: 'Turnaround (days)', type: 'number', min: 0, max: 365, unit: 'days', short: '{v}-day turnaround' },
    { key: 'editing_level', label: 'Editing level', type: 'select', options: EDITING_LEVELS, custom: true },
    { key: 'deliverables', label: 'Includes', type: 'tags', options: ['Online gallery', 'Print release', 'Sneak peeks in 48h', 'Highlight reel'], custom: true, max: 20 },
    { key: 'second_shooter_included', label: 'Second shooter included', type: 'boolean', short: 'Second shooter' },
  ],
  providerFields: [
    { key: 'specialties', label: 'Specialties', type: 'tags', options: [], custom: true, max: 10 },
  ],
  cardKeys: [],
  packageKeys: ['edited_photos', 'turnaround_days'],
}
