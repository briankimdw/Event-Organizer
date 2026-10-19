// Photo & video: the one vertical. Keys match the photography JSON Schemas in
// supabase/seed.sql (they reject unknown keys). The video keys (film_minutes,
// highlight_minutes, raw_footage) came from the archived videography vertical; the
// photography package schema needs them too (the pivot's DB cleanup adds them).
export const EDITING_LEVELS = ['Natural color grade', 'Film-style grade', 'Full retouch']

export default {
  // per_person / per_item / daily were for other verticals: a shoot is a fixed price, by the hour, or a quote.
  priceTypes: ['fixed', 'hourly', 'quote'],
  packageFields: [
    // Photo
    { key: 'edited_photos', label: 'Edited photos', type: 'number', min: 0, max: 10000, unit: 'photos', short: '{v} edited', group: 'photo' },
    { key: 'editing_level', label: 'Editing level', type: 'select', options: EDITING_LEVELS, custom: true, group: 'photo' },
    // Video
    { key: 'film_minutes', label: 'Film length (minutes)', type: 'number', min: 0, max: 600, unit: 'min', short: '{v}-min film', group: 'video' },
    { key: 'highlight_minutes', label: 'Highlight reel (minutes)', type: 'number', min: 0, max: 60, unit: 'min', short: '{v}-min highlights', group: 'video' },
    { key: 'raw_footage', label: 'Raw footage included', type: 'boolean', short: 'Raw footage', group: 'video' },
    // Both
    { key: 'turnaround_days', label: 'Turnaround (days)', type: 'number', min: 0, max: 365, unit: 'days', short: '{v}-day turnaround' },
    {
      key: 'deliverables', label: 'Includes', type: 'tags', custom: true, max: 20,
      options: ['Online gallery', 'Print release', 'Sneak peeks in 48h', 'Highlight film', 'Full ceremony', 'Social teaser', 'Drone shots'],
    },
    { key: 'second_shooter_included', label: 'Second shooter included', type: 'boolean', short: 'Second shooter' },
  ],
  providerFields: [
    { key: 'specialties', label: 'Specialties', type: 'tags', options: [], custom: true, max: 10 },
  ],
  cardKeys: [],
  packageKeys: ['edited_photos', 'film_minutes', 'turnaround_days'],
  // The post composer: what a post shows, the drop zone headline, ideas, the title example,
  // and whether camera settings (EXIF) and before / after posts make sense.
  post: {
    noun: 'photo',
    headline: 'Share your photos and stills',
    prompts: ['A favorite frame', 'A wedding, start to finish', 'Stills from a film'],
    title: 'e.g. Nguyen–Park wedding',
    caption: 'The story behind it: the shoot, the people, the light…',
    showCamera: true,
    beforeAfter: true,
  },
}
