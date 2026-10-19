alter table public.external_suppliers
  add column if not exists price_from numeric(14,2),
  add column if not exists price_to numeric(14,2),
  add column if not exists currency text,
  add column if not exists price_unit text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'external_suppliers_price_nonnegative'
      and conrelid = 'public.external_suppliers'::regclass
  ) then
    alter table public.external_suppliers
      add constraint external_suppliers_price_nonnegative
      check (
        (price_from is null or price_from >= 0)
        and (price_to is null or price_to >= 0)
        and (price_from is null or price_to is null or price_to >= price_from)
      );
  end if;
end $$;

create index if not exists external_suppliers_location_sort_idx
  on public.external_suppliers (region, city, supplier_type, name);

create index if not exists external_suppliers_price_idx
  on public.external_suppliers (supplier_type, price_from, price_to)
  where price_from is not null or price_to is not null;

update public.external_suppliers
set region = case
  when trim(region) in ('Toshkent shahar','Toshkent shahri') then 'Toshkent shahri'
  when regexp_replace(trim(region), '\s+', ' ', 'g') = 'Qoraqalpog‘iston Respublikasi' then 'Qoraqalpog‘iston Respublikasi'
  when trim(region) = 'Samarqand' then 'Samarqand viloyati'
  else regexp_replace(trim(region), '\s+', ' ', 'g')
end
where region is not null;

update public.external_suppliers s
set
  city = l.locality,
  district = case when l.kind = 'district' then l.locality else s.district end
from public.uz_locations l
where s.region = l.region
  and s.city is not null
  and lower(
    regexp_replace(
      regexp_replace(trim(s.city), '\s+shahar\.?$', ' shahri', 'i'),
      '\s+', ' ', 'g'
    )
  ) = lower(l.locality)
  and s.city is distinct from l.locality;

update public.external_suppliers set city = 'Farg‘ona shahri'
where city in ('Fargona shahri.','Fargona shahri','Farg‘ona shahar');

update public.external_suppliers set city = 'Forish tumani', district = 'Forish tumani'
where city in ('Forish t-n.','Forish t-n','Forish tuman');

update public.external_suppliers set city = 'Yuqori Chirchiq tumani', district = 'Yuqori Chirchiq tumani'
where city = 'Yuqori Сhirchiq tumani';

update public.external_suppliers set city = 'Yangiqo‘rg‘on tumani', district = 'Yangiqo‘rg‘on tumani'
where city in ('Yangiqoʻrgʻon tumani','Yangiqo`rg`on tumani');

