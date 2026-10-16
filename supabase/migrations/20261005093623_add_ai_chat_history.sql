create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_user_created_idx
  on public.ai_chat_messages(user_id, created_at desc);

alter table public.ai_chat_messages enable row level security;

drop policy if exists "ai history read own" on public.ai_chat_messages;
create policy "ai history read own" on public.ai_chat_messages
  for select using (auth.uid() = user_id);

drop policy if exists "ai history insert own" on public.ai_chat_messages;
create policy "ai history insert own" on public.ai_chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai history delete own" on public.ai_chat_messages;
create policy "ai history delete own" on public.ai_chat_messages
  for delete using (auth.uid() = user_id);
