create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Yangi chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_chat_conversations enable row level security;

create index if not exists ai_chat_conversations_user_updated_idx
  on public.ai_chat_conversations(user_id, updated_at desc);

alter table public.ai_chat_messages
  add column if not exists conversation_id uuid references public.ai_chat_conversations(id) on delete cascade;

create index if not exists ai_chat_messages_conversation_created_idx
  on public.ai_chat_messages(conversation_id, created_at asc);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_chat_conversations' and policyname='ai conversations read own') then
    create policy "ai conversations read own" on public.ai_chat_conversations for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_chat_conversations' and policyname='ai conversations insert own') then
    create policy "ai conversations insert own" on public.ai_chat_conversations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_chat_conversations' and policyname='ai conversations update own') then
    create policy "ai conversations update own" on public.ai_chat_conversations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_chat_conversations' and policyname='ai conversations delete own') then
    create policy "ai conversations delete own" on public.ai_chat_conversations for delete using (auth.uid() = user_id);
  end if;
end $$;

insert into public.ai_chat_conversations (user_id, title, created_at, updated_at)
select m.user_id, 'Oldingi AI tarixi', min(m.created_at), max(m.created_at)
from public.ai_chat_messages m
where m.conversation_id is null
  and not exists (
    select 1 from public.ai_chat_conversations c
    where c.user_id = m.user_id and c.title = 'Oldingi AI tarixi'
  )
group by m.user_id;

update public.ai_chat_messages m
set conversation_id = c.id
from public.ai_chat_conversations c
where m.conversation_id is null
  and c.user_id = m.user_id
  and c.title = 'Oldingi AI tarixi';
