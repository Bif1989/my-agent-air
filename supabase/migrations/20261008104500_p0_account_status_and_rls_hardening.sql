create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter table public.profiles
  add column if not exists registration_status text;

update public.profiles p
set registration_status = case
  when u.email_confirmed_at is null then 'pending_email'
  when not coalesce(p.is_active, false) then 'suspended'
  when p.role = 'admin' then 'active'
  when nullif(trim(coalesce(p.full_name,'')), '') is not null
   and nullif(trim(coalesce(p.company_name,'')), '') is not null
   and nullif(trim(coalesce(p.city,'')), '') is not null
   and nullif(trim(coalesce(p.phone,'')), '') is not null
   and nullif(trim(coalesce(p.agent_type,'')), '') is not null
   and p.agent_type <> 'agent' then 'active'
  else 'incomplete'
end
from auth.users u
where u.id = p.id;

update public.profiles
set registration_status = 'suspended'
where registration_status is null;

alter table public.profiles
  alter column registration_status set default 'pending_email',
  alter column registration_status set not null,
  alter column is_active set default false,
  alter column is_active set not null,
  alter column is_verified set default false,
  alter column is_verified set not null;

alter table public.profiles drop constraint if exists profiles_registration_status_check;
alter table public.profiles add constraint profiles_registration_status_check
  check (registration_status in ('pending_email','incomplete','active','suspended'));

create index if not exists idx_profiles_registration_status
  on public.profiles(registration_status, created_at desc);

create or replace function app_private.sync_profile_registration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_confirmed boolean := false;
begin
  select (u.email_confirmed_at is not null)
    into v_email_confirmed
  from auth.users u
  where u.id = new.id;

  if not coalesce(v_email_confirmed, false) then
    new.registration_status := 'pending_email';
  elsif not coalesce(new.is_active, false) then
    new.registration_status := 'suspended';
  elsif new.role = 'admin' then
    new.registration_status := 'active';
  elsif nullif(trim(coalesce(new.full_name,'')), '') is not null
    and nullif(trim(coalesce(new.company_name,'')), '') is not null
    and nullif(trim(coalesce(new.city,'')), '') is not null
    and nullif(trim(coalesce(new.phone,'')), '') is not null
    and nullif(trim(coalesce(new.agent_type,'')), '') is not null
    and new.agent_type <> 'agent' then
    new.registration_status := 'active';
  else
    new.registration_status := 'incomplete';
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_profile_registration_status() from public, anon, authenticated;

drop trigger if exists sync_profile_registration_status on public.profiles;
create trigger sync_profile_registration_status
before insert or update on public.profiles
for each row execute function app_private.sync_profile_registration_status();

create or replace function app_private.account_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active is true
      and p.registration_status = 'active'
  );
$$;
revoke all on function app_private.account_is_active(uuid) from public, anon, authenticated;

drop policy if exists "deny direct client access" on public.external_suppliers;
create policy "deny direct client access"
on public.external_suppliers
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny direct client access" on public.vk_identities;
create policy "deny direct client access"
on public.vk_identities
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "deny direct client access" on ai_private.assistant_usage;
create policy "deny direct client access"
on ai_private.assistant_usage
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
