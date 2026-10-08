create or replace function public.create_group_chat(p_title text, p_description text default null::text, p_member_ids uuid[] default '{}'::uuid[])
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_room_id uuid; v_title text:=trim(coalesce(p_title,'')); v_description text:=nullif(trim(coalesce(p_description,'')),''); v_member_ids uuid[]; v_requested_count integer; v_valid_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if char_length(v_title)<3 or char_length(v_title)>100 then raise exception 'invalid_group_title' using errcode='22023'; end if;
  if v_description is not null and char_length(v_description)>500 then raise exception 'group_description_too_long' using errcode='22023'; end if;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_member_ids from unnest(coalesce(p_member_ids,'{}'::uuid[])) x where x is not null and x<>v_uid;
  v_requested_count:=coalesce(cardinality(v_member_ids),0); if v_requested_count>99 then raise exception 'too_many_group_members' using errcode='22023'; end if;
  select count(*) into v_valid_count from unnest(v_member_ids) x where app_private.account_is_active(x);
  if v_valid_count<>v_requested_count then raise exception 'group_member_not_available' using errcode='P0002'; end if;
  insert into public.chat_rooms(room_type,title,description,created_by,is_active) values('group',v_title,v_description,v_uid,true) returning id into v_room_id;
  insert into public.chat_room_members(room_id,user_id,member_role,last_read_at) values(v_room_id,v_uid,'owner',now());
  if v_requested_count>0 then insert into public.chat_room_members(room_id,user_id,member_role) select v_room_id,x,'member' from unnest(v_member_ids) x on conflict(room_id,user_id) do nothing; end if;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(v_room_id,v_uid,'Guruh yaratildi','system');
  return v_room_id;
end; $$;

