create table if not exists public.athlete_questions (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null,
  asker_name text not null default 'Fan',
  question text not null,
  answer text,
  asked_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists athlete_questions_public_idx
  on public.athlete_questions(event_id, answered_at desc);

create index if not exists athlete_questions_pending_idx
  on public.athlete_questions(event_id, participant_id, answered_at, asked_at);

alter table public.athlete_questions enable row level security;
revoke all on public.athlete_questions from anon, authenticated;

create or replace function public.t24_submit_athlete_question(
  p_event_id text,
  p_participant_id text,
  p_asker_name text,
  p_question text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare question_id uuid;
declare clean_name text := nullif(trim(p_asker_name), '');
declare clean_question text := nullif(trim(p_question), '');
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and active_participant_id = p_participant_id
  ) then raise exception 'Questions are only open for the active athlete'; end if;
  if clean_name is null or length(clean_name) > 40 then raise exception 'Invalid asker name'; end if;
  if clean_question is null or length(clean_question) > 240 then raise exception 'Question must be 1 to 240 characters'; end if;
  if exists (
    select 1 from public.athlete_questions
    where event_id = p_event_id and asker_name = clean_name
      and asked_at > now() - interval '60 seconds'
  ) then raise exception 'Please wait before asking another question'; end if;
  insert into public.athlete_questions(event_id, participant_id, asker_name, question)
  values (p_event_id, p_participant_id, clean_name, clean_question)
  returning id into question_id;
  return question_id;
end $$;

create or replace function public.t24_pending_athlete_questions(
  p_event_id text,
  p_participant_id text
)
returns table (
  id uuid, participant_id text, asker_name text, question text,
  answer text, asked_at timestamptz, answered_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select id, participant_id, asker_name, question, answer, asked_at, answered_at
  from public.athlete_questions
  where public.t24_has_event_token(p_event_id)
    and event_id = p_event_id and participant_id = p_participant_id
    and answered_at is null
  order by asked_at
$$;

create or replace function public.t24_answer_athlete_question(
  p_event_id text,
  p_question_id uuid,
  p_participant_id text,
  p_answer text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare clean_answer text := nullif(trim(p_answer), '');
begin
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if not public.t24_has_event_token(p_event_id) then raise exception 'Unauthorized'; end if;
  if clean_answer is null or length(clean_answer) > 500 then raise exception 'Answer must be 1 to 500 characters'; end if;
  update public.athlete_questions
  set answer = clean_answer, answered_at = now()
  where id = p_question_id and event_id = p_event_id
    and participant_id = p_participant_id and answered_at is null;
  if not found then raise exception 'Question is unavailable'; end if;
end $$;

create or replace function public.t24_published_athlete_questions(p_event_id text)
returns table (
  id uuid, participant_id text, asker_name text, question text,
  answer text, asked_at timestamptz, answered_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select id, participant_id, asker_name, question, answer, asked_at, answered_at
  from public.athlete_questions
  where public.t24_has_event_token(p_event_id)
    and event_id = p_event_id and answered_at is not null
  order by answered_at desc
$$;
