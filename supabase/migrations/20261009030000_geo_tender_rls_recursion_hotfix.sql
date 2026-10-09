-- Break the requests <-> request_targets RLS recursion without widening access.
-- requests SELECT checks request_targets for targeted visibility, while request_targets
-- needs to let a request owner inspect their own target funnel. The owner lookup must
-- bypass requests RLS or PostgreSQL raises 42P17 (infinite recursion in policy).

create or replace function app_private.request_owned_by_current_user(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.requests r
      where r.id = p_request_id
        and r.created_by = (select auth.uid())
    );
$$;

revoke all on function app_private.request_owned_by_current_user(uuid) from public;
revoke all on function app_private.request_owned_by_current_user(uuid) from anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.request_owned_by_current_user(uuid) to authenticated;

drop policy if exists "Targets can view assigned requests" on public.request_targets;
create policy "Targets can view assigned requests"
on public.request_targets
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or app_private.request_owned_by_current_user(request_id)
  or app_private.account_is_admin((select auth.uid()))
);
