create schema if not exists security_private;
revoke all on schema security_private from public, anon, authenticated;

create table if not exists security_private.auth_login_failures (
  scope_hash text primary key,
  failures integer not null default 0 check (failures >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint auth_login_failures_hash_shape check (scope_hash ~ '^[0-9a-f]{64}$')
);

revoke all on security_private.auth_login_failures from public, anon, authenticated;

create or replace function public.auth_login_limit_status(
  p_pair_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_pair_blocked timestamptz;
  v_ip_blocked timestamptz;
  v_blocked_until timestamptz;
  v_retry_after integer := 0;
begin
  if p_pair_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('blocked', true, 'retry_after', 60);
  end if;

  select blocked_until into v_pair_blocked
  from security_private.auth_login_failures
  where scope_hash = p_pair_hash;

  select blocked_until into v_ip_blocked
  from security_private.auth_login_failures
  where scope_hash = p_ip_hash;

  v_blocked_until := case
    when v_pair_blocked is null then v_ip_blocked
    when v_ip_blocked is null then v_pair_blocked
    else greatest(v_pair_blocked, v_ip_blocked)
  end;

  if v_blocked_until is not null and v_blocked_until > v_now then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_blocked_until - v_now)))::integer);
    return jsonb_build_object('blocked', true, 'retry_after', v_retry_after);
  end if;

  return jsonb_build_object('blocked', false, 'retry_after', 0);
end;
$$;

create or replace function public.record_auth_login_result(
  p_pair_hash text,
  p_ip_hash text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_scope text;
  v_limit integer;
  v_block_seconds integer;
  v_failures integer;
  v_window_started timestamptz;
  v_blocked_until timestamptz;
begin
  if p_pair_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  if p_success then
    delete from security_private.auth_login_failures where scope_hash = p_pair_hash;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 9137));

  for v_scope, v_limit, v_block_seconds in
    select * from (
      values
        (p_pair_hash, 5, 900),
        (p_ip_hash, 30, 1800)
    ) as limits(scope_hash, failure_limit, block_seconds)
  loop
    select failures, window_started_at, blocked_until
      into v_failures, v_window_started, v_blocked_until
    from security_private.auth_login_failures
    where scope_hash = v_scope
    for update;

    if not found or v_window_started < v_now - interval '15 minutes' then
      insert into security_private.auth_login_failures(scope_hash, failures, window_started_at, blocked_until, updated_at)
      values (v_scope, 1, v_now, null, v_now)
      on conflict (scope_hash) do update
        set failures = 1,
            window_started_at = excluded.window_started_at,
            blocked_until = null,
            updated_at = excluded.updated_at;
    else
      v_failures := v_failures + 1;
      update security_private.auth_login_failures
      set failures = v_failures,
          blocked_until = case
            when v_failures >= v_limit then greatest(coalesce(v_blocked_until, v_now), v_now + pg_catalog.make_interval(secs => v_block_seconds))
            else v_blocked_until
          end,
          updated_at = v_now
      where scope_hash = v_scope;
    end if;
  end loop;

  delete from security_private.auth_login_failures
  where updated_at < v_now - interval '2 days';
end;
$$;

revoke all on function public.auth_login_limit_status(text, text) from public, anon, authenticated;
revoke all on function public.record_auth_login_result(text, text, boolean) from public, anon, authenticated;
grant execute on function public.auth_login_limit_status(text, text) to service_role;
grant execute on function public.record_auth_login_result(text, text, boolean) to service_role;
