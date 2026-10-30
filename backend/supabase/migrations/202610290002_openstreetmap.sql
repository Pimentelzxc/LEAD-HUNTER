begin;

-- Preserve existing Google references. New searches use OpenStreetMap only.
alter table public.leads
  add column source_provider text not null default 'manual' check (source_provider in ('manual','google_places','openstreetmap')),
  add column source_id text,
  add column source_snapshot jsonb;
update public.leads set source_provider = 'google_places' where place_id is not null;

alter table public.leads add constraint leads_source_reference_check check (
  case when source_provider = 'openstreetmap' then
    coalesce(source_id ~ '^(node|way|relation):[1-9][0-9]{0,19}$',false)
    and coalesce(jsonb_typeof(source_snapshot) = 'object',false)
    and coalesce(source_snapshot->>'source' = 'openstreetmap',false)
    and pg_column_size(source_snapshot) <= 16384
  else source_id is null and source_snapshot is null end
);
alter table public.leads drop constraint leads_check;
alter table public.leads add constraint leads_identity_check check (
  place_id is not null or coalesce(length(trim(company_name)),0) > 0
  or (source_provider = 'openstreetmap' and source_id is not null and coalesce(length(trim(source_snapshot->>'name')),0) > 0)
);
create unique index leads_owner_osm_reference on public.leads(created_by,source_provider,source_id) where source_id is not null;
grant insert(source_provider,source_id,source_snapshot) on public.leads to authenticated;

-- Replace unavailable Google review criteria with positive contact signals.
create or replace function private.valid_score_weights(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) <> 'object' then false else
    (select count(*) = 4 from jsonb_object_keys(value))
    and value ?& array['website','instagram','contact','confirmed']
    and (select bool_and(jsonb_typeof(v) = 'number' and v::text ~ '^\d{1,3}$'
      and case when v::text ~ '^\d{1,3}$' then (v::text)::int between 0 and 100 else false end)
      from jsonb_each(value) as item(k,v))
    and (select sum(case when v::text ~ '^\d{1,3}$' then (v::text)::int else -1000 end) = 100
      from jsonb_each(value) as item(k,v)) end;
$$;
update public.profiles set score_weights = case
  when score_weights = '{"reputation":35,"reviews":30,"contact":15,"confirmed":20}'::jsonb
    then '{"website":20,"instagram":20,"contact":20,"confirmed":40}'::jsonb
  else jsonb_build_object('website',score_weights->'reputation','instagram',score_weights->'reviews',
    'contact',score_weights->'contact','confirmed',score_weights->'confirmed') end;
alter table public.profiles alter column score_weights set default '{"website":20,"instagram":20,"contact":20,"confirmed":40}'::jsonb;

create table private.osm_buckets (
  principal text not null,
  period text not null check(period in ('minute','day')),
  window_start timestamptz not null,
  requests integer not null,
  primary key(principal,period,window_start)
);
alter table private.osm_buckets enable row level security;
revoke all on private.osm_buckets from public,anon,authenticated;

create or replace function public.consume_osm_quota()
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  principal_name text;
  period_name text;
  bucket_start timestamptz;
  request_count integer;
  request_limit integer;
begin
  if caller is null then raise exception 'UNAUTHORIZED'; end if;
  delete from private.osm_buckets where window_start < date_trunc('day',now()) - interval '2 days';
  -- Lock the shared day and minute rows first in a consistent order across workers.
  foreach principal_name in array array['app','user:' || caller::text] loop
    foreach period_name in array array['day','minute'] loop
      bucket_start := case when period_name = 'day'
        then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
        else date_trunc('minute',now()) end;
      request_limit := case when principal_name = 'app'
        then case when period_name = 'day' then 100 else 6 end
        else case when period_name = 'day' then 30 else 3 end end;
      insert into private.osm_buckets(principal,period,window_start,requests)
      values(principal_name,period_name,bucket_start,1)
      on conflict(principal,period,window_start) do update set requests = private.osm_buckets.requests + 1
      returning requests into request_count;
      if request_count > request_limit then raise exception 'OSM_QUOTA_%_%',principal_name,period_name; end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.consume_osm_quota() from public,anon;
grant execute on function public.consume_osm_quota() to authenticated;
-- Disable the legacy billable endpoint's prerequisite even if an old Edge
-- Function remains deployed. Its authenticated calls fail before Google fetch.
revoke execute on function public.consume_places_quota() from authenticated;

comment on column public.leads.source_snapshot is 'Explicitly saved normalized OSM fields; © OpenStreetMap contributors, ODbL 1.0. Never Google content.';
commit;
