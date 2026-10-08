create or replace function public.enforce_active_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    if current_user in ('postgres','supabase_admin','service_role') then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  select * into v_profile from public.profiles where id=v_uid;
  if not found or not coalesce(v_profile.is_active,false) then raise exception 'account_inactive' using errcode='42501'; end if;
  if v_profile.registration_status <> 'active' then raise exception 'profile_incomplete' using errcode='42501'; end if;
  if tg_op <> 'DELETE' then
    if tg_table_name in ('messages','chat_messages') and current_user in ('authenticated','anon') and new.message_type='system' then raise exception 'system_message_forbidden' using errcode='42501'; end if;
    if tg_table_name='requests' then
      if tg_op='INSERT' then new.created_at:=now(); end if;
      if new.status='open' and not public.request_is_current(new.travel_date,new.created_at) then raise exception 'request_expired' using errcode='22023'; end if;
    end if;
    if tg_table_name='offers' and new.status='pending' and not exists(select 1 from public.requests r where r.id=new.request_id and r.status='open' and public.request_is_current(r.travel_date,r.created_at)) then raise exception 'request_expired' using errcode='22023'; end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

-- All marketplace/feed/chat policies below require an active, completed registration.
drop policy if exists "Signed in agents can view requests" on public.requests;
create policy "Signed in agents can view requests" on public.requests for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Users can create own requests" on public.requests;
create policy "Users can create own requests" on public.requests for insert to authenticated with check (created_by=(select auth.uid()) and status='open' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Users can update own requests" on public.requests;
create policy "Users can update own requests" on public.requests for update to authenticated using (created_by=(select auth.uid()) and status='open' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')) with check (created_by=(select auth.uid()) and status=any(array['open','closed','cancelled']) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Users can delete own requests" on public.requests;
create policy "Users can delete own requests" on public.requests for delete to authenticated using (created_by=(select auth.uid()) and status=any(array['open','closed','cancelled']) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));

drop policy if exists "Relevant users can view offers" on public.offers;
create policy "Relevant users can view offers" on public.offers for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and (agent_id=(select auth.uid()) or exists(select 1 from public.requests r where r.id=offers.request_id and r.created_by=(select auth.uid()))));
drop policy if exists "Agents can create own offers" on public.offers;
create policy "Agents can create own offers" on public.offers for insert to authenticated with check (agent_id=(select auth.uid()) and status='pending' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.requests r where r.id=offers.request_id and r.status='open' and r.created_by<>(select auth.uid())));
drop policy if exists "Agents can update own pending offers" on public.offers;
create policy "Agents can update own pending offers" on public.offers for update to authenticated using (agent_id=(select auth.uid()) and status='pending' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')) with check (agent_id=(select auth.uid()) and status=any(array['pending','withdrawn']) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Agents can delete own offers" on public.offers;
create policy "Agents can delete own offers" on public.offers for delete to authenticated using (agent_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));

drop policy if exists "Deal participants can view deals" on public.deals;
create policy "Deal participants can view deals" on public.deals for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and (buyer_id=(select auth.uid()) or seller_id=(select auth.uid())));
drop policy if exists "Deal participants can view messages" on public.messages;
create policy "Deal participants can view messages" on public.messages for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.deals d where d.id=messages.deal_id and ((select auth.uid())=d.buyer_id or (select auth.uid())=d.seller_id)));
drop policy if exists "Deal participants can send messages" on public.messages;
create policy "Deal participants can send messages" on public.messages for insert to authenticated with check (sender_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.deals d where d.id=messages.deal_id and ((select auth.uid())=d.buyer_id or (select auth.uid())=d.seller_id)));

