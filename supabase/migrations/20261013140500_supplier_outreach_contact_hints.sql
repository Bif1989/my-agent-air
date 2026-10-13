create or replace function public.match_suppliers_for_request_v2(
  p_request_id uuid,
  p_supplier_type text default null,
  p_limit integer default 20
)
returns table(
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
  phone_hint text,
  email_hint text,
  match_score integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  return query
  select
    m.id,
    m.name,
    m.supplier_type,
    m.region,
    m.city,
    m.district,
    m.status,
    m.contact_verified,
    m.source_type,
    m.source_name,
    m.star_rating,
    m.capacity,
    m.services,
    m.has_phone,
    m.has_email,
    case
      when app_private.first_uz_phone(s.phone) is not null then
        '+998 ** *** ' || substr(app_private.first_uz_phone(s.phone), 9, 2) || ' ' || right(app_private.first_uz_phone(s.phone), 2)
      else null
    end as phone_hint,
    case
      when nullif(trim(coalesce(s.email, '')), '') is not null then
        left(trim(s.email), 1) || '***@' || split_part(trim(s.email), '@', 2)
      else null
    end as email_hint,
    m.match_score
  from public.match_suppliers_for_request(p_request_id, p_supplier_type, p_limit) m
  join public.external_suppliers s on s.id = m.id;
end;
$$;

revoke all on function public.match_suppliers_for_request_v2(uuid,text,integer) from public, anon;
grant execute on function public.match_suppliers_for_request_v2(uuid,text,integer) to authenticated, service_role;
