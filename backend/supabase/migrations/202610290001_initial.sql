begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.valid_score_weights(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) <> 'object' then false else
    (select count(*) = 4 from jsonb_object_keys(value))
    and value ?& array['reputation','reviews','contact','confirmed']
    and (select bool_and(jsonb_typeof(v) = 'number' and v::text ~ '^\d{1,3}$'
        and case when v::text ~ '^\d{1,3}$' then (v::text)::int between 0 and 100 else false end)
      from jsonb_each(value) as item(k,v))
    and (select sum(case when v::text ~ '^\d{1,3}$' then (v::text)::int else -1000 end) = 100
      from jsonb_each(value) as item(k,v)) end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (length(name) <= 120),
  role text not null default 'seller' check (role in ('seller','admin')),
  score_weights jsonb not null default '{"reputation":35,"reviews":30,"contact":15,"confirmed":20}'::jsonb
    check (private.valid_score_weights(score_weights)),
  created_at timestamptz not null default now()
);

create or replace function private.create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1), ''),120))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_profile();

insert into public.profiles(id, name)
select id, left(coalesce(raw_user_meta_data->>'name', split_part(email,'@',1), ''),120) from auth.users
on conflict(id) do nothing;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  place_id text check (place_id is null or (length(place_id) between 5 and 256 and place_id ~ '^[A-Za-z0-9_-]+$')),
  label text check (length(label) <= 150),
  -- These fields are authored from an independent, authorized source ONLY.
  -- No Google business name, address, rating, API response or derived score is persisted.
  company_name text check (length(company_name) <= 180),
  category text check (length(category) <= 100),
  city text check (length(city) <= 100),
  state text check (state is null or state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  contact_phone text check (length(contact_phone) <= 40),
  instagram text check (instagram is null or instagram ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]+/?$'),
  website text check (website is null or (website ~ '^https?://' and length(website) <= 2048)),
  whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{10,15}$'),
  whatsapp_confirmed boolean not null default false,
  opportunity_confirmed boolean not null default false,
  opportunity_evidence text check (length(opportunity_evidence) <= 1000),
  owned_data_source text check (length(owned_data_source) <= 500),
  owned_data_confirmed boolean not null default false,
  favorite boolean not null default false,
  status text not null default 'Novo' check (status in ('Novo','Contatado','Em negociação','Venda concluída','Descartado')),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(created_by, place_id),
  check (place_id is not null or coalesce(length(trim(company_name)),0) > 0),
  check (not whatsapp_confirmed or (whatsapp_phone is not null and owned_data_confirmed)),
  check (not opportunity_confirmed or coalesce(length(trim(opportunity_evidence)),0) >= 5),
  check (
    (company_name is null and category is null and city is null and state is null and contact_phone is null
      and instagram is null and website is null and whatsapp_phone is null and not opportunity_confirmed)
    or (owned_data_confirmed and coalesce(length(trim(owned_data_source)),0) >= 3)
  )
);
create index leads_owner_created on public.leads(created_by, created_at desc);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note text not null check (length(trim(note)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index notes_lead_created on public.lead_notes(lead_id, created_at desc);

create or replace function private.touch_lead()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger touch_lead before update on public.leads for each row execute function private.touch_lead();

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;

create policy profile_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy leads_select on public.leads for select to authenticated using (created_by = (select auth.uid()));
create policy leads_insert on public.leads for insert to authenticated with check (created_by = (select auth.uid()));
create policy leads_update on public.leads for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy leads_delete on public.leads for delete to authenticated using (created_by = (select auth.uid()));
create policy notes_select on public.lead_notes for select to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.leads where id = lead_id and created_by = (select auth.uid()))
);
create policy notes_insert on public.lead_notes for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.leads where id = lead_id and created_by = (select auth.uid()))
);
create policy notes_delete on public.lead_notes for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles, public.leads, public.lead_notes from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(name, score_weights) on public.profiles to authenticated;
grant select, delete on public.leads to authenticated;
grant insert(place_id,label,company_name,category,city,state,contact_phone,instagram,website,whatsapp_phone,whatsapp_confirmed,
  opportunity_confirmed,opportunity_evidence,owned_data_source,owned_data_confirmed,favorite,status,created_by) on public.leads to authenticated;
grant update(label,company_name,category,city,state,contact_phone,instagram,website,whatsapp_phone,whatsapp_confirmed,
  opportunity_confirmed,opportunity_evidence,owned_data_source,owned_data_confirmed,favorite,status) on public.leads to authenticated;
grant select, delete on public.lead_notes to authenticated;
grant insert(lead_id,user_id,note) on public.lead_notes to authenticated;

create table private.places_buckets (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check(period in ('minute','day')),
  window_start timestamptz not null,
  requests integer not null default 0,
  primary key(user_id, period, window_start)
);
alter table private.places_buckets enable row level security;

create or replace function public.consume_places_quota()
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  daily integer;
  per_minute integer;
begin
  if caller is null then raise exception 'UNAUTHORIZED'; end if;
  delete from private.places_buckets where user_id = caller and window_start < date_trunc('day', now()) - interval '2 days';
  insert into private.places_buckets(user_id,period,window_start,requests)
  values(caller,'day',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',1)
  on conflict(user_id,period,window_start) do update set requests = private.places_buckets.requests + 1
  returning requests into daily;
  if daily > 100 then raise exception 'PLACES_QUOTA_DAY'; end if;
  insert into private.places_buckets(user_id,period,window_start,requests)
  values(caller,'minute',date_trunc('minute',now()),1)
  on conflict(user_id,period,window_start) do update set requests = private.places_buckets.requests + 1
  returning requests into per_minute;
  if per_minute > 10 then raise exception 'PLACES_QUOTA_MINUTE'; end if;
end;
$$;
revoke all on function public.consume_places_quota() from public, anon;
grant execute on function public.consume_places_quota() to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
-- The pure constraint validator is callable; private tables remain inaccessible.
grant usage on schema private to authenticated;
grant execute on function private.valid_score_weights(jsonb) to authenticated;

commit;
