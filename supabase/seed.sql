-- Reference data every environment needs. Safe to run more than once: re-running
-- fixes names, order and schemas. (Runs automatically after migrations on
-- `supabase db reset` locally; on the hosted project paste it into the SQL editor,
-- or use supabase/demo/all_verticals_setup.sql which includes it.)
--
-- Slugs, names and order come from frontend/src/verticals/catalog.js, the shared
-- source of truth. Change them there first, then here. See docs/VERTICALS.md.

-- ---------------------------------------------------------------------------
-- Photography vertical + the custom fields its providers and packages carry.
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
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Every other vertical, in catalog order. Each has its own JSON Schemas for
-- providers.attributes and packages.attributes (services inherit them).
-- Conventions:
--   - additionalProperties false, so typos and fields from another vertical are rejected;
--   - lists of free text are short strings (maxLength 40-80) with a maxItems cap;
--   - enums only where the app filters on the value (dietary, setting, service style, roles);
--   - guest / piece limits of a package live in packages.min_quantity / max_quantity,
--     not in attributes, so booking and the planner can use them for every vertical;
--   - units_per_guest (per-item packages): how many pieces a typical guest needs
--     (a chair = 1, a centerpiece for tables of 8 = 0.125). The planner uses it to
--     estimate quantities; leave it out for one-off items like a cake.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, sort_order, provider_schema, package_schema)
values
  -- 2. Videography ------------------------------------------------------------
  ('videography', 'Videography', 'vertical', 2,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "gear": {
         "type": "object", "additionalProperties": false,
         "properties": {
           "cameras": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
           "drones": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 }
         }
       },
       "drone_licensed": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "film_minutes": { "type": "integer", "minimum": 0, "maximum": 600 },
       "highlight_minutes": { "type": "integer", "minimum": 0, "maximum": 60 },
       "raw_footage": { "type": "boolean" },
       "turnaround_days": { "type": "integer", "minimum": 0, "maximum": 365 },
       "deliverables": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "second_shooter_included": { "type": "boolean" }
     }
   }'),

  -- 3. Venues -----------------------------------------------------------------
  ('venue', 'Venues', 'vertical', 3,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "setting": { "enum": ["indoor", "outdoor", "indoor-outdoor"] },
       "capacity_seated": { "type": "integer", "minimum": 1, "maximum": 5000 },
       "capacity_standing": { "type": "integer", "minimum": 1, "maximum": 10000 },
       "amenities": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 30 },
       "address": { "type": "string", "maxLength": 200 },
       "parking": { "type": "string", "maxLength": 120 },
       "in_house_catering": { "type": "boolean" },
       "outside_catering_allowed": { "type": "boolean" },
       "alcohol_allowed": { "type": "boolean" },
       "curfew": { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "hours_included": { "type": "integer", "minimum": 1, "maximum": 24 },
       "spaces": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "weekday_only": { "type": "boolean" }
     }
   }'),

  -- 4. Catering ---------------------------------------------------------------
  ('catering', 'Catering', 'vertical', 4,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "cuisines": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "service_styles": { "type": "array", "items": { "enum": ["buffet", "plated", "family-style", "stations", "passed-appetizers", "food-truck", "drop-off"] }, "uniqueItems": true },
       "min_guests": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "staff_included": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "service_style": { "enum": ["buffet", "plated", "family-style", "stations", "passed-appetizers", "food-truck", "drop-off"] },
       "courses": { "type": "integer", "minimum": 1, "maximum": 12 },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "staff_included": { "type": "boolean" },
       "tableware_included": { "type": "boolean" }
     }
   }'),

  -- 5. Private chefs ----------------------------------------------------------
  ('private-chef', 'Private chefs', 'vertical', 5,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "cuisines": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 500 },
       "training": { "type": "string", "maxLength": 120 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "courses": { "type": "integer", "minimum": 1, "maximum": 20 },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "groceries_included": { "type": "boolean" },
       "cleanup_included": { "type": "boolean" },
       "serving_staff_included": { "type": "boolean" }
     }
   }'),

  -- 6. Cakes & desserts -------------------------------------------------------
  ('cakes', 'Cakes & desserts', 'vertical', 6,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "delivery": { "type": "boolean" },
       "tastings": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "servings": { "type": "integer", "minimum": 1, "maximum": 5000 },
       "tiers": { "type": "integer", "minimum": 1, "maximum": 10 },
       "flavors": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "dietary": { "type": "array", "items": { "enum": ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"] }, "uniqueItems": true },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 }
     }
   }'),

  -- 7. Bar & drinks -----------------------------------------------------------
  ('bar', 'Bar & drinks', 'vertical', 7,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "bar_types": { "type": "array", "items": { "enum": ["full-bar", "beer-wine", "cocktails", "mocktails", "coffee"] }, "uniqueItems": true },
       "provides_alcohol": { "type": "boolean" },
       "liability_insured": { "type": "boolean" },
       "max_guests": { "type": "integer", "minimum": 1, "maximum": 100000 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "hours_included": { "type": "integer", "minimum": 1, "maximum": 24 },
       "bartenders": { "type": "integer", "minimum": 1, "maximum": 50 },
       "signature_cocktails": { "type": "integer", "minimum": 0, "maximum": 20 },
       "alcohol_included": { "type": "boolean" },
       "menu": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "glassware_included": { "type": "boolean" }
     }
   }'),

  -- 8. DJs & live music -------------------------------------------------------
  ('music', 'DJs & live music', 'vertical', 8,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "acts": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "genres": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "members": { "type": "integer", "minimum": 1, "maximum": 50 },
       "equipment_included": { "type": "boolean" },
       "lighting_available": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "sets": { "type": "integer", "minimum": 1, "maximum": 10 },
       "set_minutes": { "type": "integer", "minimum": 5, "maximum": 480 },
       "musicians": { "type": "integer", "minimum": 1, "maximum": 50 },
       "equipment_included": { "type": "boolean" },
       "lighting_included": { "type": "boolean" },
       "ceremony_music": { "type": "boolean" },
       "mc_included": { "type": "boolean" },
       "song_requests": { "type": "boolean" }
     }
   }'),

  -- 9. Entertainment ----------------------------------------------------------
  ('entertainment', 'Entertainment', 'vertical', 9,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "acts": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "age_groups": { "type": "array", "items": { "enum": ["kids", "teens", "adults", "all-ages"] }, "uniqueItems": true },
       "space_needed": { "type": "string", "maxLength": 120 },
       "outdoor_ok": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "performers": { "type": "integer", "minimum": 1, "maximum": 50 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "prints_included": { "type": "boolean" },
       "setup_minutes": { "type": "integer", "minimum": 0, "maximum": 480 }
     }
   }'),

  -- 10. Florals ---------------------------------------------------------------
  ('florals', 'Florals', 'vertical', 10,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "flowers": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 30 },
       "foam_free": { "type": "boolean" },
       "delivery": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "pieces": { "type": "integer", "minimum": 1, "maximum": 1000 },
       "flowers": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "color_palette": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "vessels_included": { "type": "boolean" },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 }
     }
   }'),

  -- 11. Decor & design --------------------------------------------------------
  ('decor', 'Decor & design', 'vertical', 11,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "styles": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "themes": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 20 },
       "inventory_owned": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "theme": { "type": "string", "maxLength": 80 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 30 },
       "color_palette": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "setup_included": { "type": "boolean" },
       "teardown_included": { "type": "boolean" }
     }
   }'),

  -- 12. Hair & makeup ---------------------------------------------------------
  ('hair-makeup', 'Hair & makeup', 'vertical', 12,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "products": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 },
       "techniques": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "travel": { "type": "boolean" },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 50 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "services": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "trial_included": { "type": "boolean" },
       "on_location": { "type": "boolean" },
       "touch_up_hours": { "type": "integer", "minimum": 0, "maximum": 24 },
       "lashes_included": { "type": "boolean" }
     }
   }'),

  -- 13. Rentals ---------------------------------------------------------------
  ('rentals', 'Rentals', 'vertical', 13,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "inventory": {
         "type": "array", "maxItems": 200,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["item"],
           "properties": {
             "item": { "type": "string", "maxLength": 80 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 100000 },
             "price_cents": { "type": "integer", "minimum": 0 }
           }
         }
       },
       "delivery": { "type": "boolean" },
       "setup": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "item": { "type": "string", "maxLength": 80 },
       "dimensions": { "type": "string", "maxLength": 80 },
       "color": { "type": "string", "maxLength": 40 },
       "available": { "type": "integer", "minimum": 1, "maximum": 100000 },
       "bundle": {
         "type": "array", "maxItems": 30,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["item"],
           "properties": {
             "item": { "type": "string", "maxLength": 80 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 100000 }
           }
         }
       },
       "units_per_guest": { "type": "number", "minimum": 0, "maximum": 10 },
       "delivery_included": { "type": "boolean" },
       "setup_included": { "type": "boolean" }
     }
   }'),

  -- 14. Planners --------------------------------------------------------------
  ('planning', 'Planners', 'vertical', 14,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "specialties": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "certifications": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 200 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "months_of_planning": { "type": "integer", "minimum": 0, "maximum": 36 },
       "day_of_hours": { "type": "integer", "minimum": 0, "maximum": 24 },
       "meetings": { "type": "integer", "minimum": 0, "maximum": 100 },
       "vendor_referrals": { "type": "boolean" },
       "budget_tracking": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 15. Officiants ------------------------------------------------------------
  ('officiant', 'Officiants', 'vertical', 15,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "ceremony_types": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "languages": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 10 },
       "ordained_by": { "type": "string", "maxLength": 120 }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "ceremony_minutes": { "type": "integer", "minimum": 5, "maximum": 240 },
       "meetings": { "type": "integer", "minimum": 0, "maximum": 20 },
       "custom_ceremony": { "type": "boolean" },
       "rehearsal_included": { "type": "boolean" },
       "license_filing": { "type": "boolean" }
     }
   }'),

  -- 16. Transportation --------------------------------------------------------
  ('transportation', 'Transportation', 'vertical', 16,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "fleet": {
         "type": "array", "maxItems": 50,
         "items": {
           "type": "object", "additionalProperties": false, "required": ["vehicle"],
           "properties": {
             "vehicle": { "type": "string", "maxLength": 80 },
             "passengers": { "type": "integer", "minimum": 1, "maximum": 100 },
             "quantity": { "type": "integer", "minimum": 1, "maximum": 500 }
           }
         }
       },
       "licensed": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "vehicle": { "type": "string", "maxLength": 80 },
       "passengers": { "type": "integer", "minimum": 1, "maximum": 100 },
       "min_hours": { "type": "integer", "minimum": 1, "maximum": 24 },
       "chauffeur_included": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 17. Event staff -----------------------------------------------------------
  ('staffing', 'Event staff', 'vertical', 17,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "roles": { "type": "array", "items": { "enum": ["servers", "bartenders", "valet", "security", "cleanup", "coordinators", "hosts"] }, "uniqueItems": true },
       "team_size": { "type": "integer", "minimum": 1, "maximum": 1000 },
       "insured": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "role": { "enum": ["servers", "bartenders", "valet", "security", "cleanup", "coordinators", "hosts"] },
       "staff": { "type": "integer", "minimum": 1, "maximum": 200 },
       "min_hours": { "type": "integer", "minimum": 1, "maximum": 24 },
       "attire": { "type": "string", "maxLength": 80 },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }'),

  -- 18. Wellness --------------------------------------------------------------
  ('wellness', 'Wellness', 'vertical', 18,
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "modalities": { "type": "array", "items": { "type": "string", "maxLength": 40 }, "maxItems": 15 },
       "certifications": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 10 },
       "comes_to_you": { "type": "boolean" },
       "brings_equipment": { "type": "boolean" }
     }
   }',
   '{
     "type": "object", "additionalProperties": false,
     "properties": {
       "session_minutes": { "type": "integer", "minimum": 10, "maximum": 600 },
       "max_people": { "type": "integer", "minimum": 1, "maximum": 100 },
       "equipment_included": { "type": "boolean" },
       "includes": { "type": "array", "items": { "type": "string", "maxLength": 80 }, "maxItems": 20 }
     }
   }')
