// Videography: films and reels.
import { specialties } from '../fields.js'

export default {
  priceTypes: ['fixed', 'hourly', 'quote'],
  packageFields: [
    { key: 'film_minutes', label: 'Film length (minutes)', type: 'number', min: 0, max: 600, unit: 'min', short: '{v}-min film' },
    { key: 'highlight_minutes', label: 'Highlight reel (minutes)', type: 'number', min: 0, max: 60, unit: 'min', short: '{v}-min highlights' },
    { key: 'turnaround_days', label: 'Turnaround (days)', type: 'number', min: 0, max: 365, unit: 'days', short: '{v}-day turnaround' },
    { key: 'deliverables', label: 'Includes', type: 'tags', options: ['Highlight film', 'Full ceremony', 'Social teaser', 'Drone shots'], custom: true, max: 20 },
    { key: 'raw_footage', label: 'Raw footage included', type: 'boolean', short: 'Raw footage' },
    { key: 'second_shooter_included', label: 'Second shooter included', type: 'boolean', short: 'Second shooter' },
  ],
  providerFields: [
    specialties,
    { key: 'styles', label: 'Styles', type: 'tags', options: ['Cinematic', 'Documentary', 'Vintage', 'Editorial'], custom: true, max: 10 },
    { key: 'drone_licensed', label: 'Licensed drone pilot', type: 'boolean', short: 'Licensed drone pilot' },
  ],
  cardKeys: ['styles'],
  packageKeys: ['film_minutes', 'turnaround_days'],
}
