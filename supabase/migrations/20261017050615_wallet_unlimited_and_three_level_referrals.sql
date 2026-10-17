alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_method_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_method_check check (method = any (array['cash'::text,'bank_transfer'::text,'click'::text,'payme'::text,'wallet'::text,'other'::text]));

create table if not exists app_private.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_check check (code ~ '^[A-Z0-9]{10,24}$')
);

create table if not exists app_private.referrals (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint referrals_not_self_check check (referred_user_id <> referrer_user_id),
  constraint referrals_status_check check (status in ('pending','qualified','rejected'))
);
create index if not exists referrals_referrer_user_id_idx on app_private.referrals(referrer_user_id, created_at desc);

create table if not exists app_private.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.profiles(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  level smallint not null,
  amount integer not null,
  wallet_ledger_id uuid unique references public.billing_wallet_ledger(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint referral_rewards_level_check check (level between 1 and 3),
  constraint referral_rewards_amount_check check ((level = 1 and amount = 15000) or (level = 2 and amount = 10000) or (level = 3 and amount = 5000)),
  constraint referral_rewards_referred_level_key unique (referred_user_id, level),
  constraint referral_rewards_referred_beneficiary_key unique (referred_user_id, beneficiary_user_id)
);
create index if not exists referral_rewards_beneficiary_idx on app_private.referral_rewards(beneficiary_user_id, created_at desc);

revoke all on app_private.referral_codes from public, anon, authenticated;
revoke all on app_private.referrals from public, anon, authenticated;
revoke all on app_private.referral_rewards from public, anon, authenticated;

insert into app_private.referral_codes(user_id, code)
select p.id, upper(substr(md5(p.id::text || ':my-agent-air-referral'), 1, 16))
from public.profiles p
where p.role = 'agent'
on conflict (user_id) do nothing;

create or replace function app_private.ensure_referral_code_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'agent' then
    insert into app_private.referral_codes(user_id, code)
    values (new.id, upper(substr(md5(new.id::text || ':my-agent-air-referral'), 1, 16)))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.ensure_referral_code_for_profile() from public, anon, authenticated;

drop trigger if exists profiles_ensure_referral_code on public.profiles;
create trigger profiles_ensure_referral_code
after insert on public.profiles
for each row execute function app_private.ensure_referral_code_for_profile();

create or replace function app_private.referral_profile_qualified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'agent'
      and p.is_verified = true
      and p.is_active = true
      and p.registration_status = 'active'
      and nullif(trim(coalesce(p.company_name, '')), '') is not null
  );
$$;
revoke all on function app_private.referral_profile_qualified(uuid) from public, anon, authenticated;

