// Hair & makeup: per person in the party, or a set price.
export default {
  priceTypes: ['per_person', 'fixed', 'hourly', 'quote'],
  packageFields: [
    { key: 'services', label: 'Includes', type: 'tags', options: ['Makeup', 'Hair', 'Airbrush', 'Touch-ups'], custom: true, max: 10 },
    { key: 'touch_up_hours', label: 'Touch-up hours', type: 'number', min: 0, max: 24, unit: 'hours', short: '{v}h touch-ups' },
    { key: 'trial_included', label: 'Trial included', type: 'boolean', short: 'Trial included' },
    { key: 'on_location', label: 'Comes to you', type: 'boolean', short: 'Comes to you' },
    { key: 'lashes_included', label: 'Lashes included', type: 'boolean', short: 'Lashes included' },
  ],
  providerFields: [
    { key: 'techniques', label: 'Techniques', type: 'tags', options: ['Airbrush', 'Natural glam', 'Editorial', 'Updos', 'Braids'], custom: true, max: 15 },
    { key: 'products', label: 'Products', type: 'tags', options: [], custom: true, max: 20, placeholder: 'Add a brand' },
    { key: 'team_size', label: 'Team size', type: 'number', min: 1, max: 50, unit: 'artists', short: 'Team of {v}' },
    { key: 'travel', label: 'Travels to you', type: 'boolean', short: 'Travels to you' },
  ],
  cardKeys: ['techniques'],
  packageKeys: [],
  quantity: { per_person: { label: 'People', default: 1, max: 30 } },
}
