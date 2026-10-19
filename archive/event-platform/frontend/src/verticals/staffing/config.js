// Event staff: hourly, per staff member. Not a visual vertical.
import { includes } from '../fields.js'

const ROLES = [
  { value: 'servers', label: 'Servers' }, { value: 'bartenders', label: 'Bartenders' }, { value: 'valet', label: 'Valet' },
  { value: 'security', label: 'Security' }, { value: 'cleanup', label: 'Cleanup' }, { value: 'coordinators', label: 'Coordinators' },
  { value: 'hosts', label: 'Hosts' },
]

export default {
  priceTypes: ['hourly', 'fixed', 'quote'],
  packageFields: [
    { key: 'role', label: 'Role', type: 'select', options: ROLES },
    { key: 'staff', label: 'Staff included', type: 'number', min: 1, max: 200, unit: 'people', short: '{v} staff' },
    { key: 'min_hours', label: 'Minimum hours', type: 'number', min: 1, max: 24, unit: 'hours', short: '{v}h minimum' },
    { key: 'attire', label: 'Attire', type: 'text', placeholder: 'All black', maxLength: 80 },
    includes,
  ],
  providerFields: [
    { key: 'roles', label: 'Roles', type: 'tags', options: ROLES },
    { key: 'team_size', label: 'Team size', type: 'number', min: 1, max: 1000, unit: 'people', short: 'Team of {v}' },
    { key: 'insured', label: 'Insured', type: 'boolean', short: 'Insured' },
  ],
  cardKeys: ['roles'],
  packageKeys: ['role', 'staff', 'min_hours'],
  filters: [{ key: 'roles', label: 'Roles', type: 'tags', attr: 'roles', options: ROLES }],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'event',
    headline: 'Show your team at work',
    prompts: ['Servers mid-service', 'Valet at the door', 'The crew before doors open'],
    title: 'e.g. Gala for 300 guests',
  },
}
