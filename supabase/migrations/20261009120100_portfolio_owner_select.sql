-- Let photographers "see" their own files in the public portfolio bucket.
-- Storage only deletes objects the user can select through the API, so without
-- this, deleting a post (or rolling back a failed upload) left the public
-- 2048px copies behind. Reading them was always possible via the public URL;
-- this only adds API access to your own folder.
create policy "Owners see their portfolio files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);
