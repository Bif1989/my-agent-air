-- Reliability fixes from the 2026-10-03 audit. Existing data is retained.
create or replace function public.request_is_current(p_travel_date date, p_created_at timestamptz)
returns boolean language sql stable security invoker set search_path = ''
as $$ select case when p_travel_date is not null then p_travel_date >= (now() at time zone 'Asia/Tashkent')::date else coalesce(p_created_at >= now() - interval '30 days',false) end $$;
revoke all on function public.request_is_current(date,timestamptz) from public, anon;
grant execute on function public.request_is_current(date,timestamptz) to authenticated, service_role;

create or replace function public.enforce_active_actor()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    if current_user in ('postgres','supabase_admin','service_role') then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or not coalesce(v_profile.is_active,false) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and tg_table_name in ('requests','offers') and
    (nullif(trim(v_profile.full_name),'') is null or nullif(trim(v_profile.company_name),'') is null or nullif(trim(v_profile.phone),'') is null
      or nullif(trim(v_profile.city),'') is null or nullif(trim(v_profile.agent_type),'') is null or v_profile.agent_type = 'agent') then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    if tg_table_name in ('messages','chat_messages') and current_user in ('authenticated','anon') then
      if new.message_type = 'system' then raise exception 'system_message_forbidden' using errcode = '42501'; end if;
    end if;
    if tg_table_name = 'requests' then
      if tg_op = 'INSERT' then new.created_at := now(); end if;
      if new.status = 'open' then
        if not public.request_is_current(new.travel_date,new.created_at) then
          raise exception 'request_expired' using errcode = '22023';
        end if;
      end if;
    end if;
    if tg_table_name = 'offers' then
      if new.status = 'pending' then
        if not exists (select 1 from public.requests r where r.id=new.request_id and r.status='open' and public.request_is_current(r.travel_date,r.created_at)) then
          raise exception 'request_expired' using errcode = '22023';
        end if;
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.enforce_active_actor() from public, anon, authenticated;

drop trigger if exists require_active_actor on public.requests;
create trigger require_active_actor before insert or update or delete on public.requests for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.offers;
create trigger require_active_actor before insert or update or delete on public.offers for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.messages;
create trigger require_active_actor before insert or update or delete on public.messages for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.chat_messages;
create trigger require_active_actor before insert or update or delete on public.chat_messages for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.posts;
create trigger require_active_actor before insert or update or delete on public.posts for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.post_comments;
create trigger require_active_actor before insert or update or delete on public.post_comments for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.post_reactions;
create trigger require_active_actor before insert or update or delete on public.post_reactions for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.chat_rooms;
create trigger require_active_actor before insert or update or delete on public.chat_rooms for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.chat_room_members;
create trigger require_active_actor before insert or update or delete on public.chat_room_members for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.activity_log;
create trigger require_active_actor before insert or update or delete on public.activity_log for each row execute function public.enforce_active_actor();

drop trigger if exists require_active_actor on public.verification_requests;
create trigger require_active_actor before insert or update or delete on public.verification_requests for each row execute function public.enforce_active_actor();

