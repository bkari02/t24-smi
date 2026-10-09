-- Member sessions are deliberately application sessions, not Supabase Auth
-- users.  The clear-text values are returned only when a session/code is
-- created; only their SHA-256 digests are stored.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.member_login_codes (
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, participant_id, code_hash)
);

create table if not exists public.member_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_sessions_active_idx
  on public.member_sessions(event_id, expires_at)
  where revoked_at is null;

create table if not exists public.viewer_sessions (
  id uuid primary key,
  event_id text not null references public.events(id) on delete cascade,
  participant_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists viewer_sessions_active_idx
  on public.viewer_sessions(event_id, last_seen_at desc);

create table if not exists public.cheers (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null,
  sender_participant_id text,
  client_nonce text not null,
  created_at timestamptz not null default now(),
  unique (event_id, participant_id, sender_participant_id, client_nonce)
);

create index if not exists cheers_totals_idx
  on public.cheers(event_id, participant_id);

alter table public.member_login_codes enable row level security;
alter table public.member_sessions enable row level security;
alter table public.viewer_sessions enable row level security;
alter table public.cheers enable row level security;

-- These tables are intentionally RPC-only.  In particular, a login code or
-- session token must never be readable through the anon PostgREST API.
revoke all on public.member_login_codes from anon, authenticated;
revoke all on public.member_sessions from anon, authenticated;
revoke all on public.viewer_sessions from anon, authenticated;
revoke all on public.cheers from anon, authenticated;

create or replace function public.t24_member_session_participant(p_event_id text)
returns text
language sql stable security definer set search_path = public
as $$
  select participant_id
  from public.member_sessions
  where event_id = p_event_id
    and token_hash = encode(extensions.digest(
      current_setting('request.headers', true)::json->>'x-t24-member-session',
      'sha256'
    ), 'hex')
    and revoked_at is null
    and expires_at > now()
  limit 1
$$;

create or replace function public.t24_has_member_session(p_event_id text)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.t24_member_session_participant(p_event_id) is not null $$;

-- Provision one shared team password out of band against p1 (the frontend
-- deliberately submits p1 for the shared team login), for example:
-- insert into public.member_login_codes
--   values ('your-event-id', 'p1', encode(extensions.digest('one-time-code','sha256'),'hex'),
--           now() + interval '10 minutes');
create or replace function public.t24_start_member_session(
  p_event_id text,
  p_participant_id text,
  p_login_code text
)
returns table (session_id uuid, session_token text, expires_at timestamptz, participant_id text)
language plpgsql security definer set search_path = public
as $$
declare
  code_row public.member_login_codes;
  raw_token text;
  session_expiry timestamptz := now() + interval '30 minutes';
begin
  select * into code_row
  from public.member_login_codes
  where event_id = p_event_id
    and participant_id = p_participant_id
    and code_hash = encode(extensions.digest(p_login_code, 'sha256'), 'hex')
    and expires_at > now()
  for update;
  if code_row.event_id is null then raise exception 'Invalid or expired login code'; end if;
  if not exists (
    select 1 from public.team_members
    where event_id = p_event_id and participant_id = p_participant_id
  ) then raise exception 'Unknown participant'; end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  return query
    insert into public.member_sessions(event_id, participant_id, token_hash, expires_at)
    values (p_event_id, p_participant_id,
            encode(extensions.digest(raw_token, 'sha256'), 'hex'), session_expiry)
    returning id, raw_token, session_expiry, public.member_sessions.participant_id;
end $$;

create or replace function public.t24_record_viewer_heartbeat(
  p_event_id text,
  p_session_id uuid,
  p_participant_id text default null
)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare member_id text := public.t24_member_session_participant(p_event_id);
begin
  if not public.t24_has_event_token(p_event_id) and member_id is null
    then raise exception 'Unauthorized'; end if;
  if member_id is not null then p_participant_id := member_id; end if;
  insert into public.viewer_sessions(id, event_id, participant_id, last_seen_at)
  values (p_session_id, p_event_id, p_participant_id, now())
  on conflict (id) do update set
    last_seen_at = now(), participant_id = excluded.participant_id
  where viewer_sessions.event_id = p_event_id;
  return now();
end $$;

create or replace function public.t24_active_viewer_count(p_event_id text)
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from public.viewer_sessions
  where event_id = p_event_id and last_seen_at > now() - interval '90 seconds'
$$;

create or replace function public.t24_record_cheer(
  p_event_id text,
  p_participant_id text,
  p_client_nonce text
)
returns public.cheers
language plpgsql security definer set search_path = public
as $$
declare member_id text := public.t24_member_session_participant(p_event_id);
declare result public.cheers;
begin
  if not public.t24_has_event_token(p_event_id) and member_id is null
    then raise exception 'Unauthorized'; end if;
  if not exists (select 1 from public.team_members
                 where event_id = p_event_id and participant_id = p_participant_id)
    then raise exception 'Unknown participant'; end if;
  insert into public.cheers(event_id, participant_id, sender_participant_id, client_nonce)
  values (p_event_id, p_participant_id, coalesce(member_id, '__event_token__'), p_client_nonce)
  on conflict (event_id, participant_id, sender_participant_id, client_nonce)
  do update set client_nonce = excluded.client_nonce
  returning * into result;
  return result;
end $$;

create or replace function public.t24_cheer_totals(p_event_id text)
returns table (participant_id text, total bigint)
language sql stable security definer set search_path = public
as $$
  select participant_id, count(*) from public.cheers
  where event_id = p_event_id group by participant_id
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'viewer_sessions') then
    alter publication supabase_realtime add table public.viewer_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'cheers') then
    alter publication supabase_realtime add table public.cheers;
  end if;
end $$;
