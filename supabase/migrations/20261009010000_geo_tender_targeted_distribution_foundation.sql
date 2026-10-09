alter table public.requests
  add column if not exists distribution_mode text not null default 'targeted',
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='requests_distribution_mode_check' and conrelid='public.requests'::regclass) then
    alter table public.requests add constraint requests_distribution_mode_check check (distribution_mode in ('targeted','broadcast'));
  end if;
  if not exists (select 1 from pg_constraint where conname='requests_destination_lat_check' and conrelid='public.requests'::regclass) then
    alter table public.requests add constraint requests_destination_lat_check check (destination_lat is null or (destination_lat between -90 and 90));
  end if;
  if not exists (select 1 from pg_constraint where conname='requests_destination_lng_check' and conrelid='public.requests'::regclass) then
    alter table public.requests add constraint requests_destination_lng_check check (destination_lng is null or (destination_lng between -180 and 180));
  end if;
end $$;

create table if not exists public.supplier_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_type text not null check (capability_type in ('aviation','travel_agent','tour_operator','hotel','transport','guide','restaurant','visa','other')),
  region text,
  city text,
  district text,
  address text,
  latitude double precision check (latitude is null or (latitude between -90 and 90)),
  longitude double precision check (longitude is null or (longitude between -180 and 180)),
  capacity integer check (capacity is null or capacity >= 0),
  min_price numeric check (min_price is null or min_price >= 0),
  currency text check (currency is null or currency in ('USD','UZS','EUR','RUB')),
  price_basis text check (price_basis is null or price_basis in ('total','per_person','per_room_night','per_person_night','per_vehicle','per_hour','per_day','per_unit')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object' and octet_length(details::text) <= 32000),
  onboarding_status text not null default 'in_progress' check (onboarding_status in ('seeded','in_progress','complete')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, capability_type)
);

create index if not exists supplier_capabilities_type_city_idx on public.supplier_capabilities (capability_type, lower(city)) where is_active;
create index if not exists supplier_capabilities_profile_idx on public.supplier_capabilities (profile_id, is_active);

alter table public.supplier_capabilities enable row level security;

drop policy if exists "Users can view own supplier capabilities" on public.supplier_capabilities;
create policy "Users can view own supplier capabilities" on public.supplier_capabilities
  for select to authenticated
  using (
    profile_id=(select auth.uid())
    or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.is_active is true and p.registration_status='active')
  );

drop policy if exists "Users can create own supplier capabilities" on public.supplier_capabilities;
create policy "Users can create own supplier capabilities" on public.supplier_capabilities
  for insert to authenticated
  with check (
    profile_id=(select auth.uid())
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active')
  );

drop policy if exists "Users can update own supplier capabilities" on public.supplier_capabilities;
create policy "Users can update own supplier capabilities" on public.supplier_capabilities
  for update to authenticated
  using (profile_id=(select auth.uid()))
  with check (
    profile_id=(select auth.uid())
    and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active')
  );

drop policy if exists "Users can delete own supplier capabilities" on public.supplier_capabilities;
create policy "Users can delete own supplier capabilities" on public.supplier_capabilities
  for delete to authenticated
  using (profile_id=(select auth.uid()));

