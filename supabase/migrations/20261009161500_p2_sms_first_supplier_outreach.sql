create or replace function public.create_supplier_invite(p_request_id uuid, p_supplier_id uuid, p_channel text default 'auto'::text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.requests%rowtype;
  v_supplier public.external_suppliers%rowtype;
  v_is_admin boolean := false;
  v_channel text;
  v_recipient text;
  v_recipient_hint text;
  v_token text;
  v_token_hash text;
  v_invite_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
  v_existing public.supplier_invites%rowtype;
  v_preview text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not app_private.account_is_active(v_uid) then raise exception 'account_inactive_or_incomplete' using errcode='42501'; end if;

  select exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and p.is_active is true and p.registration_status='active') into v_is_admin;
  select * into v_request from public.requests r where r.id=p_request_id;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  if v_request.created_by<>v_uid and not v_is_admin then raise exception 'not_request_owner' using errcode='42501'; end if;
  if v_request.status<>'open' or not public.request_is_current(v_request.travel_date,v_request.created_at) then raise exception 'request_expired' using errcode='22023'; end if;

  select * into v_supplier from public.external_suppliers s where s.id=p_supplier_id;
  if not found then raise exception 'supplier_not_found' using errcode='P0002'; end if;
  if v_supplier.opt_out or v_supplier.status='inactive' then raise exception 'supplier_unavailable' using errcode='42501'; end if;

  v_channel:=lower(trim(coalesce(p_channel,'auto')));
  if v_channel='auto' then
    if nullif(trim(coalesce(v_supplier.phone,'')),'') is not null then v_channel:='sms';
    elsif nullif(trim(coalesce(v_supplier.email,'')),'') is not null then v_channel:='email';
    else v_channel:='manual'; end if;
  end if;
  if v_channel not in ('sms','telegram','email','whatsapp','manual') then raise exception 'invalid_channel' using errcode='22023'; end if;

  v_recipient:=case when v_channel='email' then nullif(trim(coalesce(v_supplier.email,'')),'') when v_channel in ('sms','whatsapp') then nullif(trim(coalesce(v_supplier.phone,'')),'') when v_channel='telegram' then nullif(trim(coalesce(v_supplier.telegram,'')),'') else null end;
  if v_channel<>'manual' and v_recipient is null then raise exception 'supplier_contact_missing' using errcode='22023'; end if;

  if not exists(select 1 from public.supplier_invites i where i.request_id=p_request_id and i.supplier_id=p_supplier_id)
    and (select count(*) from public.supplier_invites i where i.request_id=p_request_id and i.created_by=v_uid)>=30 then
    raise exception 'invite_limit_reached' using errcode='22023';
  end if;

  v_token:=pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  v_token_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');
  v_preview:='Agent Bifavia: '||coalesce(v_request.category,'So‘rov')||case when v_request.destination is not null then ' · '||v_request.destination else '' end||case when v_request.travel_date is not null then ' · '||v_request.travel_date::text else '' end;

  select * into v_existing from public.supplier_invites i where i.request_id=p_request_id and i.supplier_id=p_supplier_id order by i.created_at desc limit 1 for update;
  if found and v_existing.status='responded' then
    raise exception 'invite_already_responded' using errcode='23505';
  end if;
  if found and v_existing.status in ('sent','opened') and v_existing.sent_at is not null and v_existing.sent_at > now() - interval '30 seconds' then
    raise exception 'invite_recently_sent' using errcode='23505';
  end if;

  if found then
    update public.supplier_invites set channel=v_channel,recipient=v_recipient,token_hash=v_token_hash,status='queued',message_preview=v_preview,provider_message_id=null,failure_reason=null,sent_at=null,opened_at=null,responded_at=null,expires_at=v_expires_at,response='{}'::jsonb,updated_at=now()
    where id=v_existing.id returning id into v_invite_id;
  else
    insert into public.supplier_invites(request_id,supplier_id,created_by,channel,recipient,token_hash,status,message_preview,expires_at)
    values(p_request_id,p_supplier_id,v_uid,v_channel,v_recipient,v_token_hash,'queued',v_preview,v_expires_at) returning id into v_invite_id;
  end if;

  v_recipient_hint:=case when v_channel='email' and v_recipient is not null then left(v_recipient,1)||'***@'||split_part(v_recipient,'@',2) when v_channel in ('sms','whatsapp') and v_recipient is not null then '***'||right(regexp_replace(v_recipient,'\D','','g'),4) when v_channel='telegram' and v_recipient is not null then left(v_recipient,2)||'***' else 'Qo‘lda ulashish' end;
  return jsonb_build_object('invite_id',v_invite_id,'token',v_token,'supplier_name',v_supplier.name,'channel',v_channel,'recipient_hint',v_recipient_hint,'status','queued','expires_at',v_expires_at);
end;
$$;

revoke all on function public.create_supplier_invite(uuid,uuid,text) from public, anon;
grant execute on function public.create_supplier_invite(uuid,uuid,text) to authenticated, service_role;
