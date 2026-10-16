alter table private.avia_market_subscriptions
  add column if not exists purchase_key text;

create unique index if not exists avia_market_subscriptions_purchase_key_uq
  on private.avia_market_subscriptions(purchase_key)
  where purchase_key is not null;

drop function if exists public.am_buy_tariff(text,bigint,text);

create function public.am_buy_tariff(
  p_secret text,
  p_user_id bigint,
  p_plan_code text,
  p_purchase_key text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_enabled boolean := false;
  v_price bigint;
  v_days integer;
  v_currency text;
  v_plan_name text;
  v_balance bigint;
  v_new_balance bigint;
  v_start timestamptz;
  v_end timestamptz;
  v_subscription_id bigint;
  v_existing private.avia_market_subscriptions%rowtype;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode='28000';
  end if;
  if p_user_id <= 0 or p_plan_code !~ '^[a-z0-9_]{1,64}$' or p_purchase_key !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'status','invalid_input');
  end if;

  select * into v_existing
  from private.avia_market_subscriptions
  where purchase_key=p_purchase_key;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.plan_code<>p_plan_code then
      return jsonb_build_object('ok',false,'status','idempotency_mismatch');
    end if;
    select balance into v_balance from private.avia_market_wallets where user_id=p_user_id;
    return jsonb_build_object(
      'ok',true,'status','activated','already_processed',true,
      'subscription_id',v_existing.id,'plan_code',v_existing.plan_code,
      'amount',v_existing.amount,'balance',coalesce(v_balance,0),
      'starts_at',v_existing.starts_at,'ends_at',v_existing.ends_at
    );
  end if;

  select case lower(value) when 'true' then true else false end into v_enabled
  from private.avia_market_config where key='monetization_enabled';
  if not coalesce(v_enabled,false) then
    return jsonb_build_object('ok',false,'status','monetization_disabled');
  end if;

  select price_amount,duration_days,currency,name
    into v_price,v_days,v_currency,v_plan_name
  from private.avia_market_tariff_plans
  where code=p_plan_code and is_active=true;
  if not found or coalesce(v_price,0)<=0 then
    return jsonb_build_object('ok',false,'status','plan_unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_user_id);
  insert into private.avia_market_wallets(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  select balance into v_balance
  from private.avia_market_wallets
  where user_id=p_user_id
  for update;
  if coalesce(v_balance,0)<v_price then
    return jsonb_build_object('ok',false,'status','insufficient_balance','balance',coalesce(v_balance,0),'required',v_price);
  end if;

  select max(ends_at) into v_start
  from private.avia_market_subscriptions
  where user_id=p_user_id and cancelled_at is null and ends_at>now();
  v_start:=greatest(coalesce(v_start,now()),now());
  v_end:=v_start+pg_catalog.make_interval(days=>v_days);
  v_new_balance:=v_balance-v_price;

  update private.avia_market_wallets
  set balance=v_new_balance,updated_at=now()
  where user_id=p_user_id;

  insert into private.avia_market_subscriptions(
    user_id,plan_code,amount,currency,starts_at,ends_at,purchase_key
  ) values(
    p_user_id,p_plan_code,v_price,v_currency,v_start,v_end,p_purchase_key
  ) returning id into v_subscription_id;

  insert into private.avia_market_wallet_ledger(
    user_id,kind,amount,balance_after,subscription_id,reference
  ) values(
    p_user_id,'tariff_purchase',-v_price,v_new_balance,v_subscription_id,p_plan_code
  );

  return jsonb_build_object(
    'ok',true,'status','activated','subscription_id',v_subscription_id,
    'plan_code',p_plan_code,'plan_name',v_plan_name,'amount',v_price,
    'balance',v_new_balance,'starts_at',v_start,'ends_at',v_end
  );
end;
$function$;

revoke all on function public.am_buy_tariff(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.am_buy_tariff(text,bigint,text,text) to service_role;

create or replace function public.am_create_click_topup(
  p_secret text,
  p_user_id bigint,
  p_amount bigint
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_min bigint:=1000;
  v_max bigint:=500000000;
  v_id bigint;
  v_ref text;
  v_expires timestamptz;
  v_existing private.avia_market_payment_orders%rowtype;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode='28000';
  end if;
  if p_user_id<=0 or p_amount is null or p_amount<=0 then
    return jsonb_build_object('ok',false,'status','invalid_input');
  end if;

  select coalesce(value::bigint,1000) into v_min
  from private.avia_market_config where key='wallet_topup_min_uzs';
  select coalesce(value::bigint,500000000) into v_max
  from private.avia_market_config where key='wallet_topup_max_uzs';
  v_min:=coalesce(v_min,1000);
  v_max:=coalesce(v_max,500000000);
  if p_amount<v_min or p_amount>v_max then
    return jsonb_build_object('ok',false,'status','amount_out_of_range','min_amount',v_min,'max_amount',v_max);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_user_id);
  update private.avia_market_payment_orders
  set status='expired',updated_at=now()
  where user_id=p_user_id and provider='click' and status='pending' and expires_at<=now();

  select * into v_existing
  from private.avia_market_payment_orders
  where user_id=p_user_id
    and provider='click'
    and status='pending'
    and amount=p_amount
    and created_at>=now()-interval '2 minutes'
    and expires_at>now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,'status','created','reused',true,
      'order_id',v_existing.id,'order_ref',v_existing.order_ref,
      'amount',v_existing.amount,'currency',v_existing.currency,
      'expires_at',v_existing.expires_at
    );
  end if;

  insert into private.avia_market_wallets(user_id) values(p_user_id)
    on conflict(user_id) do nothing;
  insert into private.avia_market_payment_orders(user_id,amount)
  values(p_user_id,p_amount)
  returning id,order_ref,expires_at into v_id,v_ref,v_expires;

  return jsonb_build_object(
    'ok',true,'status','created','reused',false,
    'order_id',v_id,'order_ref',v_ref,'amount',p_amount,
    'currency','UZS','expires_at',v_expires
  );
end;
$function$;