create or replace function public.get_or_create_direct_chat(p_other_user_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_key text; v_room_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if p_other_user_id is null or p_other_user_id=v_uid then raise exception 'invalid_other_user' using errcode='22023'; end if;
  if not app_private.account_is_active(p_other_user_id) then raise exception 'other_user_not_available' using errcode='P0002'; end if;
  v_key:=least(v_uid::text,p_other_user_id::text)||':'||greatest(v_uid::text,p_other_user_id::text);
  insert into public.chat_rooms(room_type,direct_key,created_by,is_active) values('direct',v_key,v_uid,true)
  on conflict(direct_key) do update set updated_at=public.chat_rooms.updated_at returning id into v_room_id;
  insert into public.chat_room_members(room_id,user_id,member_role) values(v_room_id,v_uid,'member'),(v_room_id,p_other_user_id,'member') on conflict(room_id,user_id) do nothing;
  return v_room_id;
end; $$;

create or replace function public.mark_chat_room_read(p_room_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_type text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select r.room_type into v_type from public.chat_rooms r where r.id=p_room_id and r.is_active=true;
  if not found then raise exception 'room_not_found' using errcode='P0002'; end if;
  if v_type='public' then
    insert into public.chat_room_members(room_id,user_id,member_role,last_read_at) values(p_room_id,v_uid,'member',now())
    on conflict(room_id,user_id) do update set last_read_at=excluded.last_read_at;
  else
    update public.chat_room_members set last_read_at=now() where room_id=p_room_id and user_id=v_uid;
    if not found then raise exception 'not_room_member' using errcode='42501'; end if;
  end if;
end; $$;

create or replace function public.add_group_members(p_room_id uuid,p_user_ids uuid[])
returns integer language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_role text; v_ids uuid[]; v_requested integer; v_valid integer; v_current integer; v_new_count integer; v_added integer:=0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select m.member_role into v_role from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and r.room_type='group' and r.is_active=true;
  if v_role not in ('owner','admin') then raise exception 'group_admin_required' using errcode='42501'; end if;
  select coalesce(array_agg(distinct x),'{}'::uuid[]) into v_ids from unnest(coalesce(p_user_ids,'{}'::uuid[])) x where x is not null;
  v_requested:=coalesce(cardinality(v_ids),0); if v_requested=0 then return 0; end if;
  select count(*) into v_valid from unnest(v_ids) x where app_private.account_is_active(x);
  if v_valid<>v_requested then raise exception 'group_member_not_available' using errcode='P0002'; end if;
  select count(*) into v_current from public.chat_room_members where room_id=p_room_id;
  select count(*) into v_new_count from unnest(v_ids) x where not exists(select 1 from public.chat_room_members m where m.room_id=p_room_id and m.user_id=x);
  if v_current+v_new_count>100 then raise exception 'group_member_limit_reached' using errcode='22023'; end if;
  with ins as (insert into public.chat_room_members(room_id,user_id,member_role) select p_room_id,x,'member' from unnest(v_ids) x on conflict(room_id,user_id) do nothing returning 1) select count(*) into v_added from ins;
  if v_added>0 then insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,v_added::text||' ta yangi a’zo qo‘shildi','system'); end if;
  return v_added;
end; $$;

create or replace function public.close_group_chat(p_room_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if not exists(select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner' and r.room_type='group' and r.is_active=true) then raise exception 'group_owner_required' using errcode='42501'; end if;
  update public.chat_rooms set is_active=false,updated_at=now() where id=p_room_id;
end; $$;

create or replace function public.leave_group_chat(p_room_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_role text; v_name text; begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select m.member_role,coalesce(p.full_name,p.company_name,'A’zo') into v_role,v_name from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id join public.profiles p on p.id=m.user_id where m.room_id=p_room_id and m.user_id=v_uid and r.room_type='group' and r.is_active=true;
  if not found then raise exception 'not_group_member' using errcode='42501'; end if;
  if v_role='owner' then raise exception 'owner_must_transfer_first' using errcode='P0001'; end if;
  delete from public.chat_room_members where room_id=p_room_id and user_id=v_uid;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,v_name||' guruhni tark etdi','system');
end; $$;

create or replace function public.remove_group_member(p_room_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_actor_role text; v_target_role text; v_target_name text; begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if p_user_id=v_uid then raise exception 'use_leave_group' using errcode='22023'; end if;
  select m.member_role into v_actor_role from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and r.room_type='group' and r.is_active=true;
  if v_actor_role not in ('owner','admin') then raise exception 'group_admin_required' using errcode='42501'; end if;
  select m.member_role,coalesce(p.full_name,p.company_name,'A’zo') into v_target_role,v_target_name from public.chat_room_members m join public.profiles p on p.id=m.user_id where m.room_id=p_room_id and m.user_id=p_user_id;
  if not found then raise exception 'group_member_not_found' using errcode='P0002'; end if;
  if v_target_role='owner' then raise exception 'cannot_remove_group_owner' using errcode='42501'; end if;
  if v_actor_role='admin' and v_target_role<>'member' then raise exception 'owner_required' using errcode='42501'; end if;
  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,v_target_name||' guruhdan chiqarildi','system');
end; $$;

create or replace function public.set_group_member_role(p_room_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_target_role text; v_target_name text; begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if p_role not in ('admin','member') then raise exception 'invalid_member_role' using errcode='22023'; end if;
  if not exists(select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner' and r.room_type='group' and r.is_active=true) then raise exception 'group_owner_required' using errcode='42501'; end if;
  select m.member_role,coalesce(p.full_name,p.company_name,'A’zo') into v_target_role,v_target_name from public.chat_room_members m join public.profiles p on p.id=m.user_id where m.room_id=p_room_id and m.user_id=p_user_id;
  if not found then raise exception 'group_member_not_found' using errcode='P0002'; end if;
  if v_target_role='owner' then raise exception 'cannot_change_owner_role' using errcode='42501'; end if;
  update public.chat_room_members set member_role=p_role where room_id=p_room_id and user_id=p_user_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,case when p_role='admin' then v_target_name||' administrator qilindi' else v_target_name||' oddiy a’zo qilindi' end,'system');
end; $$;

create or replace function public.transfer_group_ownership(p_room_id uuid,p_new_owner_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_name text; begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if p_new_owner_id=v_uid then return; end if;
  if not exists(select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner' and r.room_type='group' and r.is_active=true) then raise exception 'group_owner_required' using errcode='42501'; end if;
  if not exists(select 1 from public.chat_room_members m where m.room_id=p_room_id and m.user_id=p_new_owner_id) or not app_private.account_is_active(p_new_owner_id) then raise exception 'new_owner_must_be_active_member' using errcode='P0002'; end if;
  select coalesce(p.full_name,p.company_name,'A’zo') into v_name from public.profiles p where p.id=p_new_owner_id;
  update public.chat_room_members set member_role='admin' where room_id=p_room_id and user_id=v_uid;
  update public.chat_room_members set member_role='owner' where room_id=p_room_id and user_id=p_new_owner_id;
  update public.chat_rooms set created_by=p_new_owner_id,updated_at=now() where id=p_room_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,v_name||' guruh egasi qilindi','system');
end; $$;

create or replace function public.update_group_chat(p_room_id uuid,p_title text,p_description text default null::text)
returns public.chat_rooms language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_role text; v_room public.chat_rooms%rowtype; v_title text:=trim(coalesce(p_title,'')); v_description text:=nullif(trim(coalesce(p_description,'')),''); begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  if char_length(v_title)<3 or char_length(v_title)>100 then raise exception 'invalid_group_title' using errcode='22023'; end if;
  if v_description is not null and char_length(v_description)>500 then raise exception 'group_description_too_long' using errcode='22023'; end if;
  select m.member_role into v_role from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id where m.room_id=p_room_id and m.user_id=v_uid and r.room_type='group' and r.is_active=true;
  if v_role not in ('owner','admin') then raise exception 'group_admin_required' using errcode='42501'; end if;
  update public.chat_rooms set title=v_title,description=v_description,updated_at=now() where id=p_room_id and room_type='group' and is_active=true returning * into v_room;
  insert into public.chat_messages(room_id,sender_id,message,message_type) values(p_room_id,v_uid,'Guruh ma’lumotlari yangilandi','system');
  return v_room;
end; $$;

create or replace function public.list_group_members(p_room_id uuid)
returns table(user_id uuid,full_name text,company_name text,city text,avatar_url text,is_verified boolean,member_role text,joined_at timestamptz)
language sql security definer set search_path=''
as $$ select p.id,p.full_name,p.company_name,p.city,p.avatar_url,p.is_verified,m.member_role,m.joined_at from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id join public.profiles p on p.id=m.user_id where r.id=p_room_id and r.room_type='group' and r.is_active=true and app_private.account_is_active(auth.uid()) and exists(select 1 from public.chat_room_members me where me.room_id=r.id and me.user_id=auth.uid()) order by case m.member_role when 'owner' then 0 when 'admin' then 1 else 2 end,lower(coalesce(p.full_name,p.company_name,'')),m.joined_at; $$;

create or replace function public.list_messenger_conversations()
returns table(room_id uuid,room_type text,title text,slug text,counterpart_id uuid,counterpart_full_name text,counterpart_company_name text,counterpart_city text,counterpart_is_verified boolean,last_message text,last_message_type text,last_message_at timestamptz,last_sender_id uuid,unread_count bigint)
language sql security definer set search_path=''
as $$ with me as (select auth.uid() as uid), accessible as (select r.*,m.last_read_at,m.joined_at from public.chat_rooms r cross join me left join public.chat_room_members m on m.room_id=r.id and m.user_id=me.uid where me.uid is not null and app_private.account_is_active(me.uid) and r.is_active=true and (r.room_type='public' or m.user_id is not null)) select r.id,r.room_type,r.title,r.slug,cp.id,cp.full_name,cp.company_name,cp.city,cp.is_verified,lm.message,lm.message_type,lm.created_at,lm.sender_id,coalesce(uc.unread_count,0)::bigint from accessible r cross join me left join lateral (select p.id,p.full_name,p.company_name,p.city,p.is_verified from public.chat_room_members om join public.profiles p on p.id=om.user_id where r.room_type='direct' and om.room_id=r.id and om.user_id<>me.uid limit 1) cp on true left join lateral (select cm.message,cm.message_type,cm.created_at,cm.sender_id from public.chat_messages cm where cm.room_id=r.id and cm.deleted_at is null order by cm.created_at desc limit 1) lm on true left join lateral (select count(*) as unread_count from public.chat_messages cm where cm.room_id=r.id and cm.deleted_at is null and cm.sender_id<>me.uid and cm.created_at>coalesce(r.last_read_at,r.joined_at,now())) uc on true order by case when r.room_type='public' and r.slug='umumiy' then 0 else 1 end,coalesce(lm.created_at,r.updated_at,r.created_at) desc; $$;

create or replace function public.list_conversation_summaries()
returns table(deal_id uuid,last_message text,last_message_type text,last_message_at timestamptz,last_sender_id uuid,unread_count bigint)
language sql security definer set search_path=''
as $$ select d.id,lm.message,lm.message_type,lm.created_at,lm.sender_id,coalesce(uc.unread_count,0)::bigint from public.deals d left join lateral (select m.message,m.message_type,m.created_at,m.sender_id from public.messages m where m.deal_id=d.id order by m.created_at desc limit 1) lm on true left join lateral (select count(*) as unread_count from public.messages m where m.deal_id=d.id and m.sender_id<>auth.uid() and m.read_at is null) uc on true where app_private.account_is_active(auth.uid()) and (d.buyer_id=auth.uid() or d.seller_id=auth.uid()) order by coalesce(lm.created_at,d.updated_at,d.created_at) desc; $$;

create or replace function public.mark_deal_messages_read(p_deal_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$ declare v_uid uuid:=auth.uid(); v_count integer; begin if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if; if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if; if not exists(select 1 from public.deals d where d.id=p_deal_id and (d.buyer_id=v_uid or d.seller_id=v_uid)) then raise exception 'not_deal_participant' using errcode='42501'; end if; update public.messages set read_at=now() where deal_id=p_deal_id and sender_id<>v_uid and read_at is null; get diagnostics v_count=row_count; return v_count; end; $$;

create or replace function public.match_external_suppliers(p_supplier_type text,p_region text default null::text,p_city text default null::text,p_limit integer default 20)
returns table(id uuid,name text,supplier_type text,region text,city text,district text,status text,contact_verified boolean,source_type text,star_rating smallint,capacity integer,services text[])
language sql stable security definer set search_path=''
as $$ select s.id,s.name,s.supplier_type,s.region,s.city,s.district,s.status,s.contact_verified,s.source_type,s.star_rating,s.capacity,s.services from public.external_suppliers s where app_private.account_is_active(auth.uid()) and s.opt_out=false and s.status<>'inactive' and s.supplier_type=p_supplier_type and (p_region is null or lower(coalesce(s.region,''))=lower(p_region)) and (p_city is null or lower(coalesce(s.city,''))=lower(p_city)) order by case s.status when 'verified' then 0 when 'contact_verified' then 1 when 'registry' then 2 else 3 end,s.contact_verified desc,s.name limit greatest(1,least(coalesce(p_limit,20),100)); $$;
