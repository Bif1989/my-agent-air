-- Push notification infrastructure: subscriptions, per-user preferences, and
-- DB triggers that notify an Edge Function on the events we want to push for.
--
-- NOTE: This project's schema lives in the Supabase cloud project and is not
-- otherwise version-controlled in this repo. The trigger definitions below
-- assume the following existing tables/columns (inferred from the frontend
-- API layer): chat_messages(room_id, sender_id, message), chat_rooms(id,
-- room_type), chat_room_members(room_id, user_id), messages(deal_id,
-- sender_id, message), deals(buyer_id, seller_id), offers(request_id,
-- agent_id), requests(created_by, status). Verify these names match the
-- live schema before applying.

-- 1. Where to deliver push notifications for a user.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- 2. Per-user, per-category opt-in/out (defaults: everything ON).
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_messages boolean not null default true,
  deal_messages boolean not null default true,
  offers boolean not null default true,
  new_requests boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_select_own" on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy "notification_preferences_insert_own" on public.notification_preferences
  for insert with check (auth.uid() = user_id);
create policy "notification_preferences_update_own" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Fire-and-forget dispatch to the push-dispatch Edge Function via pg_net.
-- The function itself re-fetches authoritative row data with the service
-- role key, so the trigger payload only carries an event type + row id
-- (never message bodies, tokens, or other sensitive data).
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push_event() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  edge_url text := current_setting('app.settings.push_edge_url', true);
  webhook_secret text := current_setting('app.settings.push_webhook_secret', true);
  event_type text;
begin
  if edge_url is null or edge_url = '' then
    return new; -- Edge Function not configured yet; skip silently.
  end if;

  event_type := case TG_TABLE_NAME
    when 'chat_messages' then 'chat_message'
    when 'messages' then 'deal_message'
    when 'offers' then 'offer'
    when 'requests' then 'new_request'
    else null
  end;
  if event_type is null then
    return new;
  end if;

  perform net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(webhook_secret, '')
    ),
    body := jsonb_build_object('type', event_type, 'id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists trg_push_chat_messages on public.chat_messages;
create trigger trg_push_chat_messages
  after insert on public.chat_messages
  for each row execute function public.notify_push_event();

drop trigger if exists trg_push_deal_messages on public.messages;
create trigger trg_push_deal_messages
  after insert on public.messages
  for each row execute function public.notify_push_event();

drop trigger if exists trg_push_offers on public.offers;
create trigger trg_push_offers
  after insert on public.offers
  for each row execute function public.notify_push_event();

drop trigger if exists trg_push_requests on public.requests;
create trigger trg_push_requests
  after insert on public.requests
  for each row when (new.status = 'open') execute function public.notify_push_event();

-- 4. Operational settings required by notify_push_event() (run once per environment,
-- outside of version control since they reference deployment-specific secrets):
--   alter database postgres set app.settings.push_edge_url = 'https://<project-ref>.functions.supabase.co/push-dispatch';
--   alter database postgres set app.settings.push_webhook_secret = '<random-shared-secret>';
