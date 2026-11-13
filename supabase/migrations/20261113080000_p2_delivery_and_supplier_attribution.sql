alter table public.request_targets
  add column push_sent_at timestamptz,
  add column push_outcome text check (push_outcome in ('no_subscription', 'failed', 'disabled', 'sent'));

create function public.prepare_supplier_email_fallback(p_invite_id uuid, p_claim_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_email text;
begin
  select app_private.outreach_email_recipient(s.email) into v_email
  from public.supplier_invites i
  join public.external_suppliers s on s.id = i.supplier_id
  join public.requests r on r.id = i.request_id
  where i.id = p_invite_id and s.opt_out is false and s.status <> 'inactive'
    and r.status = 'open';
  if v_email is null or length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return false;
  end if;
  update public.supplier_invites
  set channel = 'email', recipient = v_email, status = 'queued', failure_reason = null
  where id = p_invite_id and delivery_claim_id = p_claim_id
    and delivery_claimed_at > now() - interval '2 minutes'
    and expires_at > now() and channel = 'sms' and status in ('queued', 'failed')
    and not sms_delivery_pending and not email_delivery_pending;
  return found;
end;
$$;

revoke all on function public.prepare_supplier_email_fallback(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_supplier_email_fallback(uuid, uuid) to service_role;

create function public.claim_external_supplier_profile(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_supplier_id uuid;
begin
  if v_uid is null or p_token is null or p_token !~ '^[0-9a-f]{48}$'
    or not app_private.account_is_active(v_uid) then
    return false;
  end if;

  select i.supplier_id into v_supplier_id
  from public.supplier_invites i
  join auth.users u on u.id = v_uid
  cross join lateral (
    select case when u.phone_confirmed_at is not null then app_private.first_uz_phone(u.phone)
                else app_private.first_uz_phone(u.raw_app_meta_data->>'verified_signup_phone') end as phone
  ) verified
  join public.external_suppliers s on s.id = i.supplier_id
  where i.token_hash = pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.expires_at > now() and i.status in ('sent', 'opened', 'responded')
    and s.opt_out is false and s.status <> 'inactive'
    and (
      (i.channel = 'sms' and verified.phone = app_private.first_uz_phone(i.recipient)
        and verified.phone = app_private.first_uz_phone(s.phone))
      or (i.channel = 'email' and u.email_confirmed_at is not null
        and lower(trim(u.email)) = lower(trim(i.recipient))
        and lower(trim(u.email)) = lower(trim(app_private.outreach_email_recipient(s.email))))
    )
  for update of i, s;

  if v_supplier_id is null then return false; end if;
  update public.external_suppliers set platform_profile_id = v_uid, updated_at = now()
  where id = v_supplier_id and (platform_profile_id is null or platform_profile_id = v_uid);
  return found;
end;
$$;

revoke all on function public.claim_external_supplier_profile(text) from public, anon;
grant execute on function public.claim_external_supplier_profile(text) to authenticated;

create function app_private.guard_supplier_invite_rotation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.token_hash is distinct from old.token_hash
    and old.delivery_claim_id is not null
    and old.delivery_claimed_at > now() - interval '2 minutes' then
    raise exception 'delivery_in_progress' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_supplier_invite_rotation() from public, anon, authenticated;
create trigger supplier_invites_delivery_rotation_guard
  before update of token_hash on public.supplier_invites
  for each row execute function app_private.guard_supplier_invite_rotation();

create function public.list_request_supplier_invites_p2(p_request_id uuid)
returns table(id uuid,supplier_id uuid,supplier_name text,channel text,status text,recipient_hint text,created_at timestamptz,expires_at timestamptz,opened_at timestamptz,responded_at timestamptz,response jsonb,converted boolean,delivery_error text)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_is_admin boolean:=false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select r.created_by into v_owner from public.requests r where r.id=p_request_id;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  select exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.is_active is true and p.registration_status='active') into v_is_admin;
  if v_owner<>v_uid and not v_is_admin then raise exception 'not_request_owner' using errcode='42501'; end if;
  return query select i.id,i.supplier_id,s.name,i.channel,i.status,
    case when i.channel='email' and i.recipient is not null then left(i.recipient,1)||'***@'||split_part(i.recipient,'@',2) when i.channel in ('sms','whatsapp') and i.recipient is not null then '***'||right(regexp_replace(i.recipient,'\D','','g'),4) when i.channel='telegram' and i.recipient is not null then left(i.recipient,2)||'***' else 'Qo‘lda ulashish' end,
    i.created_at,i.expires_at,i.opened_at,i.responded_at,i.response,s.platform_profile_id is not null,
    case when i.sms_delivery_pending or i.email_delivery_pending then 'delivery_unknown'
         when i.failure_reason in ('eskiz_rejected','resend_rejected','invalid_email_recipient','invalid_sms_recipient','supplier_email_suppressed','supplier_email_missing') then i.failure_reason
         when i.status='failed' then 'delivery_failed' end
  from public.supplier_invites i join public.external_suppliers s on s.id=i.supplier_id where i.request_id=p_request_id order by i.created_at desc;
end;
$$;

revoke all on function public.list_request_supplier_invites_p2(uuid) from public, anon;
grant execute on function public.list_request_supplier_invites_p2(uuid) to authenticated;
