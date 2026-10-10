// Catering: priced per guest, with cuisines and dietary options.
import { SERVICE_STYLE_OPTIONS, cuisines, dietary, dietaryFilter, guestsFilter, maxGuests, menu, minGuests } from '../fields.js'

export default {
  priceTypes: ['per_person', 'fixed', 'quote'],
  packageFields: [
    minGuests,
    maxGuests,
    { key: 'service_style', label: 'Service style', type: 'select', options: SERVICE_STYLE_OPTIONS },
    { key: 'courses', label: 'Courses', type: 'number', min: 1, max: 12, unit: 'courses', short: '{v} courses' },
    menu,
    dietary,
    { key: 'staff_included', label: 'Serving staff included', type: 'boolean', short: 'Staff included' },
    { key: 'tableware_included', label: 'Plates & cutlery included', type: 'boolean', short: 'Tableware included' },
  ],
  providerFields: [
    cuisines,
    dietary,
    { key: 'service_styles', label: 'Service styles', type: 'tags', options: SERVICE_STYLE_OPTIONS },
    { key: 'min_guests', label: 'Smallest event', type: 'number', min: 1, max: 100000, unit: 'guests', short: 'From {v} guests' },
    { key: 'max_guests', label: 'Largest event', type: 'number', min: 1, max: 100000, unit: 'guests', short: 'Up to {v} guests' },
    { key: 'staff_included', label: 'Brings serving staff', type: 'boolean', short: 'Staff included' },
  ],
  cardKeys: ['cuisines', 'max_guests'],
  packageKeys: ['min_quantity', 'max_quantity', 'service_style'],
  filters: [guestsFilter, dietaryFilter],
  quantity: { per_person: { label: 'Guests', default: 50 } },
}
