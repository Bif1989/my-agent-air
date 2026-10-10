-- P5 monetization foundation: five free successful deals per month,
-- then a per-deal fee based on the participant's business role.

create table if not exists public.deal_fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_snapshot text not null,
  fee_amount integer not null check (fee_amount >= 0),
  currency text not null default 'UZS' check (currency = 'UZS'),
  monthly_sequence integer not null check (monthly_sequence > 0),
  status text not null check (status in ('free','pending','paid','waived')),
  period_start date not null,
  deal_completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint deal_fees_deal_user_key unique (deal_id, user_id),
  constraint deal_fees_free_amount_check check ((status = 'free' and fee_amount = 0) or status <> 'free'),
  constraint deal_fees_paid_at_check check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);

create index if not exists deal_fees_user_period_idx
  on public.deal_fees (user_id, period_start, monthly_sequence);
create index if not exists deal_fees_user_status_idx
  on public.deal_fees (user_id, status, created_at desc);

alter table public.deal_fees enable row level security;

revoke all on table public.deal_fees from anon, authenticated;
grant select on table public.deal_fees to authenticated;
grant select, insert, update, delete on table public.deal_fees to service_role;

drop policy if exists deal_fees_select_own on public.deal_fees;
create policy deal_fees_select_own
  on public.deal_fees
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function app_private.billing_fee_amount(p_agent_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_agent_type, 'agent')))
    when 'turoperator' then 7000
    when 'tour_operator' then 7000
    when 'mehmonxona' then 10000
    when 'hotel' then 10000
    when 'transport' then 7000
    when 'gid' then 3000
    when 'guide' then 3000
    when 'restoran' then 5000
    when 'restaurant' then 5000
    when 'turagent' then 5000
    when 'travel_agent' then 5000
    when 'aviakassa' then 5000
    when 'aviation' then 5000
    when 'viza' then 5000
    when 'visa' then 5000
    when 'boshqa' then 5000
    when 'other' then 5000
    else 5000
  end;
$$;

revoke all on function app_private.billing_fee_amount(text) from public, anon, authenticated;
grant execute on function app_private.billing_fee_amount(text) to service_role;

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
begin
  select * into v_deal
  from public.deals
  where id = p_deal_id and status = 'completed';

  if not found then
    return;
  end if;

  v_period_start := date_trunc('month', timezone('Asia/Tashkent', p_completed_at))::date;

  -- Serialize fee sequencing per participant and month so simultaneous completions
  -- cannot both claim the same free-deal position.
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

    v_fee := case when v_sequence <= 5 then 0 else app_private.billing_fee_amount(v_agent_type) end;

    insert into public.deal_fees (
      deal_id,
      user_id,
      role_snapshot,
      fee_amount,
      currency,
      monthly_sequence,
      status,
      period_start,
      deal_completed_at
    ) values (
      p_deal_id,
      v_user_id,
      coalesce(v_agent_type, 'agent'),
      v_fee,
      'UZS',
      v_sequence,
      case when v_fee = 0 then 'free' else 'pending' end,
      v_period_start,
      p_completed_at
    )
    on conflict (deal_id, user_id) do nothing;
  end loop;
end;
$$;

revoke all on function app_private.record_completed_deal_fees(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app_private.record_completed_deal_fees(uuid, timestamptz) to service_role;

-- Count already completed deals from the current Tashkent month so launching P5
-- does not reset a user's monthly free quota in the middle of a month.
with month_bounds as (
  select
    date_trunc('month', timezone('Asia/Tashkent', now()))::date as period_start,
    (date_trunc('month', timezone('Asia/Tashkent', now())) + interval '1 month')::date as period_end
),
participants as (
  select d.id as deal_id, d.buyer_id as user_id, d.updated_at as completed_at
  from public.deals d, month_bounds m
  where d.status = 'completed'
    and timezone('Asia/Tashkent', d.updated_at)::date >= m.period_start
    and timezone('Asia/Tashkent', d.updated_at)::date < m.period_end
  union
  select d.id as deal_id, d.seller_id as user_id, d.updated_at as completed_at
  from public.deals d, month_bounds m
  where d.status = 'completed'
    and timezone('Asia/Tashkent', d.updated_at)::date >= m.period_start
    and timezone('Asia/Tashkent', d.updated_at)::date < m.period_end
),
ranked as (
  select
    x.deal_id,
    x.user_id,
    x.completed_at,
    p.agent_type,
    row_number() over (
      partition by x.user_id
      order by x.completed_at, x.deal_id
    )::integer as monthly_sequence,
    date_trunc('month', timezone('Asia/Tashkent', x.completed_at))::date as period_start
  from participants x
  join public.profiles p on p.id = x.user_id
)
insert into public.deal_fees (
  deal_id,
  user_id,
  role_snapshot,
  fee_amount,
  currency,
  monthly_sequence,
  status,
  period_start,
  deal_completed_at
)
select
  r.deal_id,
  r.user_id,
  coalesce(r.agent_type, 'agent'),
  case when r.monthly_sequence <= 5 then 0 else app_private.billing_fee_amount(r.agent_type) end,
  'UZS',
  r.monthly_sequence,
  case when r.monthly_sequence <= 5 then 'free' else 'pending' end,
  r.period_start,
  r.completed_at
from ranked r
on conflict (deal_id, user_id) do nothing;

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
    case when totals.completed_count < 5 then 0 else priced.role_fee_amount end as next_fee_amount
  from period, totals, priced;
$$;

revoke all on function public.get_billing_summary() from public, anon;
grant execute on function public.get_billing_summary() to authenticated, service_role;

create or replace function public.update_deal_status(p_deal_id uuid, p_status text)
returns public.deals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_old_status text;
  v_completed_at timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;

  select * into v_deal from public.deals where id=p_deal_id for update;
  if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
  if v_uid<>v_deal.buyer_id and v_uid<>v_deal.seller_id then raise exception 'not_deal_participant' using errcode='42501'; end if;
  if p_status not in ('processing','issued','completed','cancelled') then raise exception 'invalid_status' using errcode='22023'; end if;
  if v_deal.status=p_status then return v_deal; end if;

  v_old_status:=v_deal.status;
  if not ((v_old_status='accepted' and p_status in ('processing','cancelled')) or (v_old_status='processing' and p_status in ('issued','cancelled')) or (v_old_status='issued' and p_status='completed')) then
    raise exception 'invalid_status_transition' using errcode='P0001';
  end if;

  v_completed_at := case when p_status = 'completed' then clock_timestamp() else null end;

  update public.deals
  set status=p_status,
      updated_at=coalesce(v_completed_at, now())
  where id=p_deal_id
  returning * into v_deal;

  insert into public.activity_log(deal_id,request_id,actor_id,event_type,event_data)
  values(v_deal.id,v_deal.request_id,v_uid,'deal_status_changed',jsonb_build_object('from',v_old_status,'to',p_status,'status',p_status));

  if p_status = 'completed' then
    perform app_private.record_completed_deal_fees(v_deal.id, v_completed_at);
  end if;

  return v_deal;
end;
$$;

revoke all on function public.update_deal_status(uuid, text) from public, anon;
grant execute on function public.update_deal_status(uuid, text) to authenticated, service_role;
