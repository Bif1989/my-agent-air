create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_offer public.offers%rowtype; v_request public.requests%rowtype; v_deal_id uuid; v_request_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select request_id into v_request_id from public.offers where id=p_offer_id; if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  select * into v_request from public.requests where id=v_request_id for update; if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  select * into v_offer from public.offers where id=p_offer_id and request_id=v_request_id for update; if not found then raise exception 'offer_not_found' using errcode='P0002'; end if;
  if v_request.created_by<>v_uid then raise exception 'not_request_owner' using errcode='42501'; end if;
  if v_request.status='accepted' then select id into v_deal_id from public.deals where offer_id=p_offer_id and buyer_id=v_uid; if found then return v_deal_id; end if; end if;
  if not public.request_is_current(v_request.travel_date,v_request.created_at) then raise exception 'request_expired' using errcode='22023'; end if;
  if not app_private.account_is_active(v_offer.agent_id) then raise exception 'counterpart_inactive_or_incomplete' using errcode='42501'; end if;
  if v_request.status<>'open' then raise exception 'request_not_open' using errcode='P0001'; end if;
  if v_offer.status<>'pending' then raise exception 'offer_not_pending' using errcode='P0001'; end if;
  if v_offer.agent_id=v_uid then raise exception 'cannot_accept_own_offer' using errcode='P0001'; end if;
  if v_offer.price is null or v_offer.price<0 or v_offer.price::text in ('NaN','Infinity','-Infinity') then raise exception 'offer_price_required' using errcode='P0001'; end if;
  update public.offers set status=case when id=p_offer_id then 'accepted' else 'rejected' end where request_id=v_request.id and status='pending';
  update public.requests set status='accepted' where id=v_request.id;
  insert into public.deals(request_id,offer_id,buyer_id,seller_id,agreed_price,currency,status) values(v_request.id,v_offer.id,v_request.created_by,v_offer.agent_id,v_offer.price,coalesce(v_offer.currency,'USD'),'accepted') returning id into v_deal_id;
  insert into public.activity_log(deal_id,request_id,actor_id,event_type,event_data) values(v_deal_id,v_request.id,v_uid,'offer_accepted',jsonb_build_object('offer_id',v_offer.id,'seller_id',v_offer.agent_id,'price',v_offer.price,'currency',coalesce(v_offer.currency,'USD')));
  return v_deal_id;
end; $$;

create or replace function public.update_deal_status(p_deal_id uuid,p_status text)
returns public.deals language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_deal public.deals%rowtype; v_old_status text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;
  select * into v_deal from public.deals where id=p_deal_id for update; if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
  if v_uid<>v_deal.buyer_id and v_uid<>v_deal.seller_id then raise exception 'not_deal_participant' using errcode='42501'; end if;
  if p_status not in ('processing','issued','completed','cancelled') then raise exception 'invalid_status' using errcode='22023'; end if;
  if v_deal.status=p_status then return v_deal; end if; v_old_status:=v_deal.status;
  if not ((v_old_status='accepted' and p_status in ('processing','cancelled')) or (v_old_status='processing' and p_status in ('issued','cancelled')) or (v_old_status='issued' and p_status='completed')) then raise exception 'invalid_status_transition' using errcode='P0001'; end if;
  update public.deals set status=p_status where id=p_deal_id returning * into v_deal;
  insert into public.activity_log(deal_id,request_id,actor_id,event_type,event_data) values(v_deal.id,v_deal.request_id,v_uid,'deal_status_changed',jsonb_build_object('from',v_old_status,'to',p_status,'status',p_status));
  return v_deal;
end; $$;