on conflict (slug) do update
  set name = excluded.name,
      sort_order = excluded.sort_order,
      provider_schema = excluded.provider_schema,
      package_schema = excluded.package_schema;

-- ---------------------------------------------------------------------------
-- Services under each vertical (they inherit its schemas), in catalog order.
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, kind, parent_id, sort_order)
select s.slug, s.name, 'service', v.id, s.sort_order
from (values
  ('photography', 'wedding', 'Wedding', 1),
  ('photography', 'graduation', 'Graduation', 2),
  ('photography', 'portrait', 'Portrait', 3),
  ('photography', 'event', 'Event', 4),
  ('photography', 'headshots', 'Headshots', 5),
  ('photography', 'real-estate', 'Real estate', 6),
  ('photography', 'product', 'Product', 7),
  ('photography', 'coaching', 'Coaching', 8),
  ('photography', 'meetups', 'Meetups', 9),
  ('videography', 'wedding-film', 'Wedding film', 1),
  ('videography', 'event-recap', 'Event recap', 2),
  ('videography', 'social-reels', 'Social reels', 3),
  ('videography', 'music-video', 'Music video', 4),
  ('videography', 'drone', 'Drone', 5),
  ('venue', 'wedding-venue', 'Wedding venue', 1),
  ('venue', 'party-space', 'Party space', 2),
  ('venue', 'rooftop', 'Rooftop', 3),
  ('venue', 'garden-estate', 'Garden & estate', 4),
  ('venue', 'restaurant-buyout', 'Restaurant buyout', 5),
  ('venue', 'studio-space', 'Studio space', 6),
  ('catering', 'full-service-catering', 'Full service', 1),
  ('catering', 'buffet', 'Buffet', 2),
  ('catering', 'plated-dinner', 'Plated dinner', 3),
  ('catering', 'food-truck', 'Food truck', 4),
  ('catering', 'drop-off-catering', 'Drop-off', 5),
  ('catering', 'brunch', 'Brunch', 6),
  ('private-chef', 'chef-dinner', 'Dinner party', 1),
  ('private-chef', 'tasting-menu', 'Tasting menu', 2),
  ('private-chef', 'meal-prep', 'Meal prep', 3),
  ('private-chef', 'cooking-class', 'Cooking class', 4),
  ('cakes', 'wedding-cake', 'Wedding cake', 1),
  ('cakes', 'celebration-cake', 'Celebration cake', 2),
  ('cakes', 'dessert-table', 'Dessert table', 3),
  ('cakes', 'cupcakes-cookies', 'Cupcakes & cookies', 4),
  ('bar', 'mobile-bar', 'Mobile bar', 1),
  ('bar', 'bartender', 'Bartender', 2),
  ('bar', 'mixology', 'Signature cocktails', 3),
  ('bar', 'coffee-cart', 'Coffee cart', 4),
  ('music', 'dj', 'DJ', 1),
  ('music', 'live-band', 'Live band', 2),
  ('music', 'solo-musician', 'Solo musician', 3),
  ('music', 'string-quartet', 'String quartet', 4),
  ('music', 'mc', 'MC / host', 5),
  ('entertainment', 'photo-booth', 'Photo booth', 1),
  ('entertainment', 'magician', 'Magician', 2),
  ('entertainment', 'kids-entertainer', 'Kids entertainer', 3),
  ('entertainment', 'face-painting', 'Face painting', 4),
  ('entertainment', 'dancers', 'Dancers', 5),
  ('entertainment', 'caricature', 'Caricature artist', 6),
  ('florals', 'bridal-bouquet', 'Bouquets', 1),
  ('florals', 'centerpieces', 'Centerpieces', 2),
  ('florals', 'ceremony-florals', 'Ceremony arch', 3),
  ('florals', 'floral-installation', 'Installations', 4),
  ('decor', 'balloon-decor', 'Balloons', 1),
  ('decor', 'backdrops', 'Backdrops', 2),
  ('decor', 'lighting-design', 'Lighting', 3),
  ('decor', 'themed-decor', 'Themed decor', 4),
  ('decor', 'tablescapes', 'Tablescapes', 5),
  ('hair-makeup', 'bridal-makeup', 'Bridal makeup', 1),
  ('hair-makeup', 'event-makeup', 'Event makeup', 2),
  ('hair-makeup', 'hair-styling', 'Hair styling', 3),
  ('hair-makeup', 'nails', 'Nails', 4),
  ('hair-makeup', 'lashes-brows', 'Lashes & brows', 5),
  ('rentals', 'tables-chairs', 'Tables & chairs', 1),
  ('rentals', 'tents', 'Tents', 2),
  ('rentals', 'linens', 'Linens', 3),
  ('rentals', 'av-equipment', 'Sound & AV', 4),
  ('rentals', 'bounce-houses', 'Bounce houses', 5),
  ('planning', 'full-planning', 'Full planning', 1),
  ('planning', 'day-of-coordination', 'Day-of coordination', 2),
  ('planning', 'proposal-planning', 'Proposal planning', 3),
  ('planning', 'corporate-planning', 'Corporate events', 4),
  ('officiant', 'wedding-officiant', 'Wedding ceremony', 1),
  ('officiant', 'vow-renewal', 'Vow renewal', 2),
  ('officiant', 'elopement-officiant', 'Elopement', 3),
  ('transportation', 'limo', 'Limo', 1),
  ('transportation', 'party-bus', 'Party bus', 2),
  ('transportation', 'classic-car', 'Classic car', 3),
  ('transportation', 'guest-shuttle', 'Guest shuttle', 4),
  ('staffing', 'servers', 'Servers', 1),
  ('staffing', 'valet', 'Valet', 2),
  ('staffing', 'security', 'Security', 3),
  ('staffing', 'cleanup-crew', 'Cleanup crew', 4),
  ('wellness', 'massage', 'Massage', 1),
  ('wellness', 'yoga', 'Yoga', 2),
  ('wellness', 'personal-training', 'Personal training', 3),
  ('wellness', 'spa-day', 'Spa day', 4)
) as s (vertical, slug, name, sort_order)
join public.service_categories v on v.slug = s.vertical and v.kind = 'vertical'
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
