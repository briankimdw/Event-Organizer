// Venues: priced per day (or hour), with a guest capacity.
import { guestsFilter, includes, maxGuests } from '../fields.js'

const SETTINGS = [{ value: 'indoor', label: 'Indoor' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'indoor-outdoor', label: 'Indoor & outdoor' }]

export default {
  priceTypes: ['daily', 'hourly', 'fixed', 'quote'],
  packageFields: [
    maxGuests,
    { key: 'hours_included', label: 'Hours of access', type: 'number', min: 1, max: 24, unit: 'hours', short: '{v}h access' },
    { key: 'spaces', label: 'Spaces', type: 'tags', options: ['Ceremony lawn', 'Ballroom', 'Terrace', 'Bridal suite'], custom: true, max: 10 },
    includes,
    { key: 'weekday_only', label: 'Weekdays only', type: 'boolean', short: 'Weekdays only' },
  ],
  providerFields: [
    { key: 'setting', label: 'Setting', type: 'select', options: SETTINGS },
    { key: 'capacity_seated', label: 'Seated capacity', type: 'number', min: 1, max: 5000, unit: 'guests', short: '{v} seated' },
    { key: 'capacity_standing', label: 'Standing capacity', type: 'number', min: 1, max: 10000, unit: 'guests', short: '{v} standing' },
    { key: 'amenities', label: 'Amenities', type: 'tags', options: ['Parking', 'Kitchen', 'Bar', 'AV system', 'Dance floor', 'Wheelchair access', 'Bridal suite', 'Tables & chairs'], custom: true, max: 30 },
    { key: 'parking', label: 'Parking', type: 'text', placeholder: 'Free lot for 80 cars', maxLength: 120 },
    { key: 'in_house_catering', label: 'In-house catering', type: 'boolean', short: 'In-house catering' },
    { key: 'outside_catering_allowed', label: 'Outside caterers allowed', type: 'boolean', short: 'Outside catering OK' },
    { key: 'alcohol_allowed', label: 'Alcohol allowed', type: 'boolean', short: 'Alcohol allowed' },
  ],
  cardKeys: ['setting', 'capacity_seated'],
  packageKeys: ['max_quantity', 'hours_included'],
  filters: [guestsFilter, { key: 'setting', label: 'Setting', type: 'select', attr: 'setting', options: SETTINGS }],
}
