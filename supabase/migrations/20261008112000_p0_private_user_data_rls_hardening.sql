-- AI conversation history: active completed accounts may use/read it; owners may always delete their own rows.
drop policy if exists "ai conversations read own" on public.ai_chat_conversations;
create policy "ai conversations read own" on public.ai_chat_conversations for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "ai conversations insert own" on public.ai_chat_conversations;
create policy "ai conversations insert own" on public.ai_chat_conversations for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "ai conversations update own" on public.ai_chat_conversations;
create policy "ai conversations update own" on public.ai_chat_conversations for update to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'))
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "ai conversations delete own" on public.ai_chat_conversations;
create policy "ai conversations delete own" on public.ai_chat_conversations for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists "ai history read own" on public.ai_chat_messages;
create policy "ai history read own" on public.ai_chat_messages for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "ai history insert own" on public.ai_chat_messages;
create policy "ai history insert own" on public.ai_chat_messages for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "ai history delete own" on public.ai_chat_messages;
create policy "ai history delete own" on public.ai_chat_messages for delete to authenticated
using (user_id=(select auth.uid()));

-- Push data is per-user; only completed active accounts can create/read/update, but an owner can always remove their own subscription.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions for update to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'))
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'))
with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
