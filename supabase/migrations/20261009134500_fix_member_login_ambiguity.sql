create or replace function public.t24_member_session_participant(p_event_id text)
returns text
language sql stable security definer set search_path = public
as $$
  select sessions.participant_id
  from public.member_sessions as sessions
  where sessions.event_id = p_event_id
    and sessions.token_hash = encode(extensions.digest(
      current_setting('request.headers', true)::json->>'x-t24-member-session',
      'sha256'
    ), 'hex')
    and sessions.revoked_at is null
    and sessions.expires_at > now()
  limit 1
$$;

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
    insert into public.member_sessions as sessions(event_id, participant_id, token_hash, expires_at)
    values (
      p_event_id,
      p_participant_id,
      encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      session_expiry
    )
    returning sessions.id, raw_token, session_expiry, sessions.participant_id;
end $$;
