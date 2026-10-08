-- Reference data every environment needs. Safe to run more than once.
-- (Runs automatically after migrations on `supabase db reset` locally.)

-- ---------------------------------------------------------------------------
-- Photography vertical + the custom fields its providers and packages carry.
-- New verticals (music, catering, venues...) are added the same way: a row
-- with their own JSON Schemas, no table changes.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values (
  'photography', 'Photography', 'vertical', 1,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "gear": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "bodies": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
          "lenses": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 40 }
        }
      },
      "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
      "watermark_default": { "type": "boolean" }
    }
  }'::jsonb,
  '{
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "edited_photos": { "type": "integer", "minimum": 0, "maximum": 10000 },
      "editing_level": { "type": "string", "maxLength": 80 },
      "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
      "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
      "second_shooter_included": { "type": "boolean" }
    }
  }'::jsonb
)
on conflict (slug) do update
  set name = excluded.name,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- Services under Photography (they inherit its schemas).
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
  ('meetups', 'Meetups', 9)
) as s (slug, name, sort_order)
cross join (select id from public.service_categories where slug = 'photography') v
on conflict (slug) do nothing;

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
