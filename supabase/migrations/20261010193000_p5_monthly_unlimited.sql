-- P5.3: optional monthly/periodic Unlimited subscription alongside per-deal billing.
-- Subscription payments are recorded manually by an admin for now. No external
-- payment gateway is called in this migration.

create table if not exists public.billing_subscription_plans (
  code text primary key,
  name text not null,
  price_amount integer,
  currency text not null default 'UZS' check (currency = 'UZS'),
  duration_days integer not null default 30 check (duration_days between 1 and 366),
  is_active boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_plan_price_check check (price_amount is null or price_amount > 0)
);

insert into public.billing_subscription_plans (code, name, price_amount, currency, duration_days, is_active)
values ('monthly_unlimited', 'Oylik Unlimited', null, 'UZS', 30, false)
on conflict (code) do nothing;

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null references public.billing_subscription_plans(code),
  amount integer not null check (amount > 0),
  currency text not null default 'UZS' check (currency = 'UZS'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  method text not null check (method in ('cash','bank_transfer','click','payme','other')),
  reference text,
  note text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint billing_subscription_period_check check (ends_at > starts_at)
);

create index if not exists billing_subscriptions_user_period_idx
  on public.billing_subscriptions (user_id, starts_at desc, ends_at desc);
create index if not exists billing_subscriptions_recorded_by_idx
  on public.billing_subscriptions (recorded_by);

alter table public.billing_subscription_plans enable row level security;
alter table public.billing_subscriptions enable row level security;

revoke all on table public.billing_subscription_plans from anon, authenticated;
revoke all on table public.billing_subscriptions from anon, authenticated;
grant select on table public.billing_subscription_plans to authenticated;
grant select on table public.billing_subscriptions to authenticated;
grant select, insert, update, delete on table public.billing_subscription_plans to service_role;
grant select, insert, update, delete on table public.billing_subscriptions to service_role;

drop policy if exists billing_subscription_plans_read on public.billing_subscription_plans;
create policy billing_subscription_plans_read
  on public.billing_subscription_plans
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
  on public.billing_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.deal_fees
  add column if not exists billing_source text;

update public.deal_fees
set billing_source = case when fee_amount = 0 then 'free_quota' else 'per_deal' end
where billing_source is null;

alter table public.deal_fees
  alter column billing_source set default 'per_deal';
alter table public.deal_fees
  alter column billing_source set not null;
alter table public.deal_fees
  drop constraint if exists deal_fees_billing_source_check;
alter table public.deal_fees
  add constraint deal_fees_billing_source_check
  check (billing_source in ('free_quota','per_deal','subscription'));

