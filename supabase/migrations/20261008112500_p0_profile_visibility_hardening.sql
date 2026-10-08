grant usage on schema app_private to authenticated;
grant execute on function app_private.account_is_active(uuid) to authenticated;

create or replace function app_private.account_is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=p_user_id
      and p.role='admin'
      and p.is_active is true
      and p.registration_status='active'
  );
$$;
revoke all on function app_private.account_is_admin(uuid) from public, anon;
grant execute on function app_private.account_is_admin(uuid) to authenticated;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
on public.profiles
for select
to authenticated
using (
  id=(select auth.uid())
  or (
    app_private.account_is_active((select auth.uid()))
    and (
      (is_active is true and registration_status='active')
      or app_private.account_is_admin((select auth.uid()))
    )
  )
);
