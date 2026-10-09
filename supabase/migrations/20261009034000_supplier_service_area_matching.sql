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
          when service_area_match is not null then 30
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and length(trim(coalesce(city,profile_city,'')))>1 and (position(lower(trim(coalesce(city,profile_city,''))) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(coalesce(city,profile_city,''))))>0) then 24
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and region is not null and length(trim(region))>1 and (position(lower(trim(region)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(region)))>0) then 16
          when nullif(trim(coalesce(v_request.destination,'')),'') is not null and district is not null and length(trim(district))>1 and (position(lower(trim(district)) in lower(v_request.destination))>0 or position(lower(v_request.destination) in lower(trim(district)))>0) then 12
          else 0
        end
      + case when v_pax>0 and capacity is not null and capacity>=v_pax then 10 else 0 end
      + case when v_request.budget is not null and min_price is not null and min_price<=v_request.budget and (currency is null or currency=v_request.currency) then 6 else 0 end
      as total_score
    from candidates
    where type_score>0
  ), picked as (
    select *
    from scored
    order by total_score desc, distance_km asc nulls last, profile_id
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
      'service_area',service_area_match
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
