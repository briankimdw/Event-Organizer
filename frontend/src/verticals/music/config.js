// DJs & live music: hourly or a set price. Not a visual vertical.
import { languages } from '../fields.js'

export default {
  priceTypes: ['hourly', 'fixed', 'quote'],
  packageFields: [
    { key: 'sets', label: 'Sets', type: 'number', min: 1, max: 10, unit: 'sets', short: '{v} sets' },
    { key: 'set_minutes', label: 'Minutes per set', type: 'number', min: 5, max: 480, unit: 'min', short: '{v}-min sets' },
    { key: 'musicians', label: 'Musicians', type: 'number', min: 1, max: 50, unit: 'people', short: '{v}-piece' },
    { key: 'equipment_included', label: 'Sound system included', type: 'boolean', short: 'Sound system' },
    { key: 'lighting_included', label: 'Lighting included', type: 'boolean', short: 'Lighting' },
    { key: 'ceremony_music', label: 'Ceremony music', type: 'boolean', short: 'Ceremony music' },
    { key: 'mc_included', label: 'MC / announcements', type: 'boolean', short: 'MC included' },
    { key: 'song_requests', label: 'Takes song requests', type: 'boolean', short: 'Song requests' },
  ],
  providerFields: [
    { key: 'acts', label: 'Acts', type: 'tags', options: ['DJ', 'Band', 'Solo', 'Duo', 'String quartet', 'MC'], custom: true, max: 10 },
    { key: 'genres', label: 'Genres', type: 'tags', options: ['Top 40', 'Hip hop', 'Latin', 'EDM', 'Throwbacks', 'Jazz', 'Classical', 'Country', 'K-pop'], custom: true, max: 20 },
    languages,
    { key: 'members', label: 'Members', type: 'number', min: 1, max: 50, unit: 'people', short: '{v} members' },
    { key: 'equipment_included', label: 'Brings sound system', type: 'boolean', short: 'Own sound system' },
    { key: 'lighting_available', label: 'Lighting available', type: 'boolean', short: 'Lighting' },
  ],
  cardKeys: ['acts', 'genres'],
  packageKeys: ['sets', 'musicians'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'set',
    headline: 'Show a set or your setup',
    prompts: ['Your booth at a wedding', 'A packed dance floor', 'The band on stage'],
    title: 'e.g. Friday night wedding set',
  },
}
