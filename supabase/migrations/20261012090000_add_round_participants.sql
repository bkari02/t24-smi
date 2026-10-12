create table if not exists public.round_participants (
  event_id text not null references public.events(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  participant_id text not null,
  primary key (round_id, participant_id),
  foreign key (event_id, participant_id)
    references public.team_members(event_id, participant_id)
    on delete cascade
);

create index if not exists round_participants_event_participant_idx
  on public.round_participants(event_id, participant_id);

alter table public.round_participants enable row level security;

drop policy if exists "event token can read round participants" on public.round_participants;
create policy "event token can read round participants"
  on public.round_participants
  for select to anon, authenticated
  using (public.t24_has_event_token(event_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_participants'
  ) then
    alter publication supabase_realtime add table public.round_participants;
  end if;
end $$;
