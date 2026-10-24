create table if not exists public.outreach_email_suppressions (
  email text primary key,
  reason text not null,
  source text not null default 'manual',
  replacement_email text,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint outreach_email_suppressions_email_normalized check (email = lower(trim(email))),
  constraint outreach_email_suppressions_replacement_format check (replacement_email is null or replacement_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

alter table public.outreach_email_suppressions enable row level security;
revoke all on table public.outreach_email_suppressions from public, anon, authenticated;
grant select, insert, update, delete on table public.outreach_email_suppressions to service_role;

insert into public.outreach_email_suppressions(email,reason,source,replacement_email,metadata)
values
 ('uzb@dag-tour.uz','hard_bounce_550_address_not_found','gmail_dsn','uzb@dag-tour.ru','{"observed":"2026-10-23","replacement_source":"official_site"}'::jsonb),
 ('info@nikatravel.uz','hard_bounce_550_5_1_1','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('info@sss-tour.com','hard_bounce_550_no_such_recipient','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('info@uzland.org','hard_bounce_dns_domain_not_found','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('info@visituzbekistan.travel','hard_bounce_remote_server_misconfigured','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('info@picnictour.uz','hard_bounce_dns_domain_not_found','gmail_dsn','picnictouruz@gmail.com','{"observed":"2026-10-23","replacement_source":"official_site"}'::jsonb),
 ('info@bukhara-boodin.com','hard_bounce_dns_domain_not_found','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('malikjon_hause@bk.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('royal_hotel@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('fergana.azia@yandex.ru','hard_bounce_no_such_user','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('samani.buxara@gmail.com','hard_bounce_550_5_1_1','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('akmal-jalalov@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('omar_hayyam@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn','hotelomarkhayyam@gmail.com','{"observed":"2026-10-23","replacement_source":"official_site"}'::jsonb),
 ('azia-bukhara@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('nurlayt@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('tajmahal-fergana@mail.ru','hard_bounce_invalid_mailbox','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb),
 ('damirhotel.by.ayko@gmail.com','hard_bounce_550_5_1_1','gmail_dsn',null,'{"observed":"2026-10-23"}'::jsonb)
on conflict (email) do update set
  reason=excluded.reason,
  source=excluded.source,
  replacement_email=coalesce(excluded.replacement_email, public.outreach_email_suppressions.replacement_email),
  active=true,
  last_seen_at=now(),
  metadata=public.outreach_email_suppressions.metadata || excluded.metadata;

create or replace function app_private.outreach_email_recipient(p_email text)
returns text
language sql
stable
security invoker
set search_path=''
as $$
  with normalized as (
    select lower(trim(coalesce(p_email,''))) as email
  ), suppression as (
    select s.replacement_email
    from public.outreach_email_suppressions s, normalized n
    where s.email=n.email and s.active is true
    limit 1
  )
  select case
    when (select email from normalized) = '' then null
    when exists(select 1 from suppression) then nullif(lower(trim((select replacement_email from suppression))), '')
    else trim(p_email)
  end;
$$;

revoke all on function app_private.outreach_email_recipient(text) from public, anon, authenticated;
grant execute on function app_private.outreach_email_recipient(text) to service_role;

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
  v_email_recipient text;
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

  v_email_recipient := app_private.outreach_email_recipient(v_supplier.email);
  v_channel:=lower(trim(coalesce(p_channel,'auto')));
  if v_channel='auto' then
    if app_private.first_uz_phone(v_supplier.phone) is not null then v_channel:='sms';
    elsif v_email_recipient is not null then v_channel:='email';
    elsif nullif(trim(coalesce(v_supplier.telegram,'')),'') is not null then v_channel:='telegram';
    else v_channel:='manual'; end if;
  end if;
  if v_channel not in ('sms','telegram','email','whatsapp','manual') then raise exception 'invalid_channel' using errcode='22023'; end if;

  v_recipient:=case
    when v_channel='email' then v_email_recipient
    when v_channel in ('sms','whatsapp') then app_private.first_uz_phone(v_supplier.phone)
    when v_channel='telegram' then nullif(trim(coalesce(v_supplier.telegram,'')),'')
    else null
  end;

  if v_channel='email' and nullif(trim(coalesce(v_supplier.email,'')),'') is not null and v_recipient is null then
    raise exception 'supplier_email_suppressed' using errcode='22023';
  end if;
  if v_channel<>'manual' and v_recipient is null then raise exception 'supplier_contact_missing' using errcode='22023'; end if;

  if not exists(select 1 from public.supplier_invites i where i.request_id=p_request_id and i.supplier_id=p_supplier_id)
    and (select count(*) from public.supplier_invites i where i.request_id=p_request_id and i.created_by=v_uid)>=30 then
    raise exception 'invite_limit_reached' using errcode='22023';
  end if;

  v_token:=pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  v_token_hash:=pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');
  v_preview:='Agent Bifavia: '||coalesce(v_request.category,'So‘rov')||case when v_request.destination is not null then ' · '||v_request.destination else '' end||case when v_request.travel_date is not null then ' · '||v_request.travel_date::text else '' end;

  select * into v_existing from public.supplier_invites i where i.request_id=p_request_id and i.supplier_id=p_supplier_id order by i.created_at desc limit 1 for update;
  if found and v_existing.status='responded' then raise exception 'invite_already_responded' using errcode='23505'; end if;
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

  v_recipient_hint:=case when v_channel='email' and v_recipient is not null then left(v_recipient,1)||'***@'||split_part(v_recipient,'@',2) when v_channel in ('sms','whatsapp') and v_recipient is not null then '***'||right(v_recipient,4) when v_channel='telegram' and v_recipient is not null then left(v_recipient,2)||'***' else 'Qo‘lda ulashish' end;
  return jsonb_build_object('invite_id',v_invite_id,'token',v_token,'supplier_name',v_supplier.name,'channel',v_channel,'recipient_hint',v_recipient_hint,'status','queued','expires_at',v_expires_at);
end;
$$;

revoke all on function public.create_supplier_invite(uuid,uuid,text) from public, anon;
grant execute on function public.create_supplier_invite(uuid,uuid,text) to authenticated, service_role;