drop policy if exists "Active users can view accessible chat rooms" on public.chat_rooms;
create policy "Active users can view accessible chat rooms" on public.chat_rooms for select to authenticated using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active') and is_active=true and (room_type='public' or exists(select 1 from public.chat_room_members m where m.room_id=chat_rooms.id and m.user_id=(select auth.uid()))));
drop policy if exists "Users can view own chat memberships" on public.chat_room_members;
create policy "Users can view own chat memberships" on public.chat_room_members for select to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active'));
drop policy if exists "Users can view accessible chat messages" on public.chat_messages;
create policy "Users can view accessible chat messages" on public.chat_messages for select to authenticated using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active') and exists(select 1 from public.chat_rooms r where r.id=chat_messages.room_id and r.is_active=true and (r.room_type='public' or exists(select 1 from public.chat_room_members m where m.room_id=r.id and m.user_id=(select auth.uid())))));
drop policy if exists "Users can send accessible chat messages" on public.chat_messages;
create policy "Users can send accessible chat messages" on public.chat_messages for insert to authenticated with check (sender_id=(select auth.uid()) and message_type='text' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active') and exists(select 1 from public.chat_rooms r where r.id=chat_messages.room_id and r.is_active=true and (r.room_type='public' or exists(select 1 from public.chat_room_members m where m.room_id=r.id and m.user_id=(select auth.uid())))));

drop policy if exists "Active agents can view feed posts" on public.posts;
create policy "Active agents can view feed posts" on public.posts for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and status<>'deleted' and exists(select 1 from public.profiles a where a.id=posts.author_id and a.is_active is true and a.registration_status='active'));
drop policy if exists "Active agents can create own feed posts" on public.posts;
create policy "Active agents can create own feed posts" on public.posts for insert to authenticated with check (author_id=(select auth.uid()) and status='active' and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Authors can update own feed posts" on public.posts;
create policy "Authors can update own feed posts" on public.posts for update to authenticated using (author_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')) with check (author_id=(select auth.uid()) and status=any(array['active','closed','deleted']) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));

drop policy if exists "Active agents can view feed comments" on public.post_comments;
create policy "Active agents can view feed comments" on public.post_comments for select to authenticated using (deleted_at is null and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.posts p where p.id=post_comments.post_id and p.status<>'deleted'));
drop policy if exists "Active agents can create own comments" on public.post_comments;
create policy "Active agents can create own comments" on public.post_comments for insert to authenticated with check (author_id=(select auth.uid()) and deleted_at is null and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.posts p where p.id=post_comments.post_id and p.status='active'));
drop policy if exists "Authors can update own comments" on public.post_comments;
create policy "Authors can update own comments" on public.post_comments for update to authenticated using (author_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')) with check (author_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));

drop policy if exists "Active agents can view post reactions" on public.post_reactions;
create policy "Active agents can view post reactions" on public.post_reactions for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.posts p where p.id=post_reactions.post_id and p.status<>'deleted'));
drop policy if exists "Active agents can react" on public.post_reactions;
create policy "Active agents can react" on public.post_reactions for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and exists(select 1 from public.posts p where p.id=post_reactions.post_id and p.status='active'));
drop policy if exists "Users can update own reactions" on public.post_reactions;
create policy "Users can update own reactions" on public.post_reactions for update to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active')) with check (user_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Users can delete own reactions" on public.post_reactions;
create policy "Users can delete own reactions" on public.post_reactions for delete to authenticated using (user_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));

drop policy if exists "Users can append own activity" on public.activity_log;
create policy "Users can append own activity" on public.activity_log for insert to authenticated with check (actor_id=(select auth.uid()) and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active'));
drop policy if exists "Users can view related activity" on public.activity_log;
create policy "Users can view related activity" on public.activity_log for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and (actor_id=(select auth.uid()) or exists(select 1 from public.requests r where r.id=activity_log.request_id and r.created_by=(select auth.uid())) or exists(select 1 from public.deals d where d.id=activity_log.deal_id and ((select auth.uid())=d.buyer_id or (select auth.uid())=d.seller_id))));
drop policy if exists "Admins can view admin audit log" on public.admin_audit_log;
create policy "Admins can view admin audit log" on public.admin_audit_log for select to authenticated using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.is_active is true and p.registration_status='active'));
drop policy if exists "supplier_invites_owner_select" on public.supplier_invites;
create policy "supplier_invites_owner_select" on public.supplier_invites for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and (created_by=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin' and p.is_active is true and p.registration_status='active')));

drop policy if exists "Users can create own verification requests" on public.verification_requests;
create policy "Users can create own verification requests" on public.verification_requests for insert to authenticated with check (user_id=(select auth.uid()) and status='pending' and reviewed_at is null and reviewed_by is null and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.registration_status='active' and p.is_verified is false));
drop policy if exists "Users or admins can view verification requests" on public.verification_requests;
create policy "Users or admins can view verification requests" on public.verification_requests for select to authenticated using (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.is_active is true and me.registration_status='active') and (user_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')));