create or replace function app_private.process_referral_qualification(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beneficiary uuid;
  v_next_beneficiary uuid;
  v_level integer;
  v_amount integer;
  v_reward_id uuid;
  v_balance bigint;
  v_new_balance bigint;
  v_ledger_id uuid;
begin
  if not app_private.referral_profile_qualified(p_user_id) then
    return;
  end if;

  update app_private.referrals r
     set status = 'qualified',
         qualified_at = coalesce(r.qualified_at, now())
   where r.referred_user_id = p_user_id
     and r.status = 'pending'
  returning r.referrer_user_id into v_beneficiary;

  if v_beneficiary is null then
    return;
  end if;

  for v_level in 1..3 loop
    exit when v_beneficiary is null;
    v_amount := case v_level when 1 then 15000 when 2 then 10000 else 5000 end;
    v_reward_id := null;

    insert into app_private.referral_rewards(referred_user_id, beneficiary_user_id, level, amount)
    values (p_user_id, v_beneficiary, v_level, v_amount)
    on conflict do nothing
    returning id into v_reward_id;

    if v_reward_id is not null then
      insert into public.billing_wallets(user_id)
      values (v_beneficiary)
      on conflict (user_id) do nothing;

      select w.balance into v_balance
      from public.billing_wallets w
      where w.user_id = v_beneficiary
      for update;

      v_new_balance := coalesce(v_balance, 0) + v_amount;

      update public.billing_wallets
         set balance = v_new_balance,
             updated_at = now()
       where user_id = v_beneficiary;

      insert into public.billing_wallet_ledger(user_id, kind, amount_delta, balance_after, note)
      values (
        v_beneficiary,
        'admin_credit',
        v_amount,
        v_new_balance,
        'Referal bonusi: ' || v_level::text || '-bosqich'
      )
      returning id into v_ledger_id;

      update app_private.referral_rewards
         set wallet_ledger_id = v_ledger_id
       where id = v_reward_id;
    end if;

    select r.referrer_user_id into v_next_beneficiary
    from app_private.referrals r
    where r.referred_user_id = v_beneficiary;
    v_beneficiary := v_next_beneficiary;
    v_next_beneficiary := null;
  end loop;
end;
$$;
revoke all on function app_private.process_referral_qualification(uuid) from public, anon, authenticated;

create or replace function app_private.on_profile_referral_qualification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'agent'
     and new.is_verified = true
     and new.is_active = true
     and new.registration_status = 'active'
     and nullif(trim(coalesce(new.company_name, '')), '') is not null then
    perform app_private.process_referral_qualification(new.id);
  end if;
  return new;
end;
$$;
revoke all on function app_private.on_profile_referral_qualification() from public, anon, authenticated;

drop trigger if exists profiles_process_referral_qualification on public.profiles;
create trigger profiles_process_referral_qualification
after insert or update of is_verified, is_active, registration_status, company_name on public.profiles
for each row execute function app_private.on_profile_referral_qualification();

create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_referrer_id uuid;
  v_existing_referrer uuid;
  v_profile_created_at timestamptz;
  v_normalized_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select p.created_at into v_profile_created_at
  from public.profiles p
  where p.id = v_user_id and p.role = 'agent';

  if v_profile_created_at is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  select r.referrer_user_id into v_existing_referrer
  from app_private.referrals r
  where r.referred_user_id = v_user_id;

  if v_existing_referrer is not null then
    return jsonb_build_object('ok', true, 'already_claimed', true);
  end if;

  if v_profile_created_at < now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'claim_window_expired');
  end if;

  select c.user_id into v_referrer_id
  from app_private.referral_codes c
  join public.profiles p on p.id = c.user_id
  where c.code = v_normalized_code
    and p.role = 'agent'
    and p.is_active = true
    and p.registration_status = 'active'
  limit 1;

  if v_referrer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  if v_referrer_id = v_user_id then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  if exists (
    with recursive chain(user_id) as (
      select v_referrer_id
      union all
      select r.referrer_user_id
      from app_private.referrals r
      join chain c on r.referred_user_id = c.user_id
    )
    select 1 from chain where user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'referral_cycle');
  end if;

  insert into app_private.referrals(referred_user_id, referrer_user_id, referral_code)
  values (v_user_id, v_referrer_id, v_normalized_code)
  on conflict (referred_user_id) do nothing;

  perform app_private.process_referral_qualification(v_user_id);

  return jsonb_build_object('ok', true, 'already_claimed', false);
end;
$$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated, service_role;

create or replace function public.get_my_referral_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_direct_count bigint;
  v_qualified_count bigint;
  v_pending_count bigint;
  v_total_bonus bigint;
  v_level1_bonus bigint;
  v_level2_bonus bigint;
  v_level3_bonus bigint;
  v_level1_count bigint;
  v_level2_count bigint;
  v_level3_count bigint;
  v_recent jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'agent') then
    return jsonb_build_object('ok', false, 'reason', 'agent_required');
  end if;

  insert into app_private.referral_codes(user_id, code)
  values (v_user_id, upper(substr(md5(v_user_id::text || ':my-agent-air-referral'), 1, 16)))
  on conflict (user_id) do nothing;

  select c.code into v_code from app_private.referral_codes c where c.user_id = v_user_id;

  select
    count(*)::bigint,
    count(*) filter (where r.status = 'qualified')::bigint,
    count(*) filter (where r.status = 'pending')::bigint
  into v_direct_count, v_qualified_count, v_pending_count
  from app_private.referrals r
  where r.referrer_user_id = v_user_id;

  select
    coalesce(sum(rr.amount),0)::bigint,
    coalesce(sum(rr.amount) filter (where rr.level=1),0)::bigint,
    coalesce(sum(rr.amount) filter (where rr.level=2),0)::bigint,
    coalesce(sum(rr.amount) filter (where rr.level=3),0)::bigint,
    count(*) filter (where rr.level=1)::bigint,
    count(*) filter (where rr.level=2)::bigint,
    count(*) filter (where rr.level=3)::bigint
  into v_total_bonus, v_level1_bonus, v_level2_bonus, v_level3_bonus, v_level1_count, v_level2_count, v_level3_count
  from app_private.referral_rewards rr
  where rr.beneficiary_user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'company_name', x.company_name,
      'agent_type', x.agent_type,
      'status', x.status,
      'created_at', x.created_at,
      'qualified_at', x.qualified_at
    ) order by x.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select p.company_name, p.agent_type, r.status, r.created_at, r.qualified_at
    from app_private.referrals r
    join public.profiles p on p.id = r.referred_user_id
    where r.referrer_user_id = v_user_id
    order by r.created_at desc
    limit 20
  ) x;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'direct_count', v_direct_count,
    'qualified_direct_count', v_qualified_count,
    'pending_direct_count', v_pending_count,
    'total_bonus', v_total_bonus,
    'level1_bonus', v_level1_bonus,
    'level2_bonus', v_level2_bonus,
    'level3_bonus', v_level3_bonus,
    'level1_count', v_level1_count,
    'level2_count', v_level2_count,
    'level3_count', v_level3_count,
    'recent_direct', v_recent
  );
