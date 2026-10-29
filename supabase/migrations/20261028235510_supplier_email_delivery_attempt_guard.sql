-- Apply before runtime promotion. Unknown email attempts never expire into a retry.
alter table public.supplier_invites
  add column email_delivery_pending boolean not null default false,
  add column email_delivery_attempt_id uuid,
  add column email_delivery_started_at timestamptz;

-- The old runtime could lose a receipt and leave queued/resend-failed email rows.
-- There is no reliable way to distinguish an unattempted queued link from a
-- worker killed after acceptance. Quarantine these legacy rows for reconciliation.
update public.supplier_invites set
  email_delivery_pending=true,
  email_delivery_attempt_id=gen_random_uuid(),
  email_delivery_started_at=coalesce(delivery_claimed_at,sent_at,created_at)
where channel='email' and (status='queued' or
  (status='failed' and failure_reason like 'resend_%'));

create or replace function app_private.guard_pending_supplier_email()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.email_delivery_pending and (
    new.token_hash is distinct from old.token_hash or new.channel is distinct from old.channel
    or new.recipient is distinct from old.recipient or new.supplier_id is distinct from old.supplier_id
  ) then
    raise exception 'delivery_reconciliation_required' using errcode='55000';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_pending_supplier_email() from public, anon, authenticated;
create trigger supplier_invites_pending_email_guard
  before update of token_hash, channel, recipient, supplier_id on public.supplier_invites
  for each row execute function app_private.guard_pending_supplier_email();

-- Keep the exact attempted recipient until reconciliation. A suppression/contact
-- edit must still commit while a provider request may already be in flight.
create or replace function app_private.reconcile_supplier_invites_for_suppression()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.supplier_invites set recipient=recipient
    where channel='email' and status in ('queued','failed') and not email_delivery_pending;
  return null;
end;
$$;
revoke all on function app_private.reconcile_supplier_invites_for_suppression() from public, anon, authenticated;

create or replace function app_private.reconcile_supplier_contact_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.supplier_invites set recipient=recipient
      where supplier_id=new.id and channel='email' and status in ('queued','failed')
        and not email_delivery_pending;
  end if;
  return new;
end;
$$;
revoke all on function app_private.reconcile_supplier_contact_invites() from public, anon, authenticated;

