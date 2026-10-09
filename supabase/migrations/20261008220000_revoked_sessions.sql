-- 0008: session denylist for the FastAPI backend.
-- Access tokens are verified locally (PyJWT), so a token keeps working until it
-- expires even after sign-out. On logout the backend records the token's
-- session_id here and rejects it until then. Rows are only needed until the
-- token's own expiry, so they are purged after that.

create table public.revoked_sessions (
  session_id uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz not null default now()
);

comment on table public.revoked_sessions is
  'Signed-out sessions whose access tokens have not expired yet. Backend only; read and written through the functions below.';

create index revoked_sessions_expires_at_idx on public.revoked_sessions (expires_at);

-- Not reachable through the API; RLS on with no policies as a second lock.
alter table public.revoked_sessions enable row level security;
revoke all on public.revoked_sessions from anon, authenticated;

-- Revoke the caller's own session (the one in the JWT making this call).
create function public.revoke_my_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
begin
  if claims ->> 'session_id' is null then
    raise exception 'Token has no session_id' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.revoked_sessions where expires_at < now();

  insert into public.revoked_sessions (session_id, user_id, expires_at)
  values (
    (claims ->> 'session_id')::uuid,
    (select auth.uid()),
    to_timestamp((claims ->> 'exp')::bigint)
  )
  on conflict (session_id) do nothing;
end;
$$;

-- Has the caller's own session been revoked?
create function public.is_my_session_revoked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.revoked_sessions r
    where r.session_id = (auth.jwt() ->> 'session_id')::uuid
  );
$$;

revoke execute on function public.revoke_my_session() from public, anon;
revoke execute on function public.is_my_session_revoked() from public, anon;
grant execute on function public.revoke_my_session() to authenticated;
grant execute on function public.is_my_session_revoked() to authenticated;