end;
$$;
revoke all on function public.get_my_referral_dashboard() from public, anon;
grant execute on function public.get_my_referral_dashboard() to authenticated, service_role;

create or replace function public.purchase_billing_subscription_from_wallet(p_plan_code text default 'monthly_unlimited')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.billing_subscription_plans%rowtype;
  v_wallet public.billing_wallets%rowtype;
  v_wallet_enabled boolean;
  v_latest_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_subscription_id uuid;
  v_new_balance bigint;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id
      and p.role = 'agent'
      and p.is_active = true
      and p.registration_status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_active');
  end if;

  select s.wallet_mode_enabled into v_wallet_enabled
  from public.billing_settings s where s.id = 1;
  if coalesce(v_wallet_enabled, false) = false then
    return jsonb_build_object('ok', false, 'reason', 'wallet_disabled');
  end if;

  if p_plan_code <> 'monthly_unlimited' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_plan');
  end if;

  select * into v_plan
  from public.billing_subscription_plans p
  where p.code = p_plan_code
  for update;

  if v_plan.code is null or not v_plan.is_active or v_plan.price_amount is null or v_plan.price_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan_unavailable');
  end if;

  insert into public.billing_wallets(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.billing_wallets w
  where w.user_id = v_user_id
  for update;

  if v_wallet.currency <> v_plan.currency then
    return jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
  end if;

  if v_wallet.balance < v_plan.price_amount then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_balance',
      'balance', v_wallet.balance,
      'required_amount', v_plan.price_amount,
      'missing_amount', v_plan.price_amount - v_wallet.balance
    );
  end if;

  select max(s.ends_at) into v_latest_end
  from public.billing_subscriptions s
  where s.user_id = v_user_id
    and s.cancelled_at is null
    and s.ends_at > clock_timestamp();

  v_start := greatest(clock_timestamp(), coalesce(v_latest_end, clock_timestamp()));
  v_end := v_start + make_interval(days => v_plan.duration_days);

  insert into public.billing_subscriptions(
    user_id, plan_code, amount, currency, starts_at, ends_at, method, reference, note, recorded_by
  ) values (
    v_user_id, v_plan.code, v_plan.price_amount, v_plan.currency, v_start, v_end,
    'wallet', null, 'Balansdan avtomatik to‘landi', v_user_id
  ) returning id into v_subscription_id;

  v_new_balance := v_wallet.balance - v_plan.price_amount;
  update public.billing_wallets
     set balance = v_new_balance,
         updated_at = now()
   where user_id = v_user_id;

  insert into public.billing_wallet_ledger(user_id, kind, amount_delta, balance_after, note)
  values (
    v_user_id,
    'admin_debit',
    -v_plan.price_amount,
    v_new_balance,
    'Unlimited abonent tarifi: ' || v_plan.code || '; subscription=' || v_subscription_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_subscription_id,
    'charged_amount', v_plan.price_amount,
    'balance_after', v_new_balance,
    'starts_at', v_start,
    'ends_at', v_end
  );
end;
$$;
revoke all on function public.purchase_billing_subscription_from_wallet(text) from public, anon;
grant execute on function public.purchase_billing_subscription_from_wallet(text) to authenticated, service_role;
