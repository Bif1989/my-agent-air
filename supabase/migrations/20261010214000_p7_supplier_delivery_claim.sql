-- P7: serialize supplier outreach delivery so concurrent requests cannot send
-- duplicate SMS/email messages. Keep the public invite status model unchanged.

alter table public.supplier_invites
  add column if not exists delivery_claim_id uuid,
  add column if not exists delivery_claimed_at timestamptz;

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

create or replace function public.release_supplier_invite_delivery(
  p_invite_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_released boolean := false;
begin
  if p_invite_id is null or p_claim_id is null then
    return false;
  end if;

  update public.supplier_invites
  set delivery_claim_id = null,
      delivery_claimed_at = null
  where id = p_invite_id
    and delivery_claim_id = p_claim_id
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

revoke all on function public.claim_supplier_invite_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_supplier_invite_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_supplier_invite_delivery(uuid, uuid, text) to service_role;
grant execute on function public.release_supplier_invite_delivery(uuid, uuid) to service_role;
