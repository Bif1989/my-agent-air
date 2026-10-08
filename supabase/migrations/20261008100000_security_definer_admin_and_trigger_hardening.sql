create or replace function public.admin_set_agent_active(p_user_id uuid, p_is_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_old boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if not found or v_admin.role <> 'admin' or not coalesce(v_admin.is_active, false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_profile.role <> 'agent' then
    raise exception 'target_must_be_agent' using errcode = '42501';
  end if;

  v_old := coalesce(v_profile.is_active, false);

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_audit_log(admin_id, target_profile_id, action, old_value, new_value)
  values (v_uid, p_user_id, 'set_active', v_old, p_is_active);

  return v_profile;
end;
$$;

create or replace function public.admin_set_agent_verified(p_user_id uuid, p_is_verified boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_old boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if not found or v_admin.role <> 'admin' or not coalesce(v_admin.is_active, false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_profile.role <> 'agent' then
    raise exception 'target_must_be_agent' using errcode = '42501';
  end if;

  v_old := coalesce(v_profile.is_verified, false);

  update public.profiles
  set is_verified = p_is_verified, updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_audit_log(admin_id, target_profile_id, action, old_value, new_value)
  values (v_uid, p_user_id, 'set_verified', v_old, p_is_verified);

  return v_profile;
end;
$$;

create or replace function public.review_verification_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.verification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.verification_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.role = 'admin'
      and coalesce(p.is_active, false)
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_request
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'verification_request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'verification_request_already_reviewed' using errcode = 'P0001';
  end if;

  update public.verification_requests
  set status = p_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = v_uid
  where id = p_request_id
  returning * into v_request;

  if p_status = 'approved' then
    update public.profiles
    set is_verified = true
    where id = v_request.user_id;
  end if;

  return v_request;
end;
$$;

revoke all on function public.admin_set_agent_active(uuid, boolean) from public, anon;
revoke all on function public.admin_set_agent_verified(uuid, boolean) from public, anon;
revoke all on function public.review_verification_request(uuid, text, text) from public, anon;
grant execute on function public.admin_set_agent_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_set_agent_verified(uuid, boolean) to authenticated, service_role;
grant execute on function public.review_verification_request(uuid, text, text) to authenticated, service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_confirmed() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role;
grant execute on function public.handle_user_email_confirmed() to service_role;
