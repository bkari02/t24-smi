create or replace function public.t24_cheer_summary(p_event_id text)
returns table (participant_id text, total bigint, recent bigint)
language sql stable security definer set search_path = public
as $$
  select members.participant_id,
    count(cheers.id) as total,
    count(cheers.id) filter (where cheers.created_at > now() - interval '5 minutes') as recent
  from public.team_members as members
  left join public.cheers as cheers
    on cheers.event_id = p_event_id
    and cheers.participant_id = members.participant_id
  where members.event_id = p_event_id
  group by members.participant_id
$$;
