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
