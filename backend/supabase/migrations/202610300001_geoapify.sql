begin;

-- Additional OSM-based provider; existing leads and seller policies are retained.
alter table public.leads drop constraint leads_source_provider_check;
alter table public.leads add constraint leads_source_provider_check
  check(source_provider in ('manual','google_places','openstreetmap','geoapify'));

alter table public.leads drop constraint leads_source_reference_check;
alter table public.leads add constraint leads_source_reference_check check (
  case when source_provider in ('openstreetmap','geoapify') then
    coalesce(case when source_provider='openstreetmap'
      then source_id ~ '^(node|way|relation):[1-9][0-9]{0,19}$'
      else length(source_id) between 2 and 1024 and source_id ~ '^[A-Za-z0-9_-]+$' end,false)
    and coalesce(jsonb_typeof(source_snapshot)='object',false)
    and coalesce(source_snapshot->>'source'=source_provider,false)
    and coalesce(jsonb_typeof(source_snapshot->'name')='string',false)
    and pg_column_size(source_snapshot)<=16384
  else source_id is null and source_snapshot is null end
);
alter table public.leads drop constraint leads_identity_check;
alter table public.leads add constraint leads_identity_check check (
  place_id is not null or coalesce(length(trim(company_name)),0)>0
  or (source_provider in ('openstreetmap','geoapify') and source_id is not null
    and coalesce(length(trim(source_snapshot->>'name')),0)>0)
);
-- Updating a saved source snapshot remains an explicit action, under owner RLS.
grant update(source_snapshot) on public.leads to authenticated;

comment on column public.leads.source_snapshot is 'Explicitly saved normalized open data. Retain OSM/ODbL and Geoapify attribution when applicable. No API keys or Google content.';
commit;