create or replace function public.admin_external_supplier_filter_options()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  return jsonb_build_object(
    'regions',
      coalesce((
        select jsonb_agg(x.region order by x.region)
        from (
          select distinct s.region
          from public.external_suppliers s
          where s.region is not null and trim(s.region) <> ''
        ) x
      ), '[]'::jsonb),
    'localities',
      coalesce((
        select jsonb_agg(
          jsonb_build_object('region', l.region, 'locality', l.locality, 'kind', l.kind)
          order by l.sort_order, l.locality
        )
        from public.uz_locations l
      ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_external_supplier_filter_options() from public, anon;
grant execute on function public.admin_external_supplier_filter_options() to authenticated, service_role;

create or replace function public.admin_list_external_suppliers(
  p_supplier_type text default null,
  p_region text default null,
  p_locality text default null,
  p_search text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_sort text default 'location',
  p_limit integer default 50,
  p_offset integer default 0
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
    and (p_min_price is null or coalesce(s.price_to, s.price_from) >= p_min_price)
    and (p_max_price is null or coalesce(s.price_from, s.price_to) <= p_max_price)
  order by
    case when v_sort='price_asc' then coalesce(s.price_from, s.price_to) end asc nulls last,
    case when v_sort='price_desc' then coalesce(s.price_to, s.price_from) end desc nulls last,
    case when v_sort='stars_desc' then s.star_rating end desc nulls last,
    case when v_sort='name' then lower(s.name) end asc,
    case when v_sort='location' then lower(coalesce(s.region,'')) end asc,
    case when v_sort='location' then lower(coalesce(s.city,s.district,'')) end asc,
    lower(s.name) asc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.admin_list_external_suppliers(text,text,text,text,numeric,numeric,text,integer,integer) from public, anon;
grant execute on function public.admin_list_external_suppliers(text,text,text,text,numeric,numeric,text,integer,integer) to authenticated, service_role;

create or replace function public.admin_import_external_suppliers(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_existing uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_type text;
  v_name text;
  v_city text;
  v_source_type text;
  v_source_name text;
  v_source_record_id text;
  v_metadata jsonb;
  v_source_updated_at timestamptz;
  v_price_from numeric;
  v_price_to numeric;
  v_currency text;
  v_price_unit text;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.role = 'admin'
      and p.is_active is true
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items_must_be_array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_type := lower(trim(coalesce(v_item->>'supplier_type','hotel')));
    v_name := trim(coalesce(v_item->>'name',''));
    v_city := nullif(trim(coalesce(v_item->>'city','')), '');
    v_source_type := lower(trim(coalesce(v_item->>'source_type','official_registry')));
    v_source_name := nullif(trim(coalesce(v_item->>'source_name','')), '');
    v_source_record_id := nullif(trim(coalesce(v_item->>'source_record_id','')), '');
    v_metadata := case when jsonb_typeof(v_item->'metadata')='object' then v_item->'metadata' else '{}'::jsonb end;
    v_source_updated_at := null;
    v_price_from := null;
    v_price_to := null;
    v_currency := upper(nullif(trim(coalesce(v_item->>'currency','')), ''));
    v_price_unit := nullif(trim(coalesce(v_item->>'price_unit','')), '');

    if coalesce(v_item->>'price_from','') ~ '^\d+([.,]\d{1,2})?$' then
      v_price_from := replace(v_item->>'price_from', ',', '.')::numeric;
    end if;
    if coalesce(v_item->>'price_to','') ~ '^\d+([.,]\d{1,2})?$' then
      v_price_to := replace(v_item->>'price_to', ',', '.')::numeric;
    end if;
    if v_price_from is not null and v_price_to is not null and v_price_to < v_price_from then
      v_price_to := null;
    end if;

    if v_type not in ('hotel','guide','transport','restaurant')
       or v_source_type not in ('official_registry','open_data','public_business_contact','manual')
       or v_name = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if coalesce(v_item->>'source_updated_at','') ~ '^\d{4}-\d{2}-\d{2}' then
      begin
        v_source_updated_at := (v_item->>'source_updated_at')::timestamptz;
      exception when others then
        v_source_updated_at := null;
      end;
    end if;

    v_existing := null;
    if v_source_record_id is not null then
      select s.id into v_existing
      from public.external_suppliers s
      where s.source_type = v_source_type
        and s.source_name is not distinct from v_source_name
        and s.source_record_id = v_source_record_id
      limit 1;
    end if;

    if v_existing is null then
      select s.id into v_existing
      from public.external_suppliers s
      where s.supplier_type = v_type
        and lower(trim(s.name)) = lower(v_name)
        and lower(coalesce(trim(s.city),'')) = lower(coalesce(v_city,''))
      limit 1;
    end if;

    if v_existing is null then
      insert into public.external_suppliers (
        supplier_type,name,region,city,district,address,phone,email,website,telegram,
        source_type,source_name,source_url,source_record_id,registry_number,star_rating,capacity,
        price_from,price_to,currency,price_unit,
        services,metadata,status,source_updated_at
      ) values (
        v_type,v_name,nullif(trim(coalesce(v_item->>'region','')),''),v_city,
        nullif(trim(coalesce(v_item->>'district','')),''),nullif(trim(coalesce(v_item->>'address','')),''),
        nullif(trim(coalesce(v_item->>'phone','')),''),nullif(trim(coalesce(v_item->>'email','')),''),
        nullif(trim(coalesce(v_item->>'website','')),''),nullif(trim(coalesce(v_item->>'telegram','')),''),
        v_source_type,v_source_name,nullif(trim(coalesce(v_item->>'source_url','')),''),
        v_source_record_id,nullif(trim(coalesce(v_item->>'registry_number','')),''),
        case when coalesce(v_item->>'star_rating','') ~ '^[1-5]$' then (v_item->>'star_rating')::smallint else null end,
        case when coalesce(v_item->>'capacity','') ~ '^\d{1,9}$' then (v_item->>'capacity')::int else null end,
        v_price_from,v_price_to,v_currency,v_price_unit,
        case when jsonb_typeof(v_item->'services')='array' then array(select jsonb_array_elements_text(v_item->'services')) else '{}'::text[] end,
        v_metadata,
        case when v_source_type='official_registry' then 'registry' else 'public_contact' end,
        v_source_updated_at
      );
      v_inserted := v_inserted + 1;
    else
      update public.external_suppliers s set
        region = coalesce(nullif(trim(coalesce(v_item->>'region','')),''), s.region),
        city = coalesce(v_city, s.city),
        district = coalesce(nullif(trim(coalesce(v_item->>'district','')),''), s.district),
        address = coalesce(nullif(trim(coalesce(v_item->>'address','')),''), s.address),
        phone = coalesce(nullif(trim(coalesce(v_item->>'phone','')),''), s.phone),
        email = coalesce(nullif(trim(coalesce(v_item->>'email','')),''), s.email),
        website = coalesce(nullif(trim(coalesce(v_item->>'website','')),''), s.website),
        telegram = coalesce(nullif(trim(coalesce(v_item->>'telegram','')),''), s.telegram),
        source_name = coalesce(v_source_name, s.source_name),
        source_url = coalesce(nullif(trim(coalesce(v_item->>'source_url','')),''), s.source_url),
        source_record_id = coalesce(v_source_record_id, s.source_record_id),
        registry_number = coalesce(nullif(trim(coalesce(v_item->>'registry_number','')),''), s.registry_number),
        star_rating = case when coalesce(v_item->>'star_rating','') ~ '^[1-5]$' then (v_item->>'star_rating')::smallint else s.star_rating end,
        capacity = case when coalesce(v_item->>'capacity','') ~ '^\d{1,9}$' then (v_item->>'capacity')::int else s.capacity end,
        price_from = coalesce(v_price_from, s.price_from),
        price_to = coalesce(v_price_to, s.price_to),
        currency = coalesce(v_currency, s.currency),
        price_unit = coalesce(v_price_unit, s.price_unit),
        metadata = s.metadata || v_metadata,
        source_updated_at = coalesce(v_source_updated_at, s.source_updated_at),
        updated_at = now()
      where s.id = v_existing;
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted',v_inserted,'updated',v_updated,'skipped',v_skipped,'total',v_inserted+v_updated+v_skipped);
end;
$$;

revoke all on function public.admin_import_external_suppliers(jsonb) from public, anon;
grant execute on function public.admin_import_external_suppliers(jsonb) to authenticated, service_role;
