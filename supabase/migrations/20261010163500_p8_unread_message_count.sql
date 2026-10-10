-- P8 reliability/performance: the global navigation badge only needs one number.
-- Avoid loading every deal conversation summary for each focus/realtime refresh.

create or replace function public.get_unread_deal_message_count()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint
  from public.messages m
  where m.sender_id <> (select auth.uid())
    and m.read_at is null;
$$;

revoke all on function public.get_unread_deal_message_count() from public, anon;
grant execute on function public.get_unread_deal_message_count() to authenticated;
