-- Avia Market deposit pricing.
-- Each user gets 3 free offers + 3 free searches per Asia/Tashkent day.
-- Further listings cost 5,000 UZS from the user's deposit wallet.

alter table public.avia_market_listings
  add column if not exists charge_amount bigint not null default 0,
  add column if not exists charge_refunded_at timestamptz;

alter table public.avia_market_listings
  drop constraint if exists avia_market_listings_charge_amount_check;
alter table public.avia_market_listings
  add constraint avia_market_listings_charge_amount_check check (charge_amount >= 0);

insert into private.avia_market_config(key, value)
values
  ('daily_free_offer', '3'),
  ('daily_free_search', '3'),
  ('listing_price_uzs', '5000'),
  ('wallet_topup_min_uzs', '5000')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function private.am_refund_listing_charge(
  p_listing_id bigint,
  p_user_id bigint,
  p_reason text default 'publish_failed'
)
returns bigint
language plpgsql
set search_path to ''
as $function$
declare
  v_charge bigint := 0;
  v_refunded_at timestamptz;
  v_balance bigint := 0;
  v_new_balance bigint := 0;
begin
  select charge_amount, charge_refunded_at
    into v_charge, v_refunded_at
    from public.avia_market_listings
   where id = p_listing_id and user_id = p_user_id
   for update;

  if not found or coalesce(v_charge, 0) <= 0 or v_refunded_at is not null then
    return 0;
  end if;

  insert into private.avia_market_wallets(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from private.avia_market_wallets
   where user_id = p_user_id
   for update;

  v_new_balance := coalesce(v_balance, 0) + v_charge;

  update private.avia_market_wallets
     set balance = v_new_balance,
         updated_at = now()
   where user_id = p_user_id;

  update public.avia_market_listings
     set charge_refunded_at = now(),
         updated_at = now()
   where id = p_listing_id and user_id = p_user_id;

  insert into private.avia_market_wallet_ledger(
    user_id, kind, amount, balance_after, reference
  ) values (
    p_user_id,
    'listing_refund',
    v_charge,
    v_new_balance,
    'listing_refund:' || p_listing_id::text || ':' || left(coalesce(p_reason, 'unknown'), 80)
  );

  return v_charge;
end;
$function$;

revoke all on function private.am_refund_listing_charge(bigint,bigint,text) from public, anon, authenticated;
grant execute on function private.am_refund_listing_charge(bigint,bigint,text) to service_role;

create or replace function public.am_create_listing(p_secret text, p_user_id bigint, p_text text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_mode text;
  v_normalized text;
  v_hash text;
  v_listing_id bigint;
  v_last timestamptz;
  v_retry int;
  v_monetization_enabled boolean := false;
  v_free_limit integer := 3;
  v_used integer := 0;
  v_price bigint := 5000;
  v_balance bigint := 0;
  v_new_balance bigint := 0;
  v_charge bigint := 0;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_stale record;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_user_id <= 0
     or char_length(btrim(coalesce(p_text, ''))) < 2
     or char_length(p_text) > 2000 then
    return jsonb_build_object('ok', false, 'status', 'invalid_input');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_user_id);

  -- Refund any paid listing reservation that never completed publication.
  for v_stale in
    select id
      from public.avia_market_listings
     where user_id = p_user_id
       and state = 'pending'
       and created_at < now() - interval '5 minutes'
     for update
  loop
    perform private.am_refund_listing_charge(v_stale.id, p_user_id, 'stale_pending');
    update public.avia_market_listings
       set state = 'failed',
           failure_code = coalesce(failure_code, 'stale_pending_recovered'),
           updated_at = now()
     where id = v_stale.id
       and user_id = p_user_id
       and state = 'pending';
  end loop;

  select mode into v_mode
    from public.avia_market_sessions
   where user_id = p_user_id
     and expires_at > now();

  if v_mode is null then
    delete from public.avia_market_sessions
     where user_id = p_user_id and expires_at <= now();
    return jsonb_build_object('ok', false, 'status', 'no_mode');
  end if;
  if v_mode not in ('offer', 'search') then
    return jsonb_build_object('ok', false, 'status', 'wrong_mode', 'mode', v_mode);
  end if;

  v_normalized := lower(regexp_replace(btrim(p_text), '[[:space:]]+', ' ', 'g'));
  v_hash := encode(extensions.digest(v_normalized, 'sha256'), 'hex');

  if exists (
    select 1
      from public.avia_market_listings
     where user_id = p_user_id
       and kind = v_mode
       and body_hash = v_hash
       and state in ('pending', 'published')
       and created_at >= now() - interval '24 hours'
  ) then
    delete from public.avia_market_sessions where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'status', 'duplicate', 'kind', v_mode);
  end if;

  select max(created_at) into v_last
    from public.avia_market_listings
   where user_id = p_user_id
     and state in ('pending', 'published')
     and created_at >= now() - interval '30 seconds';

  if v_last is not null then
    v_retry := greatest(1, ceil(extract(epoch from ((v_last + interval '30 seconds') - now())))::int);
    return jsonb_build_object(
      'ok', false, 'status', 'rate_limited', 'retry_after', v_retry, 'kind', v_mode
    );
  end if;

  select case lower(value) when 'true' then true else false end
    into v_monetization_enabled
    from private.avia_market_config
   where key = 'monetization_enabled';
  v_monetization_enabled := coalesce(v_monetization_enabled, false);

  if v_mode = 'offer' then
    select coalesce(value::integer, 3) into v_free_limit
      from private.avia_market_config where key = 'daily_free_offer';
  else
    select coalesce(value::integer, 3) into v_free_limit
      from private.avia_market_config where key = 'daily_free_search';
  end if;
  v_free_limit := greatest(0, coalesce(v_free_limit, 3));

  select coalesce(value::bigint, 5000) into v_price
    from private.avia_market_config where key = 'listing_price_uzs';
  v_price := greatest(0, coalesce(v_price, 5000));

  v_day_start := date_trunc('day', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent';
  v_day_end := (date_trunc('day', now() at time zone 'Asia/Tashkent') + interval '1 day') at time zone 'Asia/Tashkent';

  select count(*)::integer into v_used
    from public.avia_market_listings
   where user_id = p_user_id
     and kind = v_mode
     and state in ('pending', 'published')
     and created_at >= v_day_start
     and created_at < v_day_end;

  if v_monetization_enabled and v_used >= v_free_limit and v_price > 0 then
    insert into private.avia_market_wallets(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select balance into v_balance
      from private.avia_market_wallets
     where user_id = p_user_id
     for update;
    v_balance := coalesce(v_balance, 0);

    if v_balance < v_price then
      return jsonb_build_object(
        'ok', false,
        'status', 'insufficient_balance',
        'kind', v_mode,
        'balance', v_balance,
        'price', v_price,
        'free_limit', v_free_limit,
        'free_used', least(v_used, v_free_limit),
        'free_remaining', greatest(v_free_limit - v_used, 0)
      );
    end if;

    v_charge := v_price;
    v_new_balance := v_balance - v_charge;
    update private.avia_market_wallets
       set balance = v_new_balance,
           updated_at = now()
     where user_id = p_user_id;
  end if;

  insert into public.avia_market_listings(
    user_id, kind, body, body_hash, state, charge_amount
  ) values (
    p_user_id, v_mode, btrim(p_text), v_hash, 'pending', v_charge
  ) returning id into v_listing_id;

  if v_charge > 0 then
    insert into private.avia_market_wallet_ledger(
      user_id, kind, amount, balance_after, reference
    ) values (
      p_user_id, 'listing_charge', -v_charge, v_new_balance, 'listing:' || v_listing_id::text
    );
  else
    select coalesce(balance, 0) into v_balance
      from private.avia_market_wallets
     where user_id = p_user_id;
    v_new_balance := coalesce(v_balance, 0);
  end if;

  delete from public.avia_market_sessions where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'created',
    'id', v_listing_id,
    'kind', v_mode,
    'charge_amount', v_charge,
    'balance', v_new_balance,
    'free_limit', v_free_limit,
    'free_used', least(v_used + 1, v_free_limit),
    'free_remaining', greatest(v_free_limit - (v_used + 1), 0)
  );
end;
$function$;

create or replace function public.am_finalize_listing(
  p_secret text,
  p_listing_id bigint,
  p_user_id bigint,
  p_state text,
  p_vk_message_id bigint default null,
  p_vk_conversation_message_id bigint default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_current_state text;
  v_refund bigint := 0;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_state not in ('published', 'failed') then
    return jsonb_build_object('ok', false, 'status', 'invalid_state');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_user_id);

  select state into v_current_state
    from public.avia_market_listings
   where id = p_listing_id and user_id = p_user_id
   for update;

  if v_current_state is null then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;

  if v_current_state = p_state then
    if p_state = 'published' then
      update public.avia_market_listings
         set vk_message_id = coalesce(vk_message_id, p_vk_message_id),
             vk_conversation_message_id = coalesce(vk_conversation_message_id, p_vk_conversation_message_id),
             updated_at = now()
       where id = p_listing_id and user_id = p_user_id;
    end if;
    return jsonb_build_object('ok', true, 'status', p_state, 'idempotent', true, 'refunded', 0);
  end if;

  if v_current_state <> 'pending' then
    return jsonb_build_object(
      'ok', false, 'status', 'state_conflict', 'current_state', v_current_state
    );
  end if;

  if p_state = 'failed' then
    v_refund := private.am_refund_listing_charge(
      p_listing_id, p_user_id, coalesce(p_failure_code, 'publish_failed')
    );
  end if;

  update public.avia_market_listings
     set state = p_state,
         vk_message_id = case when p_state = 'published' then p_vk_message_id else vk_message_id end,
         vk_conversation_message_id = case when p_state = 'published' then p_vk_conversation_message_id else vk_conversation_message_id end,
         failure_code = case when p_state = 'failed' then left(coalesce(p_failure_code, 'unknown'), 120) else null end,
         published_at = case when p_state = 'published' then now() else published_at end,
         updated_at = now()
   where id = p_listing_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true, 'status', p_state, 'idempotent', false, 'refunded', v_refund
  );
