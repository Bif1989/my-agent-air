-- Geo Tender engagement tracking.
-- Matched suppliers can record views/declines through narrow public wrappers.
-- Privileged writes stay in app_private; offer creation marks the corresponding target as responded server-side.

revoke all on table public.request_targets from anon;
revoke insert, update, delete, truncate, references, trigger on table public.request_targets from authenticated;
grant select on table public.request_targets to authenticated;
grant select, insert, update, delete on table public.request_targets to service_role;

grant usage on schema app_private to authenticated;

create or replace function app_private.mark_request_target_viewed_internal(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if not app_private.account_is_active(v_uid) then
    raise exception 'account_inactive_or_incomplete' using errcode='42501';
  end if;

  select exists(
    select 1
    from public.request_targets rt
    where rt.request_id = p_request_id
      and rt.profile_id = v_uid
  ) into v_exists;

  if not v_exists then
    return false;
  end if;

  update public.request_targets
  set status = 'viewed', updated_at = now()
  where request_id = p_request_id
    and profile_id = v_uid
    and status in ('matched', 'notified');

  return true;
end;
$$;

revoke all on function app_private.mark_request_target_viewed_internal(uuid) from public, anon;
grant execute on function app_private.mark_request_target_viewed_internal(uuid) to authenticated;

create or replace function public.mark_request_target_viewed(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path=''
as $$
  select app_private.mark_request_target_viewed_internal(p_request_id);
$$;

revoke all on function public.mark_request_target_viewed(uuid) from public, anon;
grant execute on function public.mark_request_target_viewed(uuid) to authenticated;

create or replace function app_private.decline_request_target_internal(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if not app_private.account_is_active(v_uid) then
    raise exception 'account_inactive_or_incomplete' using errcode='42501';
  end if;

  update public.request_targets
  set status = 'declined', updated_at = now()
  where request_id = p_request_id
    and profile_id = v_uid
    and status in ('matched', 'notified', 'viewed');

  return found;
end;
$$;

revoke all on function app_private.decline_request_target_internal(uuid) from public, anon;
grant execute on function app_private.decline_request_target_internal(uuid) to authenticated;

create or replace function public.decline_request_target(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path=''
as $$
  select app_private.decline_request_target_internal(p_request_id);
$$;

revoke all on function public.decline_request_target(uuid) from public, anon;
grant execute on function public.decline_request_target(uuid) to authenticated;

create or replace function app_private.mark_request_target_responded()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.request_targets
  set status = 'responded', updated_at = now()
  where request_id = new.request_id
    and profile_id = new.agent_id
    and status in ('matched', 'notified', 'viewed');

  return new;
end;
$$;

revoke all on function app_private.mark_request_target_responded() from public, anon, authenticated;

drop trigger if exists trg_offers_mark_request_target_responded on public.offers;
create trigger trg_offers_mark_request_target_responded
after insert on public.offers
for each row execute function app_private.mark_request_target_responded();

-- Historical offers are already genuine responses. Preserve that truth when the
-- engagement layer is introduced after targeting has been backfilled.
update public.request_targets rt
set status = 'responded', updated_at = now()
where rt.status in ('matched', 'notified', 'viewed')
  and exists (
    select 1
    from public.offers o
    where o.request_id = rt.request_id
      and o.agent_id = rt.profile_id
  );
