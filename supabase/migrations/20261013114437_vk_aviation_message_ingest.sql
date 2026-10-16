-- Restored from production migration history for fresh-database recovery.
-- The original cloud migration seeded a production-only secret hash. That
-- credential material is intentionally NOT copied into Git. Configure a
-- per-environment hash out of band if this legacy ingest is ever re-enabled.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.vk_ingest_config (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.vk_aviation_messages (
  id uuid primary key default gen_random_uuid(),
  vk_event_id text not null unique,
  group_id bigint not null,
  peer_id bigint not null,
  from_id bigint,
  conversation_message_id bigint,
  message_id bigint,
  sent_at timestamptz,
  text text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  message_kind text not null default 'other',
  is_primary_chat boolean not null default false,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  constraint vk_aviation_messages_kind_check check (message_kind in ('offer','search','availability','sold','other'))
);

create index if not exists vk_aviation_messages_peer_created_idx
  on public.vk_aviation_messages (peer_id, created_at desc);
create index if not exists vk_aviation_messages_kind_created_idx
  on public.vk_aviation_messages (message_kind, created_at desc);

alter table public.vk_aviation_messages enable row level security;
revoke all on table public.vk_aviation_messages from anon, authenticated;

create or replace function public.ingest_vk_aviation_message(p_secret text, p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_secret_hash text;
  v_msg jsonb;
  v_text text;
  v_kind text;
  v_event_id text;
  v_peer_id bigint;
  v_row_id uuid;
begin
  select secret_hash into v_secret_hash from private.vk_ingest_config where id = 1;
  if v_secret_hash is null or encode(digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> v_secret_hash then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if coalesce(p_event->>'type','') <> 'message_new' then
    return jsonb_build_object('ok', true, 'ignored', true, 'reason', 'not_message_new');
  end if;

  v_msg := p_event #> '{object,message}';
  if v_msg is null then
    return jsonb_build_object('ok', false, 'error', 'missing_message');
  end if;

  v_event_id := nullif(p_event->>'event_id','');
  if v_event_id is null then
    v_event_id := concat('fallback:', coalesce(p_event->>'group_id','0'), ':', coalesce(v_msg->>'peer_id','0'), ':', coalesce(v_msg->>'conversation_message_id','0'), ':', coalesce(v_msg->>'date','0'));
  end if;

  v_text := coalesce(v_msg->>'text','');
  v_peer_id := nullif(v_msg->>'peer_id','')::bigint;

  if lower(v_text) ~ '(sotildi|sold|продан|продано|нет мест|joy yo.?q|мест нет)' then
    v_kind := 'sold';
  elsif lower(v_text) ~ '(qoldi|остал|left|last [0-9]+|[0-9]+ joy|[0-9]+ мест)' then
    v_kind := 'availability';
  elsif lower(v_text) ~ '(kerak|qidir|ищу|нужно|need|bor.?mi|bormi|есть ли)' then
    v_kind := 'search';
  elsif lower(v_text) ~ '(stok|stock|vip|bilet|билет|avia|авиа|tarif|тариф|obratka|обратка|seat|joy|мест)' then
    v_kind := 'offer';
  else
    v_kind := 'other';
  end if;

  insert into public.vk_aviation_messages (
    vk_event_id, group_id, peer_id, from_id, conversation_message_id, message_id,
    sent_at, text, attachments, message_kind, is_primary_chat, raw
  ) values (
    v_event_id,
    nullif(p_event->>'group_id','')::bigint,
    v_peer_id,
    nullif(v_msg->>'from_id','')::bigint,
    nullif(v_msg->>'conversation_message_id','')::bigint,
    nullif(v_msg->>'id','')::bigint,
    case when nullif(v_msg->>'date','') is null then null else to_timestamp((v_msg->>'date')::double precision) end,
    v_text,
    coalesce(v_msg->'attachments','[]'::jsonb),
    v_kind,
    v_peer_id = 2000000003,
    p_event
  )
  on conflict (vk_event_id) do update set
    text = excluded.text,
    attachments = excluded.attachments,
    message_kind = excluded.message_kind,
    raw = excluded.raw
  returning id into v_row_id;

  return jsonb_build_object('ok', true, 'id', v_row_id, 'message_kind', v_kind, 'peer_id', v_peer_id, 'primary_chat', v_peer_id = 2000000003);
end;
$$;

revoke all on function public.ingest_vk_aviation_message(text, jsonb) from public, anon, authenticated;
-- Intentionally no execute grant here. The following historical migration
-- also keeps the legacy ingest disabled.
