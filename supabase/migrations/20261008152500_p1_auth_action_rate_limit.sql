create table if not exists security_private.auth_action_usage (
  scope_hash text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_action_usage_hash_shape check (scope_hash ~ '^[0-9a-f]{64}$')
);

revoke all on security_private.auth_action_usage from public, anon, authenticated;

create or replace function public.consume_auth_action_quota(
  p_scope_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
  v_window_started timestamptz;
  v_retry_after integer;
begin
  if p_scope_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 500
     or p_window_seconds < 10 or p_window_seconds > 86400 then
    return jsonb_build_object('allowed', false, 'retry_after', 60);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_scope_hash, 9173));

  select attempts, window_started_at
    into v_attempts, v_window_started
  from security_private.auth_action_usage
  where scope_hash = p_scope_hash
  for update;

  if not found or v_window_started <= v_now - pg_catalog.make_interval(secs => p_window_seconds) then
    insert into security_private.auth_action_usage(scope_hash, attempts, window_started_at, updated_at)
    values (p_scope_hash, 1, v_now, v_now)
    on conflict (scope_hash) do update
      set attempts = 1,
          window_started_at = excluded.window_started_at,
          updated_at = excluded.updated_at;
    delete from security_private.auth_action_usage where updated_at < v_now - interval '2 days';
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if v_attempts >= p_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from ((v_window_started + pg_catalog.make_interval(secs => p_window_seconds)) - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retry_after', v_retry_after);
  end if;

  update security_private.auth_action_usage
  set attempts = attempts + 1,
      updated_at = v_now
  where scope_hash = p_scope_hash;

  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_auth_action_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_action_quota(text, integer, integer) to service_role;