create or replace function public.get_supplier_invite_public(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_invite public.supplier_invites%rowtype; v_request public.requests%rowtype; v_supplier public.external_suppliers%rowtype; v_company text; v_token text:=trim(coalesce(p_token,''));
begin
  if v_token !~ '^[0-9A-Fa-f]{48}$' then raise exception 'invalid_token' using errcode='22023'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');
  select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1; if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;
  if v_invite.expires_at<=now() or v_invite.status in ('cancelled','expired','opted_out') then if v_invite.status not in ('opted_out','cancelled') then update public.supplier_invites set status='expired' where id=v_invite.id; end if; raise exception 'invite_expired' using errcode='22023'; end if;
  select * into v_request from public.requests where id=v_invite.request_id; select * into v_supplier from public.external_suppliers where id=v_invite.supplier_id; select company_name into v_company from public.profiles where id=v_request.created_by;
  if v_invite.status in ('queued','sent') then update public.supplier_invites set status='opened',opened_at=coalesce(opened_at,now()) where id=v_invite.id; elsif v_invite.opened_at is null then update public.supplier_invites set opened_at=now() where id=v_invite.id; end if;
  return jsonb_build_object('invite_id',v_invite.id,'supplier_name',v_supplier.name,'request_category',v_request.category,'destination',v_request.destination,'travel_date',v_request.travel_date,'adults',v_request.adults,'children',v_request.children,'infants',v_request.infants,'budget',v_request.budget,'currency',v_request.currency,'description',v_request.description,'service_details',v_request.service_details,'requester_company',v_company,'expires_at',v_invite.expires_at,'status',case when v_invite.status='responded' then 'responded' else 'opened' end);
end; $$;

create or replace function public.submit_supplier_invite_response(p_token text,p_available boolean,p_price numeric default null::numeric,p_currency text default 'UZS'::text,p_comment text default null::text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_invite public.supplier_invites%rowtype; v_token text:=trim(coalesce(p_token,''));
begin
  if v_token !~ '^[0-9A-Fa-f]{48}$' then raise exception 'invalid_token' using errcode='22023'; end if;
  if p_currency not in ('UZS','USD','EUR','RUB') then raise exception 'invalid_currency' using errcode='22023'; end if;
  if coalesce(p_available,false) and (p_price is null or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity')) then raise exception 'price_required' using errcode='22023'; end if;
  if length(coalesce(p_comment,''))>1000 then raise exception 'comment_too_long' using errcode='22023'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'); select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1 for update; if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;
  if v_invite.expires_at<=now() or v_invite.status in ('cancelled','expired','opted_out') then raise exception 'invite_expired' using errcode='22023'; end if;
  if v_invite.status='responded' then return jsonb_build_object('ok',true,'invite_id',v_invite.id,'already_responded',true); end if;
  update public.supplier_invites set status='responded',responded_at=now(),response=jsonb_build_object('available',coalesce(p_available,false),'price',p_price,'currency',p_currency,'comment',nullif(trim(coalesce(p_comment,'')),''),'submitted_at',now()) where id=v_invite.id;
  return jsonb_build_object('ok',true,'invite_id',v_invite.id,'already_responded',false);
end; $$;

create or replace function public.opt_out_supplier_invite(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_invite public.supplier_invites%rowtype; v_token text:=trim(coalesce(p_token,''));
begin
  if v_token !~ '^[0-9A-Fa-f]{48}$' then raise exception 'invalid_token' using errcode='22023'; end if;
  v_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'); select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1 for update; if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;
  if v_invite.expires_at<=now() or v_invite.status in ('cancelled','expired') then raise exception 'invite_expired' using errcode='22023'; end if;
  if v_invite.status='opted_out' then return jsonb_build_object('ok',true,'already_opted_out',true); end if;
  update public.external_suppliers set opt_out=true,opt_out_at=coalesce(opt_out_at,now()) where id=v_invite.supplier_id;
  update public.supplier_invites set status='opted_out' where supplier_id=v_invite.supplier_id and status in ('queued','sent','opened');
  return jsonb_build_object('ok',true,'already_opted_out',false);
end; $$;

revoke execute on function public.get_supplier_invite_public(text) from authenticated, public;
revoke execute on function public.opt_out_supplier_invite(text) from authenticated, public;
revoke execute on function public.submit_supplier_invite_response(text,boolean,numeric,text,text) from authenticated, public;
grant execute on function public.get_supplier_invite_public(text) to anon;
grant execute on function public.opt_out_supplier_invite(text) to anon;
grant execute on function public.submit_supplier_invite_response(text,boolean,numeric,text,text) to anon;
