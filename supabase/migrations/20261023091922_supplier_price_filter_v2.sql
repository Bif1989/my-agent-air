create or replace function public.admin_list_external_suppliers_v2(
  p_supplier_type text default null,
  p_region text default null,
  p_locality text default null,
  p_search text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_sort text default 'location',
  p_limit integer default 50,
  p_offset integer default 0,
  p_currency text default null,
  p_price_unit text default null
)
returns table (
  id uuid,
  supplier_type text,
  name text,
  region text,
  city text,
  district text,
  address text,
  phone text,
  email text,
  website text,
  registry_number text,
  star_rating smallint,
  capacity integer,
  price_from numeric,
  price_to numeric,
  currency text,
  price_unit text,
  source_name text,
  status text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_sort text := lower(coalesce(p_sort,'location'));
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active is true
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if v_sort not in ('location','name','price_asc','price_desc','stars_desc') then
    v_sort := 'location';
  end if;

  if p_min_price < 0 or p_max_price < 0 or p_min_price > p_max_price then
    raise exception 'invalid_price_range' using errcode = '22023';
  end if;
  if (p_min_price is not null or p_max_price is not null or v_sort in ('price_asc','price_desc'))
    and (nullif(trim(p_currency),'') is null or nullif(trim(p_price_unit),'') is null) then
    raise exception 'price_currency_and_unit_required' using errcode = '22023';
  end if;

  return query
  select
    s.id, s.supplier_type, s.name, s.region, s.city, s.district,
    s.address, s.phone, s.email, s.website, s.registry_number,
    s.star_rating, s.capacity, s.price_from, s.price_to, s.currency,
    s.price_unit, s.source_name, s.status,
    count(*) over() as total_count
  from public.external_suppliers s
  where (nullif(trim(coalesce(p_supplier_type,'')),'') is null or s.supplier_type = lower(trim(p_supplier_type)))
    and (nullif(trim(coalesce(p_region,'')),'') is null or s.region = trim(p_region))
    and (
      nullif(trim(coalesce(p_locality,'')),'') is null
      or s.city = trim(p_locality)
      or s.district = trim(p_locality)
    )
    and (
      nullif(trim(coalesce(p_search,'')),'') is null
      or s.name ilike '%' || trim(p_search) || '%'
      or coalesce(s.address,'') ilike '%' || trim(p_search) || '%'
      or coalesce(s.phone,'') ilike '%' || trim(p_search) || '%'
      or coalesce(s.registry_number,'') ilike '%' || trim(p_search) || '%'
    )
    and (nullif(trim(p_currency),'') is null or upper(trim(s.currency)) = upper(trim(p_currency)))
    and (nullif(trim(p_price_unit),'') is null or trim(s.price_unit) = trim(p_price_unit))
    and ((p_min_price is null and p_max_price is null) or s.price_from is not null or s.price_to is not null)
    and (p_min_price is null or s.price_to is null or s.price_to >= p_min_price)
    and (p_max_price is null or s.price_from is null or s.price_from <= p_max_price)
  order by
    case when v_sort='price_asc' then coalesce(s.price_from, s.price_to) end asc nulls last,
    case when v_sort='price_desc' then coalesce(s.price_to, s.price_from) end desc nulls last,
    case when v_sort='stars_desc' then s.star_rating end desc nulls last,
    case when v_sort='name' then lower(s.name) end asc,
    case when v_sort='location' then lower(coalesce(s.region,'')) end asc,
    case when v_sort='location' then lower(coalesce(s.city,s.district,'')) end asc,
    lower(s.name) asc, s.id asc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.admin_list_external_suppliers_v2(text,text,text,text,numeric,numeric,text,integer,integer,text,text) from public, anon;
grant execute on function public.admin_list_external_suppliers_v2(text,text,text,text,numeric,numeric,text,integer,integer,text,text) to authenticated, service_role;


