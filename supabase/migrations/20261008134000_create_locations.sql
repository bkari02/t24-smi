create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  participant_id text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null default 'owntracks'
    check (source in ('owntracks', 'browser')),
  created_at timestamptz not null default now()
);

create index if not exists locations_event_recorded_idx
  on public.locations (event_id, recorded_at desc);

alter table public.locations enable row level security;

create table if not exists public.event_access (
  event_id text primary key,
  access_token text not null,
  created_at timestamptz not null default now()
);

alter table public.event_access enable row level security;

create or replace function public.t24_has_event_token(requested_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_access
    where event_id = requested_event_id
      and access_token = current_setting('request.headers', true)::json->>'x-t24-event-token'
  );
$$;

-- The event token is sent by the frontend as x-t24-event-token. Keep it
-- private and rotate it before race day. An Edge Function should be used for
-- OwnTracks ingestion so the token is never placed in that app's config.
create policy "event token can read locations"
  on public.locations for select
  to anon, authenticated
  using (public.t24_has_event_token(event_id));

create policy "event token can insert locations"
  on public.locations for insert
  to anon, authenticated
  with check (public.t24_has_event_token(event_id));

alter publication supabase_realtime add table public.locations;

-- Replace the token before applying this statement. Do not commit the real
-- token to the repository.
-- insert into public.event_access (event_id, access_token)
-- values ('your-event-id', 'replace-with-a-long-random-event-token');
