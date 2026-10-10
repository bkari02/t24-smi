create or replace function public.t24_cheer_timeline(p_event_id text, p_participant_id text)
returns table (bucket timestamptz, total bigint)
language sql stable security definer set search_path = public
as $$
  select date_trunc('hour', cheers.created_at) as bucket,
    count(*) as total
  from public.cheers as cheers
  where cheers.event_id = p_event_id
    and cheers.participant_id = p_participant_id
  group by 1
  order by 1
$$;
