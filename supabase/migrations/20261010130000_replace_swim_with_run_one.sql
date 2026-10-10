-- Replace the cancelled swim phase with the first 2.5 km run.
alter table public.events drop constraint if exists events_current_phase_check;
alter table public.rounds drop constraint if exists rounds_phase_check;

update public.events
set current_phase = 'Run 1'
where current_phase = 'Swim';

update public.events
set current_phase = 'Run 2'
where current_phase = 'Run';

update public.rounds
set phase = 'Run 1'
where phase = 'Swim';

update public.rounds
set phase = 'Run 2'
where phase = 'Run';

alter table public.events
  add constraint events_current_phase_check
  check (current_phase in ('Run 1', 'Bike', 'Run 2'));

alter table public.rounds
  add constraint rounds_phase_check
  check (phase in ('Run 1', 'Bike', 'Run 2'));

create or replace function public.change_phase(p_event_id text, p_phase text)
returns public.events language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if p_phase not in ('Run 1', 'Bike', 'Run 2') then raise exception 'Invalid phase'; end if;
  update public.events set current_phase = p_phase, updated_at = now() where id = p_event_id returning * into e;
  perform public.t24_record_action(p_event_id, 'change_phase', jsonb_build_object('phase', p_phase));
  return e;
end $$;

create or replace function public.start_round(p_event_id text)
returns public.rounds language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  r public.rounds;
  n integer;
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  select * into e from public.events where id = p_event_id for update;
  if e.id is null then raise exception 'Event not found'; end if;
  if exists(select 1 from public.rounds where event_id = p_event_id and finished_at is null) then raise exception 'A round is already active'; end if;
  select coalesce(max(round_number), 0) + 1 into n
    from public.rounds where event_id = p_event_id and phase = e.current_phase;
  insert into public.rounds(event_id, phase, participant_id, round_number, started_at)
    values (p_event_id, e.current_phase, e.active_participant_id, n, now())
    returning * into r;
  perform public.t24_record_action(p_event_id, 'start_round', jsonb_build_object('round_id', r.id));
  return r;
end $$;

create or replace function public.reset_event(p_event_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  delete from public.rounds where event_id = p_event_id;
  update public.events
    set event_started_at = now(), current_phase = 'Run 1',
        active_participant_id = 'p1', next_participant_id = 'p2', updated_at = now()
    where id = p_event_id;
  perform public.t24_record_action(p_event_id, 'reset_event');
end $$;