alter table public.offers add constraint offers_valid_money check (price is null or (price>=0 and price::text not in ('NaN','Infinity','-Infinity')));
alter table public.offers add constraint offers_valid_currency check (currency is null or currency in ('USD','UZS','EUR','RUB'));
alter table public.requests add constraint requests_valid_budget check (budget is null or (budget>=0 and budget::text not in ('NaN','Infinity','-Infinity')));
alter table public.requests add constraint requests_valid_currency check (currency is null or currency in ('USD','UZS','EUR','RUB'));
create index if not exists chat_rooms_created_by_idx on public.chat_rooms(created_by);
create index if not exists requests_status_created_at_idx on public.requests(status,created_at desc);
create index if not exists chat_messages_room_cursor_idx on public.chat_messages(room_id,created_at desc,id desc);

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_request public.requests%rowtype;
  v_deal_id uuid;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;


  if not exists (select 1 from public.profiles where id = v_uid and coalesce(is_active, false)) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;

  select request_id into v_request_id from public.offers where id = p_offer_id;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0002';
  end if;
  -- Lock the request before any offer to serialize competing acceptances.
  select * into v_request from public.requests where id = v_request_id for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  select * into v_offer from public.offers where id = p_offer_id and request_id = v_request_id for update;
  if not found then raise exception 'offer_not_found' using errcode = 'P0002'; end if;

  if v_request.created_by <> v_uid then
    raise exception 'not_request_owner' using errcode = '42501';
  end if;

  if v_request.status = 'accepted' then
    select id into v_deal_id from public.deals where offer_id = p_offer_id and buyer_id = v_uid;
    if found then return v_deal_id; end if;
  end if;

  if not public.request_is_current(v_request.travel_date, v_request.created_at) then
    raise exception 'request_expired' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = v_offer.agent_id and coalesce(is_active, false)) then
    raise exception 'counterpart_inactive' using errcode = '42501';
  end if;

  if v_request.status <> 'open' then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;

  if v_offer.agent_id = v_uid then
    raise exception 'cannot_accept_own_offer' using errcode = 'P0001';
  end if;

  if v_offer.price is null or v_offer.price < 0 or v_offer.price::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'offer_price_required' using errcode = 'P0001';
  end if;

  update public.offers
     set status = case when id = p_offer_id then 'accepted' else 'rejected' end
   where request_id = v_request.id
     and status = 'pending';

  update public.requests
     set status = 'accepted'
   where id = v_request.id;

  insert into public.deals (
    request_id,
    offer_id,
    buyer_id,
    seller_id,
    agreed_price,
    currency,
    status
  ) values (
    v_request.id,
    v_offer.id,
    v_request.created_by,
    v_offer.agent_id,
    v_offer.price,
    coalesce(v_offer.currency, 'USD'),
    'accepted'
  )
  returning id into v_deal_id;

  insert into public.activity_log (deal_id, request_id, actor_id, event_type, event_data)
  values (
    v_deal_id,
    v_request.id,
    v_uid,
    'offer_accepted',
    jsonb_build_object('offer_id', v_offer.id, 'seller_id', v_offer.agent_id, 'price', v_offer.price, 'currency', coalesce(v_offer.currency, 'USD'))
  );

  return v_deal_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_deal_status(p_deal_id uuid, p_status text)
 RETURNS deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_old_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;


  if not exists (select 1 from public.profiles where id = v_uid and coalesce(is_active, false)) then
    raise exception 'account_inactive' using errcode = '42501';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'deal_not_found' using errcode = 'P0002';
  end if;

  if v_uid <> v_deal.buyer_id and v_uid <> v_deal.seller_id then
    raise exception 'not_deal_participant' using errcode = '42501';
  end if;

  if p_status not in ('processing','issued','completed','cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  if v_deal.status = p_status then return v_deal; end if;
  v_old_status := v_deal.status;

  if not (
    (v_old_status = 'accepted' and p_status in ('processing','cancelled')) or
    (v_old_status = 'processing' and p_status in ('issued','cancelled')) or
    (v_old_status = 'issued' and p_status = 'completed')
  ) then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  update public.deals
  set status = p_status
  where id = p_deal_id
  returning * into v_deal;

  insert into public.activity_log (deal_id, request_id, actor_id, event_type, event_data)
  values (
    v_deal.id,
    v_deal.request_id,
    v_uid,
    'deal_status_changed',
    jsonb_build_object('from', v_old_status, 'to', p_status, 'status', p_status)
  );

  return v_deal;
end;
$function$
;

revoke all on function public.accept_offer(uuid), public.update_deal_status(uuid,text) from public, anon;
grant execute on function public.accept_offer(uuid), public.update_deal_status(uuid,text) to authenticated;
revoke execute on function public.notify_push_event() from public, anon, authenticated;

-- Filter choices are aggregated in the database without downloading every profile.
create or replace function public.list_agent_filter_options()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cities', coalesce((select jsonb_agg(v order by v) from (select distinct city as v from public.profiles where is_active is true and nullif(trim(city), '') is not null) c), '[]'::jsonb),
    'agentTypes', coalesce((select jsonb_agg(v order by v) from (select distinct agent_type as v from public.profiles where is_active is true and nullif(trim(agent_type), '') is not null) t), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(v order by v) from (select distinct unnest(services) as v from public.profiles where is_active is true) s where nullif(trim(v), '') is not null), '[]'::jsonb)
  );
$$;
revoke all on function public.list_agent_filter_options() from public, anon;
grant execute on function public.list_agent_filter_options() to authenticated, service_role;
