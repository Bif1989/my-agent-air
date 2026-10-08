create or replace function public.list_agent_filter_options()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct city as v from public.profiles
        where is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) c
    ), '[]'::jsonb),
    'agentTypes', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct agent_type as v from public.profiles
        where is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) t
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct unnest(services) as v from public.profiles
        where is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) s where nullif(trim(v),'') is not null
    ), '[]'::jsonb)
  );
$$;
