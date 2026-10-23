create or replace function public.admin_external_supplier_filter_options()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'
      and p.is_active is true and p.registration_status='active'
  ) then raise exception 'admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'regions', coalesce((select jsonb_agg(x.region order by x.region) from (
      select distinct s.region from public.external_suppliers s where nullif(trim(s.region),'') is not null
    ) x),'[]'::jsonb),
    'localities', coalesce((select jsonb_agg(jsonb_build_object('region',x.region,'locality',x.locality,'kind',x.kind) order by x.region,x.locality) from (
      select l.region,l.locality,l.kind from public.uz_locations l
      union
      select s.region,s.city,case when s.city like '% tumani' then 'district' else 'city' end
      from public.external_suppliers s where nullif(trim(s.city),'') is not null
        and nullif(trim(s.region),'') is not null
      union
      select s.region,s.district,'district' from public.external_suppliers s
      where nullif(trim(s.district),'') is not null and nullif(trim(s.region),'') is not null
    ) x),'[]'::jsonb),
    'currencies', coalesce((select jsonb_agg(x.currency order by x.currency) from (
      select distinct upper(trim(s.currency)) as currency from public.external_suppliers s
      where nullif(trim(s.currency),'') is not null
    ) x),'[]'::jsonb),
    'priceUnits', coalesce((select jsonb_agg(x.unit order by x.unit) from (
      select distinct trim(s.price_unit) as unit from public.external_suppliers s
      where nullif(trim(s.price_unit),'') is not null
    ) x),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_external_supplier_filter_options() from public, anon;
grant execute on function public.admin_external_supplier_filter_options() to authenticated, service_role;

