-- Photo edits: the in-app editor is non-destructive. The untouched original stays in the
-- private bucket (photos.original_path); the public copy (display_path) is rendered from it
-- with an edit recipe, stored here so the owner can re-edit or revert later.
-- Recipe format: docs/EDITOR.md (frontend/src/lib/editor/recipe.js). null = unedited.
--
-- Safe to run more than once. The app works before this is applied (it detects the missing
-- column and simply doesn't save recipes).

alter table public.photos add column if not exists edit_recipe jsonb;

-- Shape check: an object with a numeric version, only known top-level keys, adjustments as
-- numbers in -100..100, and small (the client stores the compact form, ~100-400 bytes).
create or replace function public.edit_recipe_ok(r jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if r is null then return true; end if;
  if jsonb_typeof(r) <> 'object' then return false; end if;
  if octet_length(r::text) > 4096 then return false; end if;
  if jsonb_typeof(r -> 'v') is distinct from 'number' then return false; end if;
  if (r ->> 'v')::numeric not between 1 and 1000 then return false; end if;
  if (r - array['v', 'crop', 'aspect', 'rotate', 'straighten', 'flipH', 'adjust', 'filter']) <> '{}'::jsonb then return false; end if;
  if r ? 'crop' and jsonb_typeof(r -> 'crop') not in ('object', 'null') then return false; end if;
  if r ? 'filter' and jsonb_typeof(r -> 'filter') not in ('object', 'null') then return false; end if;
  if r ? 'aspect' and jsonb_typeof(r -> 'aspect') <> 'string' then return false; end if;
  if r ? 'rotate' and jsonb_typeof(r -> 'rotate') <> 'number' then return false; end if;
  if r ? 'straighten' and jsonb_typeof(r -> 'straighten') <> 'number' then return false; end if;
  if r ? 'flipH' and jsonb_typeof(r -> 'flipH') <> 'boolean' then return false; end if;
  if r ? 'adjust' then
    if jsonb_typeof(r -> 'adjust') <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_each(r -> 'adjust') e
      where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric not between -100 and 100
    ) then return false; end if;
  end if;
  return true;
end;
$$;

alter table public.photos drop constraint if exists photos_edit_recipe_ok;
alter table public.photos add constraint photos_edit_recipe_ok check (public.edit_recipe_ok(edit_recipe));

-- Owners can set the recipe when posting and change it when re-editing. (display_path, width
-- and height were already owner-updatable; the AI-check columns stay off-limits.)
grant insert (edit_recipe) on public.photos to authenticated;
grant update (edit_recipe) on public.photos to authenticated;

-- A new public copy means the old analysis is stale: drop the SigLIP embedding (the ML worker
-- picks the photo up again, see ml_pending_photos) and the perceptual hash.
create or replace function public.photos_display_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.display_path is distinct from old.display_path then
    delete from public.photo_embeddings where photo_id = new.id;
    new.phash := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.photos_display_changed() from public, anon, authenticated;

drop trigger if exists photos_display_changed on public.photos;
create trigger photos_display_changed
  before update of display_path on public.photos
  for each row execute function public.photos_display_changed();
