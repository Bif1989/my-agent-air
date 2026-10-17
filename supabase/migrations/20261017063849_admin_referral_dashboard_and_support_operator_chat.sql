create table if not exists app_private.support_threads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  room_id uuid not null unique references public.chat_rooms(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists support_threads_admin_status_updated_idx
  on app_private.support_threads(admin_id,status,updated_at desc);

alter table app_private.support_threads enable row level security;
revoke all on table app_private.support_threads from public, anon, authenticated;
grant all on table app_private.support_threads to service_role;

create or replace function public.get_support_contact()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin record;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select p.id,p.full_name,p.company_name,p.phone,u.email into v_admin
  from public.profiles p left join auth.users u on u.id=p.id
  where p.role='admin' and p.is_active is true and p.registration_status='active'
  order by p.created_at asc nulls last,p.id limit 1;
  if v_admin.id is null then return jsonb_build_object('ok',false,'reason','support_unavailable'); end if;
  return jsonb_build_object('ok',true,'admin_id',v_admin.id,'full_name',v_admin.full_name,'company_name',v_admin.company_name,'phone',v_admin.phone,'email',v_admin.email);
end;
$function$;
revoke all on function public.get_support_contact() from public,anon;
grant execute on function public.get_support_contact() to authenticated,service_role;

create or replace function public.get_or_create_support_chat()
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid(); v_admin_id uuid; v_key text; v_room_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select p.id into v_admin_id from public.profiles p
  where p.role='admin' and p.is_active is true and p.registration_status='active'
  order by p.created_at asc nulls last,p.id limit 1;
  if v_admin_id is null then raise exception 'support_unavailable' using errcode='P0002'; end if;
  if v_admin_id=v_uid then raise exception 'admin_support_self_chat_not_allowed' using errcode='22023'; end if;
  v_key:=least(v_uid::text,v_admin_id::text)||':'||greatest(v_uid::text,v_admin_id::text);
  insert into public.chat_rooms(room_type,direct_key,created_by,is_active)
  values('direct',v_key,v_uid,true)
  on conflict(direct_key) do update set is_active=true,updated_at=now()
  returning id into v_room_id;
  insert into public.chat_room_members(room_id,user_id,member_role)
  values(v_room_id,v_uid,'member'),(v_room_id,v_admin_id,'admin')
  on conflict(room_id,user_id) do update set member_role=excluded.member_role;
  insert into app_private.support_threads(user_id,admin_id,room_id,status,created_at,updated_at,closed_at)
  values(v_uid,v_admin_id,v_room_id,'open',now(),now(),null)
  on conflict(user_id) do update set admin_id=excluded.admin_id,room_id=excluded.room_id,status='open',updated_at=now(),closed_at=null;
  return v_room_id;
end;
$function$;
revoke all on function public.get_or_create_support_chat() from public,anon;
grant execute on function public.get_or_create_support_chat() to authenticated,service_role;

create or replace function public.admin_list_support_threads()
returns table(user_id uuid,room_id uuid,status text,full_name text,company_name text,phone text,email text,agent_type text,is_verified boolean,created_at timestamptz,updated_at timestamptz,last_message text,last_message_at timestamptz,unread_count bigint)
language sql stable security definer set search_path to ''
as $function$
  with me as materialized (select auth.uid() uid),
  guard as materialized (select uid from me where uid is not null and app_private.account_is_admin(uid)),
  base as materialized (
    select st.user_id,st.room_id,st.status,st.created_at,st.updated_at,p.full_name,p.company_name,p.phone,u.email,p.agent_type,p.is_verified,m.last_read_at,m.joined_at
    from app_private.support_threads st join guard g on g.uid=st.admin_id
    join public.profiles p on p.id=st.user_id left join auth.users u on u.id=st.user_id
    left join public.chat_room_members m on m.room_id=st.room_id and m.user_id=g.uid
  )
  select b.user_id,b.room_id,b.status,b.full_name,b.company_name,b.phone,b.email,b.agent_type,b.is_verified,b.created_at,b.updated_at,
         lm.message,lm.created_at,
         coalesce((select count(*) from public.chat_messages cm where cm.room_id=b.room_id and cm.deleted_at is null and cm.sender_id=b.user_id and cm.created_at>coalesce(b.last_read_at,b.joined_at,b.created_at)),0)::bigint
  from base b
  left join lateral (select cm.message,cm.created_at from public.chat_messages cm where cm.room_id=b.room_id and cm.deleted_at is null order by cm.created_at desc,cm.id desc limit 1) lm on true
  order by coalesce(lm.created_at,b.updated_at,b.created_at) desc;
$function$;
revoke all on function public.admin_list_support_threads() from public,anon;
grant execute on function public.admin_list_support_threads() to authenticated,service_role;

create or replace function public.admin_set_support_thread_status(p_user_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_row app_private.support_threads%rowtype;
begin
  if v_uid is null or not app_private.account_is_admin(v_uid) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_status not in ('open','closed') then raise exception 'invalid_status' using errcode='22023'; end if;
  update app_private.support_threads set status=p_status,updated_at=now(),closed_at=case when p_status='closed' then now() else null end
  where user_id=p_user_id and admin_id=v_uid returning * into v_row;
  if not found then return jsonb_build_object('ok',false,'reason','thread_not_found'); end if;
  return jsonb_build_object('ok',true,'status',v_row.status,'room_id',v_row.room_id);
end;
$function$;
revoke all on function public.admin_set_support_thread_status(uuid,text) from public,anon;
grant execute on function public.admin_set_support_thread_status(uuid,text) to authenticated,service_role;

create or replace function public.admin_get_referral_dashboard()
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_overview jsonb; v_referrers jsonb; v_referrals jsonb; v_rewards jsonb;
begin
  if v_uid is null or not app_private.account_is_admin(v_uid) then raise exception 'admin_required' using errcode='42501'; end if;
  select jsonb_build_object('total_referrals',count(*)::bigint,'qualified_referrals',count(*) filter(where status='qualified')::bigint,'pending_referrals',count(*) filter(where status='pending')::bigint,'rejected_referrals',count(*) filter(where status='rejected')::bigint,'total_bonus',coalesce((select sum(amount)::bigint from app_private.referral_rewards),0)) into v_overview from app_private.referrals;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.total_bonus desc,x.direct_count desc,x.full_name),'[]'::jsonb) into v_referrers from (
    select p.id as user_id,p.full_name,p.company_name,p.phone,p.agent_type,p.is_verified,
      count(r.referred_user_id)::bigint direct_count,count(r.referred_user_id) filter(where r.status='qualified')::bigint qualified_count,count(r.referred_user_id) filter(where r.status='pending')::bigint pending_count,count(r.referred_user_id) filter(where r.status='rejected')::bigint rejected_count,
      coalesce(rb.level1_count,0)::bigint level1_count,coalesce(rb.level2_count,0)::bigint level2_count,coalesce(rb.level3_count,0)::bigint level3_count,coalesce(rb.total_bonus,0)::bigint total_bonus,max(r.created_at) last_referral_at
    from public.profiles p left join app_private.referrals r on r.referrer_user_id=p.id
    left join lateral (select count(*) filter(where rr.level=1)::bigint level1_count,count(*) filter(where rr.level=2)::bigint level2_count,count(*) filter(where rr.level=3)::bigint level3_count,coalesce(sum(rr.amount),0)::bigint total_bonus from app_private.referral_rewards rr where rr.beneficiary_user_id=p.id) rb on true
    where p.role='agent'
    group by p.id,p.full_name,p.company_name,p.phone,p.agent_type,p.is_verified,rb.level1_count,rb.level2_count,rb.level3_count,rb.total_bonus
    having count(r.referred_user_id)>0 or coalesce(rb.total_bonus,0)>0
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_referrals from (
    select r.referred_user_id,r.referrer_user_id,r.status,r.created_at,r.qualified_at,rp.full_name referrer_name,rp.company_name referrer_company,tp.full_name referred_name,tp.company_name referred_company,tp.phone referred_phone,tp.agent_type referred_agent_type,tp.is_verified referred_is_verified,
      coalesce((select sum(rr.amount) from app_private.referral_rewards rr where rr.referred_user_id=r.referred_user_id),0)::bigint generated_bonus
    from app_private.referrals r join public.profiles rp on rp.id=r.referrer_user_id join public.profiles tp on tp.id=r.referred_user_id order by r.created_at desc limit 300
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_rewards from (
    select rr.id,rr.referred_user_id,rr.beneficiary_user_id,rr.level,rr.amount,rr.created_at,bp.full_name beneficiary_name,bp.company_name beneficiary_company,rp.full_name referred_name,rp.company_name referred_company
    from app_private.referral_rewards rr join public.profiles bp on bp.id=rr.beneficiary_user_id join public.profiles rp on rp.id=rr.referred_user_id order by rr.created_at desc limit 500
  ) x;
  return jsonb_build_object('ok',true,'overview',v_overview,'referrers',v_referrers,'referrals',v_referrals,'rewards',v_rewards);
end;
$function$;
revoke all on function public.admin_get_referral_dashboard() from public,anon;
grant execute on function public.admin_get_referral_dashboard() to authenticated,service_role;