create or replace function app_private.record_completed_deal_fees(
  p_deal_id uuid,
  p_completed_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals%rowtype;
  v_user_id uuid;
  v_agent_type text;
  v_period_start date;
  v_sequence integer;
  v_fee integer;
  v_subscription_active boolean;
  v_billing_source text;
begin
  select * into v_deal
  from public.deals
  where id = p_deal_id and status = 'completed';

  if not found then
    return;
  end if;

  v_period_start := date_trunc('month', timezone('Asia/Tashkent', p_completed_at))::date;

  perform 1
  from public.profiles
  where id in (v_deal.buyer_id, v_deal.seller_id)
  order by id
  for update;

  for v_user_id in
    select distinct participant_id
    from (values (v_deal.buyer_id), (v_deal.seller_id)) as participants(participant_id)
    where participant_id is not null
  loop
    if exists (
      select 1 from public.deal_fees
      where deal_id = p_deal_id and user_id = v_user_id
    ) then
      continue;
    end if;

    select p.agent_type into v_agent_type
    from public.profiles p
    where p.id = v_user_id;

    select count(*)::integer + 1 into v_sequence
    from public.deal_fees f
    where f.user_id = v_user_id
      and f.period_start = v_period_start;

    select exists (
      select 1
      from public.billing_subscriptions s
      where s.user_id = v_user_id
        and s.cancelled_at is null
        and s.starts_at <= p_completed_at
        and s.ends_at > p_completed_at
    ) into v_subscription_active;

    if v_subscription_active then
      v_fee := 0;
      v_billing_source := 'subscription';
    elsif v_sequence <= 5 then
      v_fee := 0;
      v_billing_source := 'free_quota';
    else
      v_fee := app_private.billing_fee_amount(v_agent_type);
      v_billing_source := 'per_deal';
    end if;

    insert into public.deal_fees (
      deal_id,
      user_id,
      role_snapshot,
      fee_amount,
      currency,
      monthly_sequence,
      status,
      period_start,
      deal_completed_at,
      billing_source
    ) values (
      p_deal_id,
      v_user_id,
      coalesce(v_agent_type, 'agent'),
      v_fee,
      'UZS',
      v_sequence,
      case when v_fee = 0 then 'free' else 'pending' end,
      v_period_start,
      p_completed_at,
      v_billing_source
    )
    on conflict (deal_id, user_id) do nothing;
  end loop;
end;
$$;

revoke all on function app_private.record_completed_deal_fees(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app_private.record_completed_deal_fees(uuid, timestamptz) to service_role;

create or replace function public.get_billing_summary()
returns table (
  agent_type text,
  period_start date,
  free_limit integer,
  completed_count bigint,
  free_used bigint,
  free_remaining integer,
  chargeable_count bigint,
  outstanding_amount bigint,
  paid_amount bigint,
  currency text,
  role_fee_amount integer,
  next_fee_amount integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select p.agent_type
    from public.profiles p
    where p.id = (select auth.uid())
    limit 1
  ),
  period as (
    select date_trunc('month', timezone('Asia/Tashkent', now()))::date as period_start
  ),
  subscription as (
    select exists (
      select 1
      from public.billing_subscriptions s
      where s.user_id = (select auth.uid())
        and s.cancelled_at is null
        and s.starts_at <= now()
        and s.ends_at > now()
    ) as is_active
  ),
  totals as (
    select
      count(*)::bigint as completed_count,
      count(*) filter (where f.status = 'free')::bigint as free_used,
      count(*) filter (where f.fee_amount > 0)::bigint as chargeable_count,
      coalesce(sum(f.fee_amount) filter (where f.status = 'pending'), 0)::bigint as outstanding_amount,
      coalesce(sum(f.fee_amount) filter (where f.status = 'paid'), 0)::bigint as paid_amount
    from public.deal_fees f, period p
    where f.user_id = (select auth.uid())
      and f.period_start = p.period_start
  ),
  priced as (
    select
      coalesce(me.agent_type, 'agent') as agent_type,
      case lower(trim(coalesce(me.agent_type, 'agent')))
        when 'turoperator' then 7000
        when 'tour_operator' then 7000
        when 'mehmonxona' then 10000
        when 'hotel' then 10000
        when 'transport' then 7000
        when 'gid' then 3000
        when 'guide' then 3000
        when 'restoran' then 5000
        when 'restaurant' then 5000
        else 5000
      end as role_fee_amount
    from me
  )
  select
    priced.agent_type,
    period.period_start,
    5::integer as free_limit,
    totals.completed_count,
    totals.free_used,
    greatest(0, 5 - totals.completed_count)::integer as free_remaining,
    totals.chargeable_count,
    totals.outstanding_amount,
    totals.paid_amount,
    'UZS'::text as currency,
    priced.role_fee_amount,
    case when subscription.is_active then 0 when totals.completed_count < 5 then 0 else priced.role_fee_amount end as next_fee_amount
  from period, totals, priced, subscription;
$$;

revoke all on function public.get_billing_summary() from public, anon;
grant execute on function public.get_billing_summary() to authenticated, service_role;

create or replace function public.get_billing_subscription_status()
returns table (
  plan_code text,
  plan_name text,
  plan_price_amount integer,
  currency text,
  duration_days integer,
  plan_is_active boolean,
  subscription_active boolean,
  subscription_starts_at timestamptz,
  subscription_ends_at timestamptz,
  days_remaining integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with plan as (
    select p.code, p.name, p.price_amount, p.currency, p.duration_days, p.is_active
    from public.billing_subscription_plans p
    where p.code = 'monthly_unlimited'
  ),
  current_subscription as (
    select s.starts_at, s.ends_at
    from public.billing_subscriptions s
    where s.user_id = (select auth.uid())
      and s.cancelled_at is null
      and s.starts_at <= now()
      and s.ends_at > now()
    order by s.ends_at desc
    limit 1
  )
  select
    plan.code,
    plan.name,
    plan.price_amount,
    plan.currency,
    plan.duration_days,
    plan.is_active,
    (current_subscription.ends_at is not null),
    current_subscription.starts_at,
    current_subscription.ends_at,
    case when current_subscription.ends_at is null then 0
      else greatest(0, ceil(extract(epoch from (current_subscription.ends_at - now())) / 86400.0)::integer)
    end
  from plan
  left join current_subscription on true;
$$;

revoke all on function public.get_billing_subscription_status() from public, anon;
grant execute on function public.get_billing_subscription_status() to authenticated, service_role;

create or replace function public.admin_get_billing_subscription_plan()
returns table (
  plan_code text,
  plan_name text,
  price_amount integer,
  currency text,
  duration_days integer,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select p.code, p.name, p.price_amount, p.currency, p.duration_days, p.is_active, p.updated_at
  from public.billing_subscription_plans p
  where p.code = 'monthly_unlimited';
end;
$$;

create or replace function public.admin_set_billing_subscription_plan(
  p_price_amount integer,
  p_duration_days integer,
  p_is_active boolean
)
returns public.billing_subscription_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.billing_subscription_plans%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_price_amount is null or p_price_amount <= 0 then
    raise exception 'invalid_subscription_price' using errcode = '22023';
  end if;
  if p_duration_days is null or p_duration_days < 1 or p_duration_days > 366 then
    raise exception 'invalid_subscription_duration' using errcode = '22023';
  end if;

  update public.billing_subscription_plans
  set price_amount = p_price_amount,
      duration_days = p_duration_days,
      is_active = p_is_active,
      updated_by = auth.uid(),
      updated_at = now()
  where code = 'monthly_unlimited'
  returning * into v_plan;

  return v_plan;
end;
$$;

create or replace function public.admin_list_subscription_users()
returns table (
  user_id uuid,
  full_name text,
  company_name text,
  city text,
  agent_type text,
  current_ends_at timestamptz,
  subscription_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.company_name,
    p.city,
    p.agent_type,
    max(s.ends_at) filter (where s.cancelled_at is null and s.ends_at > now()),
    count(s.id)::bigint
  from public.profiles p
  left join public.billing_subscriptions s on s.user_id = p.id
  where p.role = 'agent'
  group by p.id, p.full_name, p.company_name, p.city, p.agent_type
  order by max(s.ends_at) filter (where s.cancelled_at is null and s.ends_at > now()) desc nulls last,
           p.created_at desc;
end;
$$;

create or replace function public.admin_list_billing_subscriptions(p_user_id uuid default null)
returns table (
  subscription_id uuid,
  user_id uuid,
  full_name text,
  company_name text,
  plan_code text,
  amount integer,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  method text,
  reference text,
  note text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.user_id,
    target.full_name,
    target.company_name,
    s.plan_code,
    s.amount,
    s.currency,
    s.starts_at,
    s.ends_at,
    s.method,
    s.reference,
    s.note,
    s.recorded_by,
    coalesce(admin_profile.full_name, admin_profile.company_name, 'Administrator'),
    s.created_at
  from public.billing_subscriptions s
  join public.profiles target on target.id = s.user_id
  left join public.profiles admin_profile on admin_profile.id = s.recorded_by
  where p_user_id is null or s.user_id = p_user_id
  order by s.created_at desc
  limit 300;
end;
$$;

create or replace function public.admin_activate_billing_subscription(
  p_user_id uuid,
  p_method text default 'bank_transfer',
  p_reference text default null,
  p_note text default null
)
returns public.billing_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_plan public.billing_subscription_plans%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_latest_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_admin_id
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_method not in ('cash','bank_transfer','click','payme','other') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  perform 1 from public.profiles p where p.id = p_user_id and p.role = 'agent' for update;
  if not found then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  select * into v_plan
  from public.billing_subscription_plans
  where code = 'monthly_unlimited'
  for update;

  if not found or not v_plan.is_active or v_plan.price_amount is null or v_plan.price_amount <= 0 then
    raise exception 'subscription_plan_inactive' using errcode = 'P0001';
  end if;

  select max(s.ends_at) into v_latest_end
  from public.billing_subscriptions s
  where s.user_id = p_user_id
    and s.cancelled_at is null
    and s.ends_at > clock_timestamp();

  v_start := greatest(clock_timestamp(), coalesce(v_latest_end, clock_timestamp()));
  v_end := v_start + make_interval(days => v_plan.duration_days);

  insert into public.billing_subscriptions (
    user_id, plan_code, amount, currency, starts_at, ends_at, method, reference, note, recorded_by
  ) values (
    p_user_id,
    v_plan.code,
    v_plan.price_amount,
    v_plan.currency,
    v_start,
    v_end,
    p_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_admin_id
  )
  returning * into v_subscription;

  return v_subscription;
end;
$$;

revoke all on function public.admin_get_billing_subscription_plan() from public, anon;
revoke all on function public.admin_set_billing_subscription_plan(integer, integer, boolean) from public, anon;
revoke all on function public.admin_list_subscription_users() from public, anon;
revoke all on function public.admin_list_billing_subscriptions(uuid) from public, anon;
revoke all on function public.admin_activate_billing_subscription(uuid, text, text, text) from public, anon;

grant execute on function public.admin_get_billing_subscription_plan() to authenticated, service_role;
grant execute on function public.admin_set_billing_subscription_plan(integer, integer, boolean) to authenticated, service_role;
grant execute on function public.admin_list_subscription_users() to authenticated, service_role;
grant execute on function public.admin_list_billing_subscriptions(uuid) to authenticated, service_role;
grant execute on function public.admin_activate_billing_subscription(uuid, text, text, text) to authenticated, service_role;
