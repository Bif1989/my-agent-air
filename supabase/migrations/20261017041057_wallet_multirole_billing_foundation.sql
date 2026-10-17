-- Wallet + multi-role billing foundation.
-- Production rollout is gated by public.billing_settings.wallet_mode_enabled (default false).

create table if not exists public.billing_settings (
  id smallint primary key default 1 check (id = 1),
  wallet_mode_enabled boolean not null default false,
  lifetime_free_limit integer not null default 5 check (lifetime_free_limit between 0 and 100),
  low_balance_warning integer not null default 10000 check (low_balance_warning >= 0),
  wallet_topup_min integer not null default 5000 check (wallet_topup_min > 0),
  wallet_topup_max integer not null default 500000000 check (wallet_topup_max >= wallet_topup_min),
  updated_at timestamptz not null default now()
);
insert into public.billing_settings(id) values (1) on conflict (id) do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from anon;
revoke insert, update, delete on public.billing_settings from authenticated;
grant select on public.billing_settings to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='billing_settings' and policyname='billing_settings_read') then
    create policy billing_settings_read on public.billing_settings for select to authenticated using (true);
  end if;
end $$;

create table if not exists public.billing_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  currency text not null default 'UZS' check (currency = 'UZS'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_wallets enable row level security;
revoke all on public.billing_wallets from anon;
revoke insert, update, delete on public.billing_wallets from authenticated;
grant select on public.billing_wallets to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='billing_wallets' and policyname='billing_wallets_select_own') then
    create policy billing_wallets_select_own on public.billing_wallets for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.billing_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('click_topup','deal_charge','refund','admin_credit','admin_debit')),
  amount_delta bigint not null check (amount_delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  currency text not null default 'UZS' check (currency = 'UZS'),
  payment_order_id uuid references public.billing_payment_orders(id) on delete restrict,
  deal_fee_id uuid references public.deal_fees(id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists billing_wallet_ledger_user_created_idx on public.billing_wallet_ledger(user_id, created_at desc);
create unique index if not exists billing_wallet_ledger_payment_order_uq on public.billing_wallet_ledger(payment_order_id) where payment_order_id is not null;
create unique index if not exists billing_wallet_ledger_deal_fee_uq on public.billing_wallet_ledger(deal_fee_id) where deal_fee_id is not null;
alter table public.billing_wallet_ledger enable row level security;
revoke all on public.billing_wallet_ledger from anon;
revoke insert, update, delete on public.billing_wallet_ledger from authenticated;
grant select on public.billing_wallet_ledger to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='billing_wallet_ledger' and policyname='billing_wallet_ledger_select_own') then
    create policy billing_wallet_ledger_select_own on public.billing_wallet_ledger for select to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;

alter table public.requests add column if not exists acting_role text;
alter table public.offers add column if not exists acting_role text;
alter table public.deals add column if not exists buyer_role_snapshot text;
alter table public.deals add column if not exists seller_role_snapshot text;
alter table public.deal_fees add column if not exists lifetime_sequence integer;

with ranked as (
  select id, row_number() over (partition by user_id order by deal_completed_at, created_at, id)::integer as seq
  from public.deal_fees
)
update public.deal_fees f
set lifetime_sequence = r.seq
from ranked r
where r.id = f.id and f.lifetime_sequence is null;

alter table public.deal_fees alter column lifetime_sequence set not null;
alter table public.deal_fees drop constraint if exists deal_fees_lifetime_sequence_check;
alter table public.deal_fees add constraint deal_fees_lifetime_sequence_check check (lifetime_sequence > 0);
create unique index if not exists deal_fees_user_lifetime_sequence_uq on public.deal_fees(user_id, lifetime_sequence);
alter table public.deal_fees drop constraint if exists deal_fees_billing_source_check;
alter table public.deal_fees add constraint deal_fees_billing_source_check check (billing_source in ('free_quota','per_deal','subscription','wallet'));

alter table public.billing_payment_orders add column if not exists wallet_ledger_id uuid references public.billing_wallet_ledger(id);
alter table public.billing_payment_orders alter column plan_code drop not null;
alter table public.billing_payment_orders drop constraint if exists billing_payment_orders_purpose_check;
alter table public.billing_payment_orders add constraint billing_payment_orders_purpose_check check (purpose in ('subscription','wallet_topup'));
alter table public.billing_payment_orders drop constraint if exists billing_payment_orders_purpose_plan_check;
alter table public.billing_payment_orders add constraint billing_payment_orders_purpose_plan_check check (
  (purpose='subscription' and plan_code is not null) or
  (purpose='wallet_topup' and plan_code is null)
);
create index if not exists billing_payment_orders_purpose_user_status_idx on public.billing_payment_orders(purpose,user_id,status,created_at desc);

create or replace function app_private.billing_normalize_role(p_role text)
returns text language sql immutable set search_path='' as $$
  select case
    when lower(trim(coalesce(p_role,''))) in ('turoperator','tour_operator','tour operator') then 'tour_operator'
    when lower(trim(coalesce(p_role,''))) in ('mehmonxona','hotel') then 'hotel'
    when lower(trim(coalesce(p_role,''))) in ('transport','transfer') then 'transport'
    when lower(trim(coalesce(p_role,''))) in ('gid','guide') then 'guide'
    when lower(trim(coalesce(p_role,''))) in ('restoran','restaurant') then 'restaurant'
    when lower(trim(coalesce(p_role,''))) in ('turagent','travel_agent','travel agent','agent') then 'travel_agent'
    when lower(trim(coalesce(p_role,''))) in ('aviakassa','aviation','aviachipta','avia') then 'aviation'
    when lower(trim(coalesce(p_role,''))) in ('viza','visa') then 'visa'
    when lower(trim(coalesce(p_role,''))) in ('boshqa','other') then 'other'
    else 'other'
  end;
$$;

create or replace function app_private.billing_role_from_category(p_category text)
returns text language sql immutable set search_path='' as $$
  select case lower(trim(coalesce(p_category,'')))
    when 'aviachipta' then 'aviation'
    when 'mehmonxona' then 'hotel'
    when 'transfer' then 'transport'
    when 'tur paket' then 'tour_operator'
    when 'gid' then 'guide'
    when 'restoran' then 'restaurant'
    when 'viza' then 'visa'
    else 'other'
  end;
$$;

create or replace function app_private.billing_fee_amount(p_agent_type text)
returns integer language sql immutable set search_path='' as $$
  select case app_private.billing_normalize_role(p_agent_type)
    when 'tour_operator' then 7000
    when 'hotel' then 10000
    when 'transport' then 7000
    when 'guide' then 3000
    when 'restaurant' then 5000
    when 'travel_agent' then 5000
    when 'aviation' then 5000
    when 'visa' then 5000
    else 5000
  end;
$$;

create or replace function app_private.user_has_billing_role(p_user_id uuid, p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  with wanted as (select app_private.billing_normalize_role(p_role) role),
  roles as (
    select app_private.billing_normalize_role(p.agent_type) role
    from public.profiles p where p.id=p_user_id
    union
    select app_private.billing_normalize_role(sc.capability_type)
    from public.supplier_capabilities sc
    where sc.profile_id=p_user_id and sc.is_active
  )
  select exists(select 1 from roles,wanted where roles.role=wanted.role);
$$;
revoke all on function app_private.user_has_billing_role(uuid,text) from public,anon,authenticated;
grant execute on function app_private.user_has_billing_role(uuid,text) to service_role;

create or replace function app_private.user_primary_billing_role(p_user_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select app_private.billing_normalize_role(p.agent_type)
  from public.profiles p where p.id=p_user_id;
$$;
revoke all on function app_private.user_primary_billing_role(uuid) from public,anon,authenticated;
grant execute on function app_private.user_primary_billing_role(uuid) to service_role;

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();
  v_offer public.offers%rowtype;
  v_request public.requests%rowtype;
  v_deal_id uuid;
  v_request_id uuid;
  v_buyer_role text;
  v_seller_role text;
  v_category_role text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select request_id into v_request_id from public.offers where id=p_offer_id;
  if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  select * into v_request from public.requests where id=v_request_id for update;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  select * into v_offer from public.offers where id=p_offer_id and request_id=v_request_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  if v_request.created_by<>v_uid then raise exception 'not_request_owner' using errcode='42501'; end if;
  if v_request.status='accepted' then
    select id into v_deal_id from public.deals where offer_id=p_offer_id and buyer_id=v_uid;
    if found then return v_deal_id; end if;
  end if;
  if not public.request_is_current(v_request.travel_date,v_request.created_at) then raise exception 'request_expired' using errcode='22023'; end if;
  if not app_private.account_is_active(v_offer.agent_id) then raise exception 'counterpart_inactive_or_incomplete' using errcode='42501'; end if;
  if v_request.status<>'open' then raise exception 'request_not_open' using errcode='P0001'; end if;
  if v_offer.status<>'pending' then raise exception 'offer_not_pending' using errcode='P0001'; end if;
  if v_offer.agent_id=v_uid then raise exception 'cannot_accept_own_offer' using errcode='P0001'; end if;
  if v_offer.price is null or v_offer.price<0 or v_offer.price::text in ('NaN','Infinity','-Infinity') then raise exception 'offer_price_required' using errcode='P0001'; end if;

  v_buyer_role:=case
    when v_request.acting_role is not null and app_private.user_has_billing_role(v_request.created_by,v_request.acting_role)
      then app_private.billing_normalize_role(v_request.acting_role)
    else app_private.user_primary_billing_role(v_request.created_by)
  end;
  v_category_role:=app_private.billing_role_from_category(v_request.category);
  v_seller_role:=case
    when v_category_role<>'other' and app_private.user_has_billing_role(v_offer.agent_id,v_category_role) then v_category_role
    when v_offer.acting_role is not null and app_private.user_has_billing_role(v_offer.agent_id,v_offer.acting_role)
      then app_private.billing_normalize_role(v_offer.acting_role)
    else app_private.user_primary_billing_role(v_offer.agent_id)
  end;

  update public.offers set status=case when id=p_offer_id then 'accepted' else 'rejected' end where request_id=v_request.id and status='pending';
  update public.requests set status='accepted' where id=v_request.id;
  insert into public.deals(request_id,offer_id,buyer_id,seller_id,agreed_price,currency,status,buyer_role_snapshot,seller_role_snapshot)
  values(v_request.id,v_offer.id,v_request.created_by,v_offer.agent_id,v_offer.price,coalesce(v_offer.currency,'USD'),'accepted',v_buyer_role,v_seller_role)
  returning id into v_deal_id;
  insert into public.activity_log(deal_id,request_id,actor_id,event_type,event_data)
  values(v_deal_id,v_request.id,v_uid,'offer_accepted',jsonb_build_object('offer_id',v_offer.id,'seller_id',v_offer.agent_id,'price',v_offer.price,'currency',coalesce(v_offer.currency,'USD'),'buyer_role',v_buyer_role,'seller_role',v_seller_role));
  return v_deal_id;
end;
$$;

create or replace function app_private.record_completed_deal_fees(p_deal_id uuid,p_completed_at timestamptz default now())
returns void language plpgsql security definer set search_path='' as $$
declare
  v_deal public.deals%rowtype;
  v_user_id uuid;
  v_agent_type text;
  v_role text;
  v_period_start date;
  v_monthly_sequence integer;
  v_lifetime_sequence integer;
  v_fee integer;
  v_subscription_active boolean;
  v_billing_source text;
  v_wallet_enabled boolean:=false;
  v_free_limit integer:=5;
  v_wallet_balance bigint;
  v_new_balance bigint;
  v_fee_id uuid;
begin
  select * into v_deal from public.deals where id=p_deal_id and status='completed';
  if not found then return; end if;
  v_period_start:=date_trunc('month',timezone('Asia/Tashkent',p_completed_at))::date;
  select wallet_mode_enabled,lifetime_free_limit into v_wallet_enabled,v_free_limit from public.billing_settings where id=1;
  v_wallet_enabled:=coalesce(v_wallet_enabled,false);
  v_free_limit:=coalesce(v_free_limit,5);
  perform 1 from public.profiles where id in(v_deal.buyer_id,v_deal.seller_id) order by id for update;

  for v_user_id in
    select distinct participant_id from (values(v_deal.buyer_id),(v_deal.seller_id)) participants(participant_id)
    where participant_id is not null
  loop
    if exists(select 1 from public.deal_fees where deal_id=p_deal_id and user_id=v_user_id) then continue; end if;
    select p.agent_type into v_agent_type from public.profiles p where p.id=v_user_id;
    v_role:=case when v_user_id=v_deal.buyer_id
      then coalesce(v_deal.buyer_role_snapshot,app_private.billing_normalize_role(v_agent_type))
      else coalesce(v_deal.seller_role_snapshot,app_private.billing_normalize_role(v_agent_type)) end;
    select count(*)::integer+1 into v_monthly_sequence from public.deal_fees f where f.user_id=v_user_id and f.period_start=v_period_start;
    select count(*)::integer+1 into v_lifetime_sequence from public.deal_fees f where f.user_id=v_user_id;
    select exists(select 1 from public.billing_subscriptions s where s.user_id=v_user_id and s.cancelled_at is null and s.starts_at<=p_completed_at and s.ends_at>p_completed_at) into v_subscription_active;

    if not v_wallet_enabled then
      if v_subscription_active then v_fee:=0; v_billing_source:='subscription';
      elsif v_monthly_sequence<=5 then v_fee:=0; v_billing_source:='free_quota';
      else v_fee:=app_private.billing_fee_amount(v_role); v_billing_source:='per_deal'; end if;
      insert into public.deal_fees(deal_id,user_id,role_snapshot,fee_amount,currency,monthly_sequence,lifetime_sequence,status,period_start,deal_completed_at,billing_source)
      values(p_deal_id,v_user_id,v_role,v_fee,'UZS',v_monthly_sequence,v_lifetime_sequence,case when v_fee=0 then 'free' else 'pending' end,v_period_start,p_completed_at,v_billing_source)
      on conflict(deal_id,user_id) do nothing;
      continue;
    end if;

    if v_subscription_active then v_fee:=0; v_billing_source:='subscription';
    elsif v_lifetime_sequence<=v_free_limit then v_fee:=0; v_billing_source:='free_quota';
    else v_fee:=app_private.billing_fee_amount(v_role); v_billing_source:='wallet'; end if;

    if v_fee=0 then
      insert into public.deal_fees(deal_id,user_id,role_snapshot,fee_amount,currency,monthly_sequence,lifetime_sequence,status,period_start,deal_completed_at,billing_source)
      values(p_deal_id,v_user_id,v_role,0,'UZS',v_monthly_sequence,v_lifetime_sequence,'free',v_period_start,p_completed_at,v_billing_source)
      on conflict(deal_id,user_id) do nothing;
    else
      insert into public.billing_wallets(user_id) values(v_user_id) on conflict(user_id) do nothing;
      select balance into v_wallet_balance from public.billing_wallets where user_id=v_user_id for update;
      if coalesce(v_wallet_balance,0)<v_fee then
        raise exception 'billing_insufficient_balance' using errcode='P0001',detail=format('required=%s balance=%s',v_fee,coalesce(v_wallet_balance,0));
      end if;
      v_new_balance:=v_wallet_balance-v_fee;
      update public.billing_wallets set balance=v_new_balance,updated_at=now() where user_id=v_user_id;
      insert into public.deal_fees(deal_id,user_id,role_snapshot,fee_amount,currency,monthly_sequence,lifetime_sequence,status,period_start,deal_completed_at,paid_at,billing_source)
      values(p_deal_id,v_user_id,v_role,v_fee,'UZS',v_monthly_sequence,v_lifetime_sequence,'paid',v_period_start,p_completed_at,p_completed_at,v_billing_source)
      returning id into v_fee_id;
      insert into public.billing_wallet_ledger(user_id,kind,amount_delta,balance_after,deal_fee_id,note)
      values(v_user_id,'deal_charge',-v_fee,v_new_balance,v_fee_id,'Completed deal fee');
    end if;
  end loop;
end;
$$;
revoke all on function app_private.record_completed_deal_fees(uuid,timestamptz) from public,anon,authenticated;
grant execute on function app_private.record_completed_deal_fees(uuid,timestamptz) to service_role;

create or replace function public.get_billing_summary()
returns table(agent_type text,period_start date,free_limit integer,completed_count bigint,free_used bigint,free_remaining integer,chargeable_count bigint,outstanding_amount bigint,paid_amount bigint,currency text,role_fee_amount integer,next_fee_amount integer)
language sql stable security invoker set search_path='' as $$
  with me as(select p.agent_type from public.profiles p where p.id=(select auth.uid()) limit 1),
  settings as(select coalesce(wallet_mode_enabled,false) wallet_mode_enabled,coalesce(lifetime_free_limit,5) free_limit from public.billing_settings where id=1),
  period as(select date_trunc('month',timezone('Asia/Tashkent',now()))::date period_start),
  subscription as(select exists(select 1 from public.billing_subscriptions s where s.user_id=(select auth.uid()) and s.cancelled_at is null and s.starts_at<=now() and s.ends_at>now()) is_active),
  totals as(
    select count(*)::bigint completed_count,
      count(*) filter(where f.billing_source='free_quota')::bigint free_used,
      count(*) filter(where f.fee_amount>0)::bigint chargeable_count,
      coalesce(sum(f.fee_amount) filter(where f.status='pending'),0)::bigint outstanding_amount,
      coalesce(sum(f.fee_amount) filter(where f.status='paid'),0)::bigint paid_amount
    from public.deal_fees f,settings s,period p
    where f.user_id=(select auth.uid()) and(s.wallet_mode_enabled or f.period_start=p.period_start)
  ),
  priced as(select coalesce(me.agent_type,'agent') agent_type,app_private.billing_fee_amount(coalesce(me.agent_type,'agent')) role_fee_amount from me)
  select priced.agent_type,period.period_start,settings.free_limit,totals.completed_count,
    case when settings.wallet_mode_enabled then least(totals.completed_count,settings.free_limit::bigint) else totals.free_used end,
    greatest(0,settings.free_limit-totals.completed_count::integer),totals.chargeable_count,totals.outstanding_amount,totals.paid_amount,
    'UZS'::text,priced.role_fee_amount,
    case when subscription.is_active then 0 when totals.completed_count<settings.free_limit then 0 else priced.role_fee_amount end
  from period,totals,priced,subscription,settings;
$$;

create or replace function public.get_billing_wallet_status()
returns table(wallet_mode_enabled boolean,balance bigint,currency text,low_balance_warning integer,topup_min integer,topup_max integer,free_limit integer,completed_count bigint,free_remaining integer,subscription_active boolean)
language sql stable security invoker set search_path='' as $$
  with settings as(select * from public.billing_settings where id=1),
  wallet as(select w.balance,w.currency from public.billing_wallets w where w.user_id=(select auth.uid())),
  totals as(select count(*)::bigint completed_count from public.deal_fees f where f.user_id=(select auth.uid())),
  subscription as(select exists(select 1 from public.billing_subscriptions s where s.user_id=(select auth.uid()) and s.cancelled_at is null and s.starts_at<=now() and s.ends_at>now()) active)
  select settings.wallet_mode_enabled,coalesce(wallet.balance,0),coalesce(wallet.currency,'UZS'),settings.low_balance_warning,
    settings.wallet_topup_min,settings.wallet_topup_max,settings.lifetime_free_limit,totals.completed_count,
    greatest(0,settings.lifetime_free_limit-totals.completed_count::integer),subscription.active
  from settings cross join totals cross join subscription left join wallet on true;
$$;
revoke all on function public.get_billing_wallet_status() from public,anon;
grant execute on function public.get_billing_wallet_status() to authenticated,service_role;

create or replace function public.complete_billing_click_order(p_order_ref text,p_click_trans_id bigint,p_click_paydoc_id bigint,p_merchant_prepare_id integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public.billing_payment_orders%rowtype;
  v_plan public.billing_subscription_plans%rowtype;
  v_subscription_id uuid;
  v_existing_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_balance bigint;
  v_new_balance bigint;
  v_ledger_id uuid;
begin
  select * into v_order from public.billing_payment_orders where order_ref=p_order_ref and provider='click' for update;
  if v_order.id is null then return jsonb_build_object('ok',false,'reason','order_not_found'); end if;
  if v_order.merchant_prepare_id<>p_merchant_prepare_id then return jsonb_build_object('ok',false,'reason','prepare_mismatch'); end if;
  if v_order.click_trans_id is not null and v_order.click_trans_id<>p_click_trans_id then return jsonb_build_object('ok',false,'reason','transaction_mismatch'); end if;
  if v_order.status='paid' then
    if v_order.purpose='wallet_topup' then
      select balance into v_balance from public.billing_wallets where user_id=v_order.user_id;
      return jsonb_build_object('ok',true,'already_paid',true,'merchant_confirm_id',v_order.merchant_prepare_id,'wallet_ledger_id',v_order.wallet_ledger_id,'balance',coalesce(v_balance,0));
    end if;
    return jsonb_build_object('ok',true,'already_paid',true,'merchant_confirm_id',v_order.merchant_prepare_id,'subscription_id',v_order.subscription_id);
  end if;
  if v_order.status not in('pending','prepared') then return jsonb_build_object('ok',false,'reason','cancelled'); end if;

  if v_order.purpose='wallet_topup' then
    insert into public.billing_wallets(user_id) values(v_order.user_id) on conflict(user_id) do nothing;
    select balance into v_balance from public.billing_wallets where user_id=v_order.user_id for update;
    v_new_balance:=coalesce(v_balance,0)+v_order.amount;
    update public.billing_wallets set balance=v_new_balance,updated_at=now() where user_id=v_order.user_id;
    insert into public.billing_wallet_ledger(user_id,kind,amount_delta,balance_after,payment_order_id,note)
    values(v_order.user_id,'click_topup',v_order.amount,v_new_balance,v_order.id,'CLICK wallet top-up') returning id into v_ledger_id;
    update public.billing_payment_orders
    set status='paid',click_trans_id=coalesce(click_trans_id,p_click_trans_id),click_paydoc_id=coalesce(click_paydoc_id,p_click_paydoc_id),wallet_ledger_id=v_ledger_id,paid_at=now(),updated_at=now()
    where id=v_order.id;
    return jsonb_build_object('ok',true,'already_paid',false,'merchant_confirm_id',v_order.merchant_prepare_id,'wallet_ledger_id',v_ledger_id,'balance',v_new_balance);
  end if;

  select * into v_plan from public.billing_subscription_plans where code=v_order.plan_code;
  if v_plan.code is null or not v_plan.is_active or v_plan.price_amount is null then return jsonb_build_object('ok',false,'reason','plan_unavailable'); end if;
  if v_plan.price_amount<>v_order.amount or v_order.currency<>v_plan.currency then return jsonb_build_object('ok',false,'reason','amount_mismatch'); end if;
  select max(ends_at) into v_existing_end from public.billing_subscriptions where user_id=v_order.user_id and cancelled_at is null and ends_at>now();
  v_start:=greatest(now(),coalesce(v_existing_end,now()));
  v_end:=v_start+make_interval(days=>v_plan.duration_days);
  insert into public.billing_subscriptions(user_id,plan_code,amount,currency,starts_at,ends_at,method,reference,note,recorded_by)
  values(v_order.user_id,v_order.plan_code,v_order.amount,v_order.currency,v_start,v_end,'click','CLICK:'||p_click_trans_id::text||':'||v_order.order_ref,'CLICK Shop API orqali avtomatik tasdiqlandi',v_order.user_id)
  returning id into v_subscription_id;
  update public.billing_payment_orders
  set status='paid',click_trans_id=coalesce(click_trans_id,p_click_trans_id),click_paydoc_id=coalesce(click_paydoc_id,p_click_paydoc_id),subscription_id=v_subscription_id,paid_at=now(),updated_at=now()
  where id=v_order.id;
  return jsonb_build_object('ok',true,'already_paid',false,'merchant_confirm_id',v_order.merchant_prepare_id,'subscription_id',v_subscription_id,'starts_at',v_start,'ends_at',v_end);
end;
$$;
revoke all on function public.complete_billing_click_order(text,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.complete_billing_click_order(text,bigint,bigint,integer) to service_role;
