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
  where p.role='agent'
    and p.is_active is true
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

revoke all on function public.list_agents_with_trust(text,text,text,text,boolean,text,integer,integer) from public, anon, service_role;
grant execute on function public.list_agents_with_trust(text,text,text,text,boolean,text,integer,integer) to authenticated;

create or replace function public.list_agent_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct city as v from public.profiles
        where role='agent' and is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) c
    ), '[]'::jsonb),
    'agentTypes', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct agent_type as v from public.profiles
        where role='agent' and is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) t
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(v order by v) from (
        select distinct unnest(services) as v from public.profiles
        where role='agent' and is_active is true and registration_status='active'
          and nullif(trim(company_name),'') is not null and nullif(trim(city),'') is not null
          and nullif(trim(phone),'') is not null and nullif(trim(agent_type),'') is not null and agent_type<>'agent'
      ) s where nullif(trim(v),'') is not null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.list_agent_filter_options() from public, anon, service_role;
grant execute on function public.list_agent_filter_options() to authenticated;

create or replace function public.count_agents_directory(
  p_search text default null,
  p_city text default null,
  p_agent_type text default null,
  p_service text default null,
  p_verified_only boolean default false
)
returns bigint
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_search text:=nullif(left(trim(coalesce(p_search,'')),100),'');
  v_count bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select count(*) into v_count
  from public.profiles p
  where p.role='agent'
    and p.is_active is true
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
    and (not coalesce(p_verified_only,false) or p.is_verified is true);

  return v_count;
end;
$$;

revoke all on function public.count_agents_directory(text,text,text,text,boolean) from public, anon, service_role;
grant execute on function public.count_agents_directory(text,text,text,text,boolean) to authenticated;
