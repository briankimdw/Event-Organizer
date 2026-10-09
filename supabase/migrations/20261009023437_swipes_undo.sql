-- Discover's "undo" removes the user's last swipe, so it stops counting toward
-- their taste. Users can only delete their own swipes.
create policy "Users undo their own swipes"
  on public.swipes for delete
  to authenticated
  using (user_id = (select auth.uid()));
