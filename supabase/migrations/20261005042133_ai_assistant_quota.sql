-- Persistent limits across Vercel instances. No prompts or AI replies are stored.
create schema if not exists ai_private;
revoke all on schema ai_private from public, anon, authenticated;
grant usage on schema ai_private to authenticated;

create table ai_private.assistant_usage (
  scope text not null,
  usage_date date not null,
  attempts integer not null check (attempts >= 0),
  last_request_at timestamptz not null,
  primary key (scope, usage_date)
);
alter table ai_private.assistant_usage enable row level security;
revoke all on ai_private.assistant_usage from public, anon, authenticated;

-- Elevated access is limited to these private counters and a verified active account.
create function ai_private.consume_assistant_quota()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  day_key date;
  request_time timestamptz;
  user_scope text;
  user_count integer;
  total_count integer;
  last_attempt timestamptz;
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    return jsonb_build_object('allowed', false, 'code', 'AUTH_REQUIRED');
  end if;
  if not exists (select 1 from public.profiles where id = actor and is_active = true) then
    return jsonb_build_object('allowed', false, 'code', 'ACCOUNT_INACTIVE');
  end if;
  -- Serialize reservation of both counters so concurrent workers cannot exceed the cap.
  perform pg_catalog.pg_advisory_xact_lock(64670051, 1);
  request_time := clock_timestamp();
  day_key := (request_time at time zone 'Asia/Tashkent')::date;
  user_scope := 'user:' || actor::text;
  select attempts, last_request_at into user_count, last_attempt
    from ai_private.assistant_usage where scope = user_scope and usage_date = day_key;
  select attempts into total_count
    from ai_private.assistant_usage where scope = 'global' and usage_date = day_key;
  if coalesce(user_count, 0) >= 20 then
    return jsonb_build_object('allowed', false, 'code', 'USER_LIMIT');
  end if;
  if coalesce(total_count, 0) >= 100 then
    return jsonb_build_object('allowed', false, 'code', 'GLOBAL_LIMIT');
  end if;
  if last_attempt > request_time - interval '6 seconds' then
    return jsonb_build_object('allowed', false, 'code', 'TOO_FAST');
  end if;
  delete from ai_private.assistant_usage where usage_date < day_key - 7;
  insert into ai_private.assistant_usage(scope, usage_date, attempts, last_request_at)
    values (user_scope, day_key, 1, request_time), ('global', day_key, 1, request_time)
    on conflict (scope, usage_date) do update
    set attempts = assistant_usage.attempts + 1, last_request_at = excluded.last_request_at;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function ai_private.consume_assistant_quota() from public, anon, authenticated;
grant execute on function ai_private.consume_assistant_quota() to authenticated;

-- Only an invoker wrapper is exposed to the Data API; callers cannot edit the counters.
create function public.consume_ai_assistant_quota()
returns jsonb language sql security invoker set search_path = ''
as $$ select ai_private.consume_assistant_quota(); $$;
revoke all on function public.consume_ai_assistant_quota() from public, anon, authenticated;
grant execute on function public.consume_ai_assistant_quota() to authenticated;
