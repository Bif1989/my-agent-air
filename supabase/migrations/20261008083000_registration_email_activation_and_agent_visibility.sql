create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    full_name,
    company_name,
    city,
    phone,
    agent_type,
    is_active
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'agent'), '@', 1)),
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'city'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'agent_type'), ''), 'agent'),
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set is_active = true,
      updated_at = now()
  where id = new.id
    and is_active is false;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.handle_user_email_confirmed();

update public.profiles p
set is_active = false,
    updated_at = now()
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is null
  and coalesce(u.is_anonymous, false) is false
  and p.is_active is distinct from false;

create or replace function public.list_agent_filter_options()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(v order by v)
      from (
        select distinct city as v
        from public.profiles
        where is_active is true
          and nullif(trim(company_name), '') is not null
          and nullif(trim(city), '') is not null
          and nullif(trim(phone), '') is not null
          and nullif(trim(agent_type), '') is not null
          and agent_type <> 'agent'
      ) c
    ), '[]'::jsonb),
    'agentTypes', coalesce((
      select jsonb_agg(v order by v)
      from (
        select distinct agent_type as v
        from public.profiles
        where is_active is true
          and nullif(trim(company_name), '') is not null
          and nullif(trim(city), '') is not null
          and nullif(trim(phone), '') is not null
          and nullif(trim(agent_type), '') is not null
          and agent_type <> 'agent'
      ) t
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(v order by v)
      from (
        select distinct unnest(services) as v
        from public.profiles
        where is_active is true
          and nullif(trim(company_name), '') is not null
          and nullif(trim(city), '') is not null
          and nullif(trim(phone), '') is not null
          and nullif(trim(agent_type), '') is not null
          and agent_type <> 'agent'
      ) s
      where nullif(trim(v), '') is not null
    ), '[]'::jsonb)
  );
$$;
