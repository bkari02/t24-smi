create table if not exists public.events (
  id text primary key,
  name text not null,
  event_started_at timestamptz not null,
  current_phase text not null check (current_phase in ('Swim', 'Bike', 'Run')),
  active_participant_id text not null,
  next_participant_id text not null,
  status text not null default 'active' check (status in ('setup', 'active', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null,
  name text not null,
  color text not null,
  sort_order integer not null,
  primary key (event_id, participant_id)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  phase text not null check (phase in ('Swim', 'Bike', 'Run')),
  participant_id text not null,
  round_number integer not null check (round_number > 0),
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, phase, round_number)
);

create unique index if not exists one_open_round_per_event
  on public.rounds(event_id) where finished_at is null;

create table if not exists public.event_actions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  performed_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.team_members enable row level security;
alter table public.rounds enable row level security;
alter table public.event_actions enable row level security;

create policy "event token can read events" on public.events for select to anon, authenticated using (public.t24_has_event_token(id));
create policy "event token can read members" on public.team_members for select to anon, authenticated using (public.t24_has_event_token(event_id));
create policy "event token can read rounds" on public.rounds for select to anon, authenticated using (public.t24_has_event_token(event_id));
create policy "event token can read actions" on public.event_actions for select to anon, authenticated using (public.t24_has_event_token(event_id));

create or replace function public.t24_record_action(p_event_id text, p_action text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.event_actions(event_id, action_type, payload) values (p_event_id, p_action, p_payload);
$$;

create or replace function public.start_round(p_event_id text)
returns public.rounds language plpgsql security definer set search_path = public as $$
declare e public.events; r public.rounds; n integer;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  select * into e from public.events where id = p_event_id for update;
  if e.id is null then raise exception 'Event not found'; end if;
  if exists(select 1 from public.rounds where event_id = p_event_id and finished_at is null) then raise exception 'A round is already active'; end if;
  select coalesce(max(round_number), 0) + 1 into n from public.rounds where event_id = p_event_id and phase = e.current_phase;
  insert into public.rounds(event_id, phase, participant_id, round_number, started_at)
    values (p_event_id, e.current_phase, e.active_participant_id, n, now()) returning * into r;
  update public.events set updated_at = now() where id = p_event_id;
  perform public.t24_record_action(p_event_id, 'start_round', jsonb_build_object('round_id', r.id));
  return r;
end $$;

create or replace function public.finish_round(p_event_id text)
returns public.rounds language plpgsql security definer set search_path = public as $$
declare r public.rounds;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  update public.rounds set finished_at = now(), updated_at = now()
    where event_id = p_event_id and finished_at is null returning * into r;
  if r.id is null then raise exception 'No active round'; end if;
  update public.events set updated_at = now() where id = p_event_id;
  perform public.t24_record_action(p_event_id, 'finish_round', jsonb_build_object('round_id', r.id));
  return r;
end $$;

create or replace function public.handover(p_event_id text, p_next_participant_id text)
returns public.events language plpgsql security definer set search_path = public as $$
declare e public.events; r public.rounds;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  select * into e from public.events where id = p_event_id for update;
  if not exists(select 1 from public.team_members where event_id = p_event_id and participant_id = p_next_participant_id) then raise exception 'Unknown participant'; end if;
  update public.rounds set finished_at = coalesce(finished_at, now()), updated_at = now()
    where event_id = p_event_id and finished_at is null returning * into r;
  update public.events set active_participant_id = p_next_participant_id,
    next_participant_id = (select participant_id from public.team_members where event_id = p_event_id and participant_id <> p_next_participant_id order by sort_order limit 1),
    updated_at = now() where id = p_event_id returning * into e;
  perform public.t24_record_action(p_event_id, 'handover', jsonb_build_object('next_participant_id', p_next_participant_id));
  return e;
end $$;

create or replace function public.change_phase(p_event_id text, p_phase text)
returns public.events language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if p_phase not in ('Swim', 'Bike', 'Run') then raise exception 'Invalid phase'; end if;
  update public.events set current_phase = p_phase, updated_at = now() where id = p_event_id returning * into e;
  perform public.t24_record_action(p_event_id, 'change_phase', jsonb_build_object('phase', p_phase));
  return e;
end $$;

create or replace function public.set_next_participant(p_event_id text, p_next_participant_id text)
returns public.events language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from public.team_members where event_id = p_event_id and participant_id = p_next_participant_id) then raise exception 'Unknown participant'; end if;
  update public.events set next_participant_id = p_next_participant_id, updated_at = now()
    where id = p_event_id returning * into e;
  perform public.t24_record_action(p_event_id, 'set_next_participant', jsonb_build_object('next_participant_id', p_next_participant_id));
  return e;
end $$;

create or replace function public.reset_event(p_event_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  delete from public.rounds where event_id = p_event_id;
  update public.events set event_started_at = now(), current_phase = 'Swim', active_participant_id = 'p1', next_participant_id = 'p2', updated_at = now() where id = p_event_id;
  perform public.t24_record_action(p_event_id, 'reset_event');
end $$;

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.team_members;
alter publication supabase_realtime add table public.rounds;

-- Replace placeholders and run once after applying this migration:
-- insert into public.events(id,name,event_started_at,current_phase,active_participant_id,next_participant_id)
-- values ('your-event-id','T24 Team',now(),'Swim','p1','p2');
-- insert into public.team_members(event_id,participant_id,name,color,sort_order) values
-- ('your-event-id','p1','Kieeesch','#f26b4f',1), ('your-event-id','p2','Lilli','#4cc9a4',2),
-- ('your-event-id','p3','Jule','#f6c85f',3), ('your-event-id','p4','Matze','#91a7ff',4),
-- ('your-event-id','p5','Benni','#d28cff',5);
