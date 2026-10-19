-- Reference data every environment needs. Safe to run more than once: re-running
-- fixes names, order and schemas. (Runs automatically after migrations on
-- `supabase db reset` locally; on the hosted project paste it into the SQL editor.)
--
-- Photography only (2026-10-18): one vertical, "Photo & video" (slug `photography`),
-- for creators who sell photo and/or video work. The other verticals (catering,
-- venues, DJs...) are archived with their schemas in
-- archive/event-platform/supabase/seed_all_verticals.sql. The schema itself stays
-- multi-vertical (service_categories + JSON Schemas), so a vertical can come back as
-- rows here. Slugs, names and order match the app's catalog
-- (frontend/src/verticals/); change them there too.
--
-- This only adds or updates rows. Removing the old verticals from a database that
-- has them is migration 20261018000000_photography_only.sql.

-- ---------------------------------------------------------------------------
-- The Photo & video vertical + the custom fields its providers and packages carry.
-- Photo fields: gear.bodies / lenses, edited_photos, editing_level.
-- Video fields: gear.cameras / drones, styles, drone_licensed, film_minutes,
-- highlight_minutes, raw_footage. Shared: specialties, turnaround_days,
-- deliverables, second_shooter_included. (Same JSON as the photography_only
-- migration; keep them in sync.)
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values (
  'photography', 'Photo & video', 'vertical', 1,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "gear": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "bodies": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "lenses": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 40 },
          "cameras": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "drones": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 }
        }
      },
      "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "watermark_default": { "type": "boolean" },
      "drone_licensed": { "type": "boolean" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "edited_photos": { "type": "integer", "minimum": 0, "maximum": 10000 },
      "editing_level": { "type": "string", "maxLength": 80 },
      "film_minutes": { "type": "integer", "minimum": 0, "maximum": 600 },
      "highlight_minutes": { "type": "integer", "minimum": 0, "maximum": 60 },
      "raw_footage": { "type": "boolean" },
      "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
      "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
      "second_shooter_included": { "type": "boolean" }
    }
  }'::jsonb
)
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      parent_id = null,
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Services (they inherit the vertical's schemas): photo first, then video.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, parent_id, sort_order)
select s.slug, s.name, 'service', v.id, s.sort_order
from (values
  ('wedding', 'Wedding', 1),
  ('graduation', 'Graduation', 2),
  ('portrait', 'Portrait', 3),
  ('event', 'Event', 4),
  ('headshots', 'Headshots', 5),
  ('real-estate', 'Real estate', 6),
  ('product', 'Product', 7),
  ('coaching', 'Coaching', 8),
  ('meetups', 'Meetups', 9),
  ('wedding-film', 'Wedding film', 10),
  ('event-recap', 'Event recap', 11),
  ('social-reels', 'Social reels', 12),
  ('music-video', 'Music video', 13),
  ('drone', 'Drone', 14)
) as s (slug, name, sort_order)
join public.service_categories v on v.slug = 'photography' and v.kind = 'vertical'
on conflict (slug) do update
  set name = excluded.name,
      parent_id = excluded.parent_id,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Shared cancellation policy templates (refund % of what was paid, by days
-- before the event). Providers can also create their own.
-- ---------------------------------------------------------------------------
insert into public.cancellation_policies (provider_id, name, rules)
select null, p.name, p.rules::jsonb
from (values
  ('Flexible', '[{"min_days_before": 7, "refund_pct": 100}, {"min_days_before": 2, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]'),
  ('Moderate', '[{"min_days_before": 30, "refund_pct": 100}, {"min_days_before": 14, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]'),
  ('Strict',   '[{"min_days_before": 90, "refund_pct": 50}, {"min_days_before": 0, "refund_pct": 0}]')
) as p (name, rules)
where not exists (
  select 1 from public.cancellation_policies cp where cp.provider_id is null and cp.name = p.name
);
