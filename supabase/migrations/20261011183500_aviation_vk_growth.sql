-- Aviation/VK growth: classify legacy VK users as Aviakassa and remove an
-- extra onboarding step by ensuring every active business profile has its
-- primary Geo-Tender capability. Existing explicitly disabled capabilities
-- are never re-enabled by this migration.

update public.profiles p
set agent_type = 'Aviakassa'
where p.agent_type = 'agent'
  and exists (
    select 1
    from public.vk_identities v
    where v.user_id = p.id
  );

create or replace function app_private.ensure_primary_supplier_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if new.is_active is not true or new.registration_status <> 'active' then
    return new;
  end if;

  v_type := case new.agent_type
    when 'Aviakassa' then 'aviation'
    when 'Turagent' then 'travel_agent'
    when 'Turoperator' then 'tour_operator'
    when 'Mehmonxona' then 'hotel'
    when 'Transport' then 'transport'
    when 'Gid' then 'guide'
    when 'Boshqa' then 'other'
    else null
  end;

  if v_type is null then return new; end if;

  insert into public.supplier_capabilities(profile_id, capability_type, city, onboarding_status, is_active)
  values (new.id, v_type, nullif(trim(coalesce(new.city, '')), ''), 'in_progress', true)
  on conflict (profile_id, capability_type) do update
  set city = coalesce(nullif(trim(coalesce(public.supplier_capabilities.city, '')), ''), excluded.city),
      updated_at = case
        when public.supplier_capabilities.city is null and excluded.city is not null then now()
        else public.supplier_capabilities.updated_at
      end;

  return new;
end;
$$;

revoke all on function app_private.ensure_primary_supplier_capability() from public, anon, authenticated;

drop trigger if exists trg_profiles_ensure_primary_capability on public.profiles;
create trigger trg_profiles_ensure_primary_capability
after insert or update of agent_type, city, is_active, registration_status on public.profiles
for each row execute function app_private.ensure_primary_supplier_capability();

insert into public.supplier_capabilities(profile_id, capability_type, city, onboarding_status, is_active)
select
  p.id,
  case p.agent_type
    when 'Aviakassa' then 'aviation'
    when 'Turagent' then 'travel_agent'
    when 'Turoperator' then 'tour_operator'
    when 'Mehmonxona' then 'hotel'
    when 'Transport' then 'transport'
    when 'Gid' then 'guide'
    when 'Boshqa' then 'other'
  end,
  nullif(trim(coalesce(p.city, '')), ''),
  'in_progress',
  true
from public.profiles p
where p.is_active is true
  and p.registration_status = 'active'
  and p.agent_type in ('Aviakassa','Turagent','Turoperator','Mehmonxona','Transport','Gid','Boshqa')
on conflict (profile_id, capability_type) do nothing;
