alter table public.ai_chat_messages
  add column if not exists client_created_at timestamptz;

update public.ai_chat_messages
set client_created_at = created_at
where client_created_at is null;

alter table public.ai_chat_messages
  alter column client_created_at set default now(),
  alter column client_created_at set not null;

create index if not exists ai_chat_messages_conversation_client_created_idx
  on public.ai_chat_messages (conversation_id, client_created_at, id);