create or replace function public.begin_supplier_email_delivery(
  p_invite_id uuid, p_claim_id uuid, p_token text, p_recipient text
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_invite public.supplier_invites%rowtype;
begin
  select * into v_invite from public.supplier_invites where id=p_invite_id for update;
  if not found or p_claim_id is null or v_invite.delivery_claim_id is distinct from p_claim_id
    or v_invite.delivery_claimed_at is null or v_invite.delivery_claimed_at <= now()-interval '2 minutes'
    or v_invite.email_delivery_pending or v_invite.sms_delivery_pending or v_invite.channel <> 'email'
    or v_invite.status not in ('queued','failed') or v_invite.expires_at <= now()
    or v_invite.token_hash is distinct from pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    or v_invite.recipient is distinct from p_recipient
    or not exists(select 1 from public.requests r where r.id=v_invite.request_id
      and r.status='open' and public.request_is_current(r.travel_date,r.created_at))
    or not exists(select 1 from public.external_suppliers s where s.id=v_invite.supplier_id
      and s.opt_out is false and s.status <> 'inactive'
      and app_private.outreach_email_recipient(s.email)=p_recipient) then
    return false;
  end if;
  update public.supplier_invites set email_delivery_pending=true,
    email_delivery_attempt_id=p_claim_id, email_delivery_started_at=now() where id=p_invite_id;
  return true;
end;
$$;

-- Only trusted support may resolve a non-success after checking provider records.
-- A missing local receipt or elapsed time is never evidence of rejection.
create or replace function public.finish_supplier_email_delivery(
  p_invite_id uuid, p_attempt_id uuid, p_outcome text, p_provider_id text default null
)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_attempt_id is null or p_outcome is null or p_outcome not in ('accepted','rejected')
    or (p_outcome='accepted' and nullif(trim(p_provider_id),'') is null) then return false; end if;
  update public.supplier_invites set
    email_delivery_pending=false,
    status=case when status not in ('queued','failed') then status
      when p_outcome='accepted' then 'sent' else 'failed' end,
    provider_message_id=case when p_outcome='accepted' then p_provider_id else provider_message_id end,
    sent_at=case when p_outcome='accepted' then now() else sent_at end,
    failure_reason=case when p_outcome='accepted' then null else 'resend_rejected' end
  where id=p_invite_id and email_delivery_pending and email_delivery_attempt_id=p_attempt_id;
  if not found then return false; end if;
  -- This second write sees pending=false, so recovery can safely follow the latest
  -- supplier contact/suppression without rewriting the attempted address in flight.
  if p_outcome='rejected' then
    update public.supplier_invites set recipient=recipient where id=p_invite_id;
  end if;
  return true;
end;
$$;
revoke all on function public.begin_supplier_email_delivery(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finish_supplier_email_delivery(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.begin_supplier_email_delivery(uuid,uuid,text,text) to service_role;
grant execute on function public.finish_supplier_email_delivery(uuid,uuid,text,text) to service_role;

create or replace function public.claim_supplier_invite_delivery(
  p_invite_id uuid,
  p_actor_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite public.supplier_invites%rowtype;
  v_actor public.profiles%rowtype;
  v_hash text;
  v_claim_id uuid;
begin
  if p_invite_id is null
     or p_actor_id is null
     or trim(coalesce(p_token, '')) !~ '^[0-9A-Fa-f]{48}$' then
    return jsonb_build_object('claimed', false, 'status', 'invalid');
  end if;

  v_hash := pg_catalog.encode(extensions.digest(trim(p_token), 'sha256'), 'hex');

  select *
  into v_invite
  from public.supplier_invites i
  where i.id = p_invite_id
  for update;

  if not found or v_invite.token_hash <> v_hash then
    return jsonb_build_object('claimed', false, 'status', 'forbidden');
  end if;

  select *
  into v_actor
  from public.profiles p
  where p.id = p_actor_id;

  if not found
     or v_actor.is_active is not true
     or v_actor.registration_status <> 'active'
     or (v_invite.created_by <> p_actor_id and v_actor.role <> 'admin') then
    return jsonb_build_object('claimed', false, 'status', 'forbidden');
  end if;

  -- Terminal delivery states are already idempotent. Let the existing endpoint
  -- return its normal result without acquiring another claim.
  if v_invite.status in ('sent', 'opened', 'responded') then
    return jsonb_build_object('claimed', false, 'status', v_invite.status);
  end if;

  if v_invite.status not in ('queued', 'failed') then
    return jsonb_build_object('claimed', false, 'status', v_invite.status);
  end if;

  if v_invite.sms_delivery_pending or v_invite.email_delivery_pending then
    return jsonb_build_object('claimed', false, 'status', 'delivery_unknown');
  end if;

  if v_invite.expires_at <= now() then
    return jsonb_build_object('claimed', false, 'status', 'expired');
  end if;

  if exists (
    select 1
    from public.external_suppliers s
    where s.id = v_invite.supplier_id
      and s.opt_out is true
  ) then
    return jsonb_build_object('claimed', false, 'status', 'opted_out');
  end if;

  if not exists (
    select 1
    from public.requests r
    where r.id = v_invite.request_id
      and r.status = 'open'
  ) then
    return jsonb_build_object('claimed', false, 'status', 'request_not_open');
  end if;

  if not exists (select 1 from public.external_suppliers s where s.id=v_invite.supplier_id
    and s.opt_out is false and s.status <> 'inactive') then
    return jsonb_build_object('claimed', false, 'status', 'supplier_unavailable');
  end if;

  -- A claim normally lives for only the duration of one HTTP request. Two
  -- minutes is deliberately much longer than the provider timeouts, but still
  -- allows recovery if a serverless worker is terminated mid-request.
  if v_invite.delivery_claim_id is not null
     and v_invite.delivery_claimed_at is not null
     and v_invite.delivery_claimed_at > now() - interval '2 minutes' then
    return jsonb_build_object('claimed', false, 'status', 'in_flight');
  end if;

  v_claim_id := gen_random_uuid();

  update public.supplier_invites
  set delivery_claim_id = v_claim_id,
      delivery_claimed_at = now()
  where id = p_invite_id;

  return jsonb_build_object(
    'claimed', true,
    'claim_id', v_claim_id,
    'status', v_invite.status
  );
end;
$$;

revoke all on function public.claim_supplier_invite_delivery(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_supplier_invite_delivery(uuid,uuid,text) to service_role;
