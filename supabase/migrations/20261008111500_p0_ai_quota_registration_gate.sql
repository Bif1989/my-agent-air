create or replace function ai_private.consume_assistant_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then return jsonb_build_object('allowed',false,'code','AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.profiles where id=actor and is_active is true and registration_status='active') then return jsonb_build_object('allowed',false,'code','ACCOUNT_INACTIVE'); end if;
  perform pg_catalog.pg_advisory_xact_lock(64670051,1);
  request_time:=clock_timestamp(); day_key:=(request_time at time zone 'Asia/Tashkent')::date; user_scope:='user:'||actor::text;
  select attempts,last_request_at into user_count,last_attempt from ai_private.assistant_usage where scope=user_scope and usage_date=day_key;
  select attempts into total_count from ai_private.assistant_usage where scope='global' and usage_date=day_key;
  if coalesce(user_count,0)>=20 then return jsonb_build_object('allowed',false,'code','USER_LIMIT'); end if;
  if coalesce(total_count,0)>=100 then return jsonb_build_object('allowed',false,'code','GLOBAL_LIMIT'); end if;
  if last_attempt>request_time-interval '6 seconds' then return jsonb_build_object('allowed',false,'code','TOO_FAST'); end if;
  delete from ai_private.assistant_usage where usage_date<day_key-7;
  insert into ai_private.assistant_usage(scope,usage_date,attempts,last_request_at) values(user_scope,day_key,1,request_time),('global',day_key,1,request_time)
  on conflict(scope,usage_date) do update set attempts=assistant_usage.attempts+1,last_request_at=excluded.last_request_at;
  return jsonb_build_object('allowed',true);
end;
$$;

create or replace function ai_private.consume_voice_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then return jsonb_build_object('allowed',false,'code','AUTH_REQUIRED'); end if;
  if not exists (select 1 from public.profiles where id=actor and is_active is true and registration_status='active') then return jsonb_build_object('allowed',false,'code','ACCOUNT_INACTIVE'); end if;
  perform pg_catalog.pg_advisory_xact_lock(64670051,2);
  request_time:=clock_timestamp(); day_key:=(request_time at time zone 'Asia/Tashkent')::date; user_scope:='voice:user:'||actor::text;
  select attempts,last_request_at into user_count,last_attempt from ai_private.assistant_usage where scope=user_scope and usage_date=day_key;
  select attempts into total_count from ai_private.assistant_usage where scope='voice:global' and usage_date=day_key;
  if coalesce(user_count,0)>=20 then return jsonb_build_object('allowed',false,'code','USER_LIMIT'); end if;
  if coalesce(total_count,0)>=100 then return jsonb_build_object('allowed',false,'code','GLOBAL_LIMIT'); end if;
  if last_attempt>request_time-interval '30 seconds' then return jsonb_build_object('allowed',false,'code','TOO_FAST'); end if;
  delete from ai_private.assistant_usage where scope like 'voice:%' and usage_date<day_key-7;
  insert into ai_private.assistant_usage(scope,usage_date,attempts,last_request_at) values(user_scope,day_key,1,request_time),('voice:global',day_key,1,request_time)
  on conflict(scope,usage_date) do update set attempts=assistant_usage.attempts+1,last_request_at=excluded.last_request_at;
  return jsonb_build_object('allowed',true);
end;
$$;
