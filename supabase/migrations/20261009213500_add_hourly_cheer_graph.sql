create or replace function public.t24_cheer_hourly(p_event_id text, p_participant_id text default null)
returns table (bucket timestamptz, total bigint)
language sql stable security definer set search_path = public
as $$
  select date_trunc('minute', cheers.created_at)
    - make_interval(mins => extract(minute from cheers.created_at)::integer % 5) as bucket,
    count(*) as total
  from public.cheers as cheers
  where cheers.event_id = p_event_id
    and (p_participant_id is null or cheers.participant_id = p_participant_id)
    and cheers.created_at > now() - interval '1 hour'
  group by 1
  order by 1
$$;
