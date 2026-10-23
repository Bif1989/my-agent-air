-- Normalization stays private; admin RPC authorization remains unchanged.
create or replace function app_private.supplier_location_key(p_value text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(
    regexp_replace(lower(trim(coalesce(p_value,''))), 'shahar[.]?$', 'shahri'),
    '[^a-zа-яё0-9]', '', 'g'
  );
$$;
revoke all on function app_private.supplier_location_key(text) from public, anon, authenticated;

create or replace function app_private.normalize_external_supplier_location()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_region text;
  v_locality text;
  v_matches integer;
  v_region_key text;
begin
  v_region_key := app_private.supplier_location_key(new.region);
  select min(x.region), count(*) into v_region, v_matches
  from (select distinct l.region from public.uz_locations l
    where app_private.supplier_location_key(l.region) = v_region_key
      or app_private.supplier_location_key(regexp_replace(l.region,' viloyati$','')) = v_region_key
  ) x;
  if v_matches = 1 then new.region := v_region; end if;

  -- Prefer a canonical district over an unrelated city in a noisy registry row.
  select min(l.locality), count(*) into v_locality, v_matches
  from public.uz_locations l
  where l.region = new.region
    and app_private.supplier_location_key(l.locality) = app_private.supplier_location_key(coalesce(nullif(trim(new.district),''),new.city));
  if v_matches = 1 then
    new.city := v_locality;
    if v_locality like '% tumani' then new.district := v_locality; end if;
  else
    select min(l.locality), count(*) into v_locality, v_matches
    from public.uz_locations l where l.region = new.region
      and app_private.supplier_location_key(l.locality) = app_private.supplier_location_key(new.city);
    if v_matches = 1 then new.city := v_locality; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.normalize_external_supplier_location() from public, anon, authenticated;
drop trigger if exists normalize_external_supplier_location on public.external_suppliers;
create trigger normalize_external_supplier_location
before insert or update of region, city, district on public.external_suppliers
for each row execute function app_private.normalize_external_supplier_location();

-- Preserve nonstandard raw localities too: every existing supplier remains
-- selectable even when its source location cannot be resolved safely.
update public.external_suppliers set region=region, city=city, district=district;

