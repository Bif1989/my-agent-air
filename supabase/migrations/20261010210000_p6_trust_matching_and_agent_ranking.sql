-- P6 final: make verified reputation an explainable, bounded signal in Geo-Tender
-- and expose an efficient trust-aware agent directory without N+1 client reads.

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
  v_capability_types text[];
begin
  select * into v_request from public.requests where id=p_request_id;
  if not found then return 0; end if;

  if v_request.status <> 'open' or v_request.distribution_mode <> 'targeted' then
    delete from public.request_targets
    where request_id=p_request_id and status not in ('responded','declined');
    return 0;
  end if;

  v_pax:=greatest(0,coalesce(v_request.adults,0)+coalesce(v_request.children,0)+coalesce(v_request.infants,0));
  v_capability_types:=case v_request.category
    when 'Mehmonxona' then array['hotel','travel_agent','tour_operator']::text[]
    when 'Transfer' then array['transport','travel_agent','tour_operator']::text[]
    when 'Gid' then array['guide','tour_operator']::text[]
    when 'Aviachipta' then array['aviation','travel_agent']::text[]
    when 'Tur paket' then array['tour_operator','travel_agent']::text[]
    when 'Viza' then array['visa','travel_agent','tour_operator']::text[]
    when 'Boshqa' then array['other','restaurant','travel_agent','tour_operator']::text[]
    else array[]::text[]
  end;

  -- Preserve terminal engagement history so a supplier who declined a tender is
  -- not immediately re-matched by a manual/automatic refresh.
  delete from public.request_targets
  where request_id=p_request_id and status not in ('responded','declined');

  with candidates as (
    select
      c.id as capability_id,
      c.profile_id,
      c.capability_type,
      c.city,
      c.region,
      c.district,
      c.latitude,
      c.longitude,
      c.capacity,
      c.min_price,
      c.currency,
      c.onboarding_status,
      p.city as profile_city,
      p.is_verified,
      coalesce(ts.trust_score,30)::integer as trust_score,
      coalesce(ts.review_count,0)::integer as review_count,
      ts.rating_average,
      coalesce(ts.completed_deals,0)::integer as completed_deals,
      case
        when coalesce(ts.completed_deals,0)>0 or coalesce(ts.review_count,0)>0 then
          greatest(0,least(10,round(((coalesce(ts.trust_score,30)-30)::numeric*10)/70)::integer))
        else 0
      end as trust_bonus,
      (
        select area.value
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(c.details->'service_areas')='array' then c.details->'service_areas'
            else '[]'::jsonb
          end
        ) as area(value)
        where nullif(trim(coalesce(v_request.destination,'')),'') is not null
          and length(trim(area.value))>1
          and (
            position(lower(trim(area.value)) in lower(v_request.destination))>0
            or position(lower(v_request.destination) in lower(trim(area.value)))>0
          )
        order by length(area.value) desc
        limit 1
      ) as service_area_match,
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
    left join public.profile_trust_stats ts on ts.user_id=c.profile_id
    where c.is_active is true
      and c.capability_type=any(v_capability_types)
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
          when service_area_match is not null then 30
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and length(trim(coalesce(city,profile_city,'')))>1 and (position(lower(trim(coalesce(city,profile_city,''))) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(coalesce(city,profile_city,''))))>0) then 24
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and region is not null and length(trim(region))>1 and (position(lower(trim(region)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(region)))>0) then 16
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and district is not null and length(trim(district))>1 and (position(lower(trim(district)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(district)))>0) then 12
          else 0
        end
      + case when v_pax>0 and capacity is not null and capacity>=v_pax then 10 else 0 end
      + case when v_request.budget is not null and min_price is not null and min_price<=v_request.budget and (currency is null or currency=v_request.currency) then 6 else 0 end
      + trust_bonus
      as total_score
    from candidates
    where type_score>0
  ), best_capability_per_profile as (
    -- A supplier can expose several capabilities. Keep only its strongest match so
    -- one INSERT never tries to affect the same (request_id, profile_id) twice.
    select distinct on (profile_id) *
    from scored
    order by profile_id,total_score desc,distance_km asc nulls last,capability_id
  ), picked as (
    select *
    from best_capability_per_profile
    order by total_score desc,distance_km asc nulls last,profile_id
    limit greatest(1,least(coalesce(p_limit,20),30))
  )
  insert into public.request_targets(request_id,profile_id,capability_id,match_score,distance_km,match_reason,status)
  select
    p_request_id,
    profile_id,
    capability_id,
    total_score,
    case when distance_km is null then null else round(distance_km::numeric,1) end,
    jsonb_build_object(
      'capability_type',capability_type,
      'onboarding_status',onboarding_status,
      'verified',is_verified,
      'capacity',capacity,
      'pax',v_pax,
      'destination',v_request.destination,
      'city',coalesce(city,profile_city),
      'service_area',service_area_match,
      'trust_score',trust_score,
      'trust_bonus',trust_bonus,
      'rating_average',rating_average,
      'review_count',review_count,
      'completed_deals',completed_deals
    ),
    'matched'
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

