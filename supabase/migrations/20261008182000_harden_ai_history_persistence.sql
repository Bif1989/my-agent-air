alter table public.ai_chat_messages
  alter column conversation_id set not null;

create or replace function public.touch_ai_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_chat_conversations
     set updated_at = greatest(updated_at, new.created_at)
   where id = new.conversation_id
     and user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.touch_ai_conversation_from_message() from public, anon, authenticated;
grant execute on function public.touch_ai_conversation_from_message() to service_role;

drop trigger if exists ai_chat_messages_touch_conversation on public.ai_chat_messages;
create trigger ai_chat_messages_touch_conversation
after insert on public.ai_chat_messages
for each row execute function public.touch_ai_conversation_from_message();

drop policy if exists "ai history insert own" on public.ai_chat_messages;
create policy "ai history insert own"
on public.ai_chat_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.is_active is true
       and p.registration_status = 'active'
  )
  and exists (
    select 1
      from public.ai_chat_conversations c
     where c.id = ai_chat_messages.conversation_id
       and c.user_id = (select auth.uid())
  )
);