end;
$function$;

create or replace function public.am_billing_status(p_secret text, p_user_id bigint)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_balance bigint := 0;
  v_enabled boolean := false;
  v_click_topup_enabled boolean := false;
  v_price bigint := 5000;
  v_offer_limit integer := 3;
  v_search_limit integer := 3;
  v_offer_used integer := 0;
  v_search_used integer := 0;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  if not private.am_secret_ok(p_secret) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_user_id <= 0 then
    return jsonb_build_object('ok', false, 'status', 'invalid_input');
  end if;

  select balance into v_balance
    from private.avia_market_wallets
   where user_id = p_user_id;
  v_balance := coalesce(v_balance, 0);

  select case lower(value) when 'true' then true else false end into v_enabled
    from private.avia_market_config where key = 'monetization_enabled';
  v_enabled := coalesce(v_enabled, false);

  select case lower(value) when 'true' then true else false end into v_click_topup_enabled
    from private.avia_market_config where key = 'click_topup_enabled';
  v_click_topup_enabled := coalesce(v_click_topup_enabled, false);

  select coalesce(value::bigint, 5000) into v_price
    from private.avia_market_config where key = 'listing_price_uzs';
  select coalesce(value::integer, 3) into v_offer_limit
    from private.avia_market_config where key = 'daily_free_offer';
  select coalesce(value::integer, 3) into v_search_limit
    from private.avia_market_config where key = 'daily_free_search';

  v_price := greatest(0, coalesce(v_price, 5000));
  v_offer_limit := greatest(0, coalesce(v_offer_limit, 3));
  v_search_limit := greatest(0, coalesce(v_search_limit, 3));

  v_day_start := date_trunc('day', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent';
  v_day_end := (date_trunc('day', now() at time zone 'Asia/Tashkent') + interval '1 day') at time zone 'Asia/Tashkent';

  select count(*)::integer into v_offer_used
    from public.avia_market_listings
   where user_id = p_user_id
     and kind = 'offer'
     and state in ('pending', 'published')
     and created_at >= v_day_start
     and created_at < v_day_end;

  select count(*)::integer into v_search_used
    from public.avia_market_listings
   where user_id = p_user_id
     and kind = 'search'
     and state in ('pending', 'published')
     and created_at >= v_day_start
     and created_at < v_day_end;

  return jsonb_build_object(
    'ok', true,
    'balance', v_balance,
    'currency', 'UZS',
    'monetization_enabled', v_enabled,
    'click_topup_enabled', v_click_topup_enabled,
    'price_per_listing', v_price,
    'today', jsonb_build_object(
      'timezone', 'Asia/Tashkent',
      'offer_limit', v_offer_limit,
      'offer_used', v_offer_used,
      'offer_remaining', greatest(v_offer_limit - v_offer_used, 0),
      'search_limit', v_search_limit,
      'search_used', v_search_used,
      'search_remaining', greatest(v_search_limit - v_search_used, 0)
    )
  );
end;
$function$;

revoke all on function public.am_create_listing(text,bigint,text) from public, anon, authenticated;
revoke all on function public.am_finalize_listing(text,bigint,bigint,text,bigint,bigint,text) from public, anon, authenticated;
revoke all on function public.am_billing_status(text,bigint) from public, anon, authenticated;
grant execute on function public.am_create_listing(text,bigint,text) to service_role;
grant execute on function public.am_finalize_listing(text,bigint,bigint,text,bigint,bigint,text) to service_role;
grant execute on function public.am_billing_status(text,bigint) to service_role;