create or replace function public.list_agents_with_trust(
  p_search text default null,
  p_city text default null,
  p_agent_type text default null,
  p_service text default null,
  p_verified_only boolean default false,
  p_sort text default 'trust_desc',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  company_name text,
  city text,
  phone text,
  agent_type text,
  services text[],
  is_verified boolean,
  is_active boolean,
  registration_status text,
  created_at timestamptz,
  trust_score integer,
  rating_average numeric,
  review_count integer,
  completed_deals integer
)
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_search text:=nullif(left(trim(coalesce(p_search,'')),100),'');
  v_sort text:=case when p_sort in ('trust_desc','newest','oldest','name_asc','name_desc') then p_sort else 'trust_desc' end;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.company_name,
    p.city,
    p.phone,
    p.agent_type,
    p.services,
    p.is_verified,
    p.is_active,
    p.registration_status,
    p.created_at,
    coalesce(ts.trust_score,30)::integer as trust_score,
    ts.rating_average,
    coalesce(ts.review_count,0)::integer as review_count,
    coalesce(ts.completed_deals,0)::integer as completed_deals
  from public.profiles p
  left join public.profile_trust_stats ts on ts.user_id=p.id
  where p.is_active is true
    and p.registration_status='active'
    and nullif(trim(p.company_name),'') is not null
    and nullif(trim(p.city),'') is not null
    and nullif(trim(p.phone),'') is not null
    and nullif(trim(p.agent_type),'') is not null
    and p.agent_type<>'agent'
    and (v_search is null
      or position(lower(v_search) in lower(coalesce(p.full_name,'')))>0
      or position(lower(v_search) in lower(coalesce(p.company_name,'')))>0
      or position(lower(v_search) in lower(coalesce(p.city,'')))>0)
    and (nullif(trim(coalesce(p_city,'')),'') is null or p.city=p_city)
    and (nullif(trim(coalesce(p_agent_type,'')),'') is null or p.agent_type=p_agent_type)
    and (nullif(trim(coalesce(p_service,'')),'') is null or p_service=any(coalesce(p.services,array[]::text[])))
    and (not coalesce(p_verified_only,false) or p.is_verified is true)
  order by
    case when v_sort='trust_desc' then coalesce(ts.trust_score,30) end desc nulls last,
    case when v_sort='trust_desc' then ts.rating_average end desc nulls last,
    case when v_sort='trust_desc' then coalesce(ts.review_count,0) end desc,
    case when v_sort='trust_desc' then coalesce(ts.completed_deals,0) end desc,
    case when v_sort='newest' then p.created_at end desc,
    case when v_sort='oldest' then p.created_at end asc,
    case when v_sort='name_asc' then lower(coalesce(p.full_name,p.company_name,'')) end asc,
    case when v_sort='name_desc' then lower(coalesce(p.full_name,p.company_name,'')) end desc,
    p.id
  limit greatest(1,least(coalesce(p_limit,24),100))
  offset greatest(0,coalesce(p_offset,0));
end;
$$;

revoke all on function public.list_agents_with_trust(text,text,text,text,boolean,text,integer,integer) from public, anon;
grant execute on function public.list_agents_with_trust(text,text,text,text,boolean,text,integer,integer) to authenticated, service_role;

-- Re-score currently open targeted tenders once so existing matches benefit from P6
-- immediately. Terminal responded/declined rows remain untouched by the function.
do $$
declare
  r record;
begin
  for r in
    select id from public.requests where status='open' and distribution_mode='targeted'
  loop
    perform app_private.refresh_request_targets_internal(r.id,20);
  end loop;
end;
$$;