create table if not exists public.request_targets (
  request_id uuid not null references public.requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability_id uuid references public.supplier_capabilities(id) on delete set null,
  match_score integer not null default 0,
  distance_km numeric,
  match_reason jsonb not null default '{}'::jsonb check (jsonb_typeof(match_reason)='object' and octet_length(match_reason::text) <= 8000),
  status text not null default 'matched' check (status in ('matched','notified','viewed','responded','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);

create index if not exists request_targets_profile_status_idx on public.request_targets (profile_id, status, created_at desc);
create index if not exists request_targets_request_score_idx on public.request_targets (request_id, match_score desc);

alter table public.request_targets enable row level security;

drop policy if exists "Targets can view assigned requests" on public.request_targets;
create policy "Targets can view assigned requests" on public.request_targets
  for select to authenticated
  using (
    profile_id=(select auth.uid())
    or exists(select 1 from public.requests r where r.id=request_targets.request_id and r.created_by=(select auth.uid()))
    or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.is_active is true and p.registration_status='active')
  );

insert into public.supplier_capabilities(profile_id, capability_type, city, details, onboarding_status)
select p.id,
  case p.agent_type
    when 'Aviakassa' then 'aviation'
    when 'Turagent' then 'travel_agent'
    when 'Turoperator' then 'tour_operator'
    when 'Mehmonxona' then 'hotel'
    when 'Transport' then 'transport'
    when 'Gid' then 'guide'
    else 'other'
  end,
  nullif(trim(p.city),''),
  jsonb_build_object('services',to_jsonb(coalesce(p.services,'{}'::text[])),'seeded_from_agent_type',coalesce(p.agent_type,'Boshqa')),
  'seeded'
from public.profiles p
where p.is_active is true and p.registration_status='active' and nullif(trim(coalesce(p.agent_type,'')),'') is not null
on conflict (profile_id, capability_type) do nothing;

create or replace function app_private.refresh_request_targets_internal(p_request_id uuid, p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.requests%rowtype;
  v_pax integer;
  v_count integer;
begin
  select * into v_request from public.requests where id=p_request_id;
  if not found then return 0; end if;
  if v_request.status <> 'open' or v_request.distribution_mode <> 'targeted' then
    delete from public.request_targets where request_id=p_request_id and status<>'responded';
    return 0;
  end if;
  v_pax:=greatest(0,coalesce(v_request.adults,0)+coalesce(v_request.children,0)+coalesce(v_request.infants,0));
  delete from public.request_targets where request_id=p_request_id and status<>'responded';

  with candidates as (
    select c.id as capability_id,c.profile_id,c.capability_type,c.city,c.region,c.district,c.latitude,c.longitude,c.capacity,c.min_price,c.currency,c.onboarding_status,
      p.city as profile_city,p.is_verified,
      case
        when v_request.category='Mehmonxona' and c.capability_type='hotel' then 60
        when v_request.category='Transfer' and c.capability_type='transport' then 60
        when v_request.category='Gid' and c.capability_type='guide' then 60
        when v_request.category='Aviachipta' and c.capability_type='aviation' then 60
        when v_request.category='Tur paket' and c.capability_type='tour_operator' then 60
        when v_request.category='Viza' and c.capability_type='visa' then 60
        when v_request.category='Boshqa' and c.capability_type in ('other','restaurant') then 55
        when c.capability_type='travel_agent' and v_request.category in ('Aviachipta','Tur paket','Mehmonxona','Transfer','Viza','Boshqa') then 32
        when c.capability_type='tour_operator' and v_request.category in ('Tur paket','Mehmonxona','Transfer','Gid','Viza','Boshqa') then 38
        else 0
      end as type_score,
      case
        when v_request.destination_lat is not null and v_request.destination_lng is not null and c.latitude is not null and c.longitude is not null then
          111.045 * sqrt(power(c.latitude-v_request.destination_lat,2) + power((c.longitude-v_request.destination_lng)*cos(radians(v_request.destination_lat)),2))
        else null
      end as distance_km
    from public.supplier_capabilities c
    join public.profiles p on p.id=c.profile_id
    where c.is_active is true
      and p.is_active is true
      and p.registration_status='active'
      and c.profile_id<>v_request.created_by
      and not (c.capability_type in ('hotel','transport') and c.capacity is not null and v_pax>0 and c.capacity<v_pax)
  ), scored as (
    select *,
      type_score
      + case when is_verified then 12 else 0 end
      + case onboarding_status when 'complete' then 15 when 'in_progress' then 6 else 2 end
      + case
          when distance_km is not null and distance_km<=10 then 40
          when distance_km is not null and distance_km<=50 then 32
          when distance_km is not null and distance_km<=150 then 22
          when distance_km is not null and distance_km<=300 then 10
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and lower(trim(coalesce(city,profile_city,'')))=lower(trim(v_request.destination)) then 34
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and length(trim(coalesce(city,profile_city,'')))>1 and (position(lower(trim(coalesce(city,profile_city,''))) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(coalesce(city,profile_city,''))))>0) then 24
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and region is not null and length(trim(region))>1 and (position(lower(trim(region)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(region)))>0) then 16
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and district is not null and length(trim(district))>1 and (position(lower(trim(district)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(district)))>0) then 12
          else 0
        end
      + case when v_pax>0 and capacity is not null and capacity>=v_pax then 10 else 0 end
      + case when v_request.budget is not null and min_price is not null and min_price<=v_request.budget and (currency is null or currency=v_request.currency) then 6 else 0 end
      as total_score
    from candidates where type_score>0
  ), picked as (
    select * from scored order by total_score desc, distance_km asc nulls last, profile_id limit greatest(1,least(coalesce(p_limit,20),30))
  )
  insert into public.request_targets(request_id,profile_id,capability_id,match_score,distance_km,match_reason,status)
  select p_request_id,profile_id,capability_id,total_score,
    case when distance_km is null then null else round(distance_km::numeric,1) end,
    jsonb_build_object(
      'capability_type',capability_type,
      'onboarding_status',onboarding_status,
      'verified',is_verified,
      'capacity',capacity,
      'pax',v_pax,
      'destination',v_request.destination,
      'city',coalesce(city,profile_city)
    ),'matched'
  from picked
  on conflict (request_id,profile_id) do update set
    capability_id=excluded.capability_id,
    match_score=excluded.match_score,
    distance_km=excluded.distance_km,
    match_reason=excluded.match_reason,
    updated_at=now()
  where public.request_targets.status not in ('responded','declined');

  select count(*) into v_count from public.request_targets where request_id=p_request_id;
  return v_count;
end;
$$;

revoke all on function app_private.refresh_request_targets_internal(uuid,integer) from public, anon, authenticated;

create or replace function public.refresh_request_targets(p_request_id uuid, p_limit integer default 20)
returns table(profile_id uuid, capability_id uuid, match_score integer, distance_km numeric, match_reason jsonb, status text)
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_is_admin boolean:=false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select created_by into v_owner from public.requests where id=p_request_id;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  select exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.is_active is true and p.registration_status='active') into v_is_admin;
  if v_owner<>v_uid and not v_is_admin then raise exception 'not_request_owner' using errcode='42501'; end if;
  perform app_private.refresh_request_targets_internal(p_request_id,p_limit);
  return query select rt.profile_id,rt.capability_id,rt.match_score,rt.distance_km,rt.match_reason,rt.status from public.request_targets rt where rt.request_id=p_request_id order by rt.match_score desc,rt.profile_id;
end;
$$;

revoke all on function public.refresh_request_targets(uuid,integer) from public, anon;
grant execute on function public.refresh_request_targets(uuid,integer) to authenticated, service_role;

create or replace function app_private.auto_target_request()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='open' and new.distribution_mode='targeted' then
    perform app_private.refresh_request_targets_internal(new.id,20);
  elsif tg_op='UPDATE' then
    delete from public.request_targets where request_id=new.id and status<>'responded';
  end if;
  return new;
end;
$$;

revoke all on function app_private.auto_target_request() from public, anon, authenticated;

drop trigger if exists trg_requests_auto_target on public.requests;
create trigger trg_requests_auto_target
after insert or update of category,destination,destination_lat,destination_lng,adults,children,infants,budget,currency,service_details,distribution_mode,status
on public.requests for each row execute function app_private.auto_target_request();

do $$ declare r record; begin
  for r in select id from public.requests where status='open' and distribution_mode='targeted' loop
    perform app_private.refresh_request_targets_internal(r.id,20);
  end loop;
end $$;

drop policy if exists "Signed in agents can view requests" on public.requests;
create policy "Signed in agents can view requests" on public.requests
for select to authenticated
using (
  exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')
  and (
    created_by=(select auth.uid())
    or distribution_mode='broadcast'
    or exists(select 1 from public.request_targets rt where rt.request_id=requests.id and rt.profile_id=(select auth.uid()) and rt.status in ('matched','notified','viewed','responded'))
    or exists(select 1 from public.profiles adminp where adminp.id=(select auth.uid()) and adminp.role='admin' and adminp.is_active is true and adminp.registration_status='active')
  )
);

drop policy if exists "Agents can create own offers" on public.offers;
create policy "Agents can create own offers" on public.offers
for insert to authenticated
with check (
  agent_id=(select auth.uid()) and status='pending'
  and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')
  and exists(
    select 1 from public.requests r
    where r.id=offers.request_id and r.status='open' and r.created_by<>(select auth.uid())
      and (
        r.distribution_mode='broadcast'
        or exists(select 1 from public.request_targets rt where rt.request_id=r.id and rt.profile_id=(select auth.uid()) and rt.status in ('matched','notified','viewed','responded'))
      )
  )
);
