create or replace function public.match_suppliers_for_request(
  p_request_id uuid,
  p_supplier_type text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  name text,
  supplier_type text,
  region text,
  city text,
  district text,
  status text,
  contact_verified boolean,
  source_type text,
  source_name text,
  star_rating smallint,
  capacity integer,
  services text[],
  has_phone boolean,
  has_email boolean,
  match_score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.requests%rowtype;
  v_type text;
  v_destination text;
  v_requested_stars integer;
  v_pax integer;
  v_is_admin boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and coalesce(p.is_active,false)) into v_is_admin;
  select * into v_request from public.requests where public.requests.id=p_request_id;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  if v_request.created_by<>v_uid and not v_is_admin then raise exception 'not_request_owner' using errcode='42501'; end if;

  v_type := lower(trim(coalesce(p_supplier_type, case v_request.category when 'Mehmonxona' then 'hotel' when 'Gid' then 'guide' when 'Transfer' then 'transport' else '' end)));
  if v_type not in ('hotel','guide','transport','restaurant') then raise exception 'supplier_type_required' using errcode='22023'; end if;

  v_destination := nullif(trim(v_request.destination),'');
  v_pax := greatest(0,coalesce(v_request.adults,0)+coalesce(v_request.children,0)+coalesce(v_request.infants,0));
  if v_type='hotel' and coalesce(v_request.service_details->>'hotel_stars','') ~ '^[1-5]$' then v_requested_stars := (v_request.service_details->>'hotel_stars')::integer; else v_requested_stars := null; end if;

  return query
  select s.id,s.name,s.supplier_type,s.region,s.city,s.district,s.status,s.contact_verified,s.source_type,s.source_name,s.star_rating,s.capacity,s.services,
    (s.phone is not null and trim(s.phone)<>'') as has_phone,
    (s.email is not null and trim(s.email)<>'') as has_email,
    (
      case s.status when 'verified' then 50 when 'contact_verified' then 40 when 'registry' then 30 when 'public_contact' then 20 else 0 end
      + case when s.contact_verified then 12 else 0 end
      + case when s.phone is not null and trim(s.phone)<>'' then 8 else 0 end
      + case when s.email is not null and trim(s.email)<>'' then 6 else 0 end
      + case
          when v_destination is not null and s.city is not null and lower(trim(s.city))=lower(v_destination) then 25
          when v_destination is not null and s.city is not null and length(trim(s.city))>1 and (position(lower(trim(s.city)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.city)))>0) then 20
          when v_destination is not null and s.region is not null and length(trim(s.region))>1 and (position(lower(trim(s.region)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.region)))>0) then 14
          when v_destination is not null and s.district is not null and length(trim(s.district))>1 and (position(lower(trim(s.district)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.district)))>0) then 10
          else 0 end
      + case when v_requested_stars is not null and s.star_rating=v_requested_stars then 10 else 0 end
      + case when v_pax>0 and s.capacity is not null and s.capacity>=v_pax then 5 else 0 end
    )::integer as match_score
  from public.external_suppliers s
  where s.opt_out=false and s.status<>'inactive' and s.supplier_type=v_type
    and (
      v_destination is null
      or (s.city is not null and length(trim(s.city))>1 and (lower(trim(s.city))=lower(v_destination) or position(lower(trim(s.city)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.city)))>0))
      or (s.region is not null and length(trim(s.region))>1 and (position(lower(trim(s.region)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.region)))>0))
      or (s.district is not null and length(trim(s.district))>1 and (position(lower(trim(s.district)) in lower(v_destination))>0 or position(lower(v_destination) in lower(trim(s.district)))>0))
    )
    and (v_requested_stars is null or s.star_rating is null or s.star_rating=v_requested_stars)
    and (v_pax=0 or s.capacity is null or s.capacity>=v_pax)
  order by match_score desc,s.name
  limit greatest(1,least(coalesce(p_limit,20),100));
end;
$$;

revoke all on function public.match_suppliers_for_request(uuid,text,integer) from public, anon;
grant execute on function public.match_suppliers_for_request(uuid,text,integer) to authenticated, service_role;
