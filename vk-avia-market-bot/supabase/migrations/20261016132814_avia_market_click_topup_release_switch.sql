insert into private.avia_market_config(key, value, updated_at)
values ('click_topup_enabled', 'false', now())
on conflict (key) do nothing;

create or replace function public.am_billing_status(p_secret text, p_user_id bigint)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_balance bigint := 0;
  v_enabled boolean := false;
  v_click_topup_enabled boolean := false;
  v_plan_code text;
  v_plan_name text;
  v_plan_price bigint;
  v_plan_currency text;
  v_plan_days integer;
  v_plan_active boolean;
  v_subscription_ends timestamptz;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode='28000';
  end if;
  if p_user_id <= 0 then
    return jsonb_build_object('ok',false,'status','invalid_input');
  end if;

  select balance into v_balance
  from private.avia_market_wallets
  where user_id=p_user_id;
  v_balance:=coalesce(v_balance,0);

  select case lower(value) when 'true' then true else false end into v_enabled
  from private.avia_market_config where key='monetization_enabled';
  v_enabled:=coalesce(v_enabled,false);

  select case lower(value) when 'true' then true else false end into v_click_topup_enabled
  from private.avia_market_config where key='click_topup_enabled';
  v_click_topup_enabled:=coalesce(v_click_topup_enabled,false);

  select code,name,price_amount,currency,duration_days,is_active
    into v_plan_code,v_plan_name,v_plan_price,v_plan_currency,v_plan_days,v_plan_active
  from private.avia_market_tariff_plans
  where code='pro_30d';

  select max(ends_at) into v_subscription_ends
  from private.avia_market_subscriptions
  where user_id=p_user_id and cancelled_at is null and ends_at>now();

  return jsonb_build_object(
    'ok',true,
    'balance',v_balance,
    'currency','UZS',
    'monetization_enabled',v_enabled,
    'click_topup_enabled',v_click_topup_enabled,
    'subscription_active',v_subscription_ends is not null,
    'subscription_ends_at',v_subscription_ends,
    'plan',jsonb_build_object(
      'code',coalesce(v_plan_code,'pro_30d'),
      'name',coalesce(v_plan_name,'AVIA MARKET PRO'),
      'price_amount',coalesce(v_plan_price,0),
      'currency',coalesce(v_plan_currency,'UZS'),
      'duration_days',coalesce(v_plan_days,30),
      'is_active',coalesce(v_plan_active,false)
    )
  );
end;
$function$;

revoke all on function public.am_billing_status(text,bigint) from public,anon,authenticated;
grant execute on function public.am_billing_status(text,bigint) to service_role;
