create or replace function public.match_suppliers_for_request(
  p_request_id uuid,
  p_supplier_type text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  name text,
  supplier_type text,
  region text,
  city text,
  district text,
  status text,
  contact_verified boolean,
  source_type text,
  source_name text,
  star_rating smallint,
  capacity integer,
  services text[],
  has_phone boolean,
  has_email boolean,
  match_score integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.requests%rowtype;
  v_type text;
  v_destination text;
  v_requested_stars integer;
  v_pax integer;
  v_is_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'admin' and coalesce(p.is_active,false)
  ) into v_is_admin;

  select * into v_request from public.requests where public.requests.id = p_request_id;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.created_by <> v_uid and not v_is_admin then
    raise exception 'not_request_owner' using errcode = '42501';
  end if;

  v_type := lower(trim(coalesce(
    p_supplier_type,
    case v_request.category
      when 'Mehmonxona' then 'hotel'
      when 'Gid' then 'guide'
      when 'Transfer' then 'transport'
      else ''
    end
  )));

  if v_type not in ('hotel','guide','transport','restaurant') then
    raise exception 'supplier_type_required' using errcode = '22023';
  end if;

  v_destination := nullif(trim(v_request.destination), '');
  v_pax := greatest(0, coalesce(v_request.adults,0) + coalesce(v_request.children,0) + coalesce(v_request.infants,0));
  if v_type = 'hotel'
     and coalesce(v_request.service_details->>'hotel_stars','') ~ '^[1-5]$' then
    v_requested_stars := (v_request.service_details->>'hotel_stars')::integer;
  else
    v_requested_stars := null;
  end if;

  return query
  select
    s.id,
    s.name,
    s.supplier_type,
    s.region,
    s.city,
    s.district,
    s.status,
    s.contact_verified,
    s.source_type,
    s.source_name,
    s.star_rating,
    s.capacity,
    s.services,
    (s.phone is not null and trim(s.phone) <> '') as has_phone,
    (s.email is not null and trim(s.email) <> '') as has_email,
    (
      case s.status
        when 'verified' then 50
        when 'contact_verified' then 40
        when 'registry' then 30
        when 'public_contact' then 20
        else 0
      end
      + case when s.contact_verified then 12 else 0 end
      + case when s.phone is not null and trim(s.phone) <> '' then 8 else 0 end
      + case when s.email is not null and trim(s.email) <> '' then 6 else 0 end
      + case
          when v_destination is not null and s.city is not null
            and lower(trim(s.city)) = lower(v_destination) then 25
          when v_destination is not null and s.city is not null and length(trim(s.city)) > 1
            and position(lower(trim(s.city)) in lower(v_destination)) > 0 then 20
          when v_destination is not null and s.region is not null and length(trim(s.region)) > 1
            and position(lower(trim(s.region)) in lower(v_destination)) > 0 then 14
          when v_destination is not null and s.district is not null and length(trim(s.district)) > 1
            and position(lower(trim(s.district)) in lower(v_destination)) > 0 then 10
          else 0
        end
      + case when v_requested_stars is not null and s.star_rating = v_requested_stars then 10 else 0 end
      + case when v_pax > 0 and s.capacity is not null and s.capacity >= v_pax then 5 else 0 end
    )::integer as match_score
  from public.external_suppliers s
  where s.opt_out = false
    and s.status <> 'inactive'
    and s.supplier_type = v_type
    and (
      v_destination is null
      or (s.city is not null and (
        lower(trim(s.city)) = lower(v_destination)
        or (length(trim(s.city)) > 1 and position(lower(trim(s.city)) in lower(v_destination)) > 0)
      ))
      or (s.region is not null and length(trim(s.region)) > 1 and position(lower(trim(s.region)) in lower(v_destination)) > 0)
      or (s.district is not null and length(trim(s.district)) > 1 and position(lower(trim(s.district)) in lower(v_destination)) > 0)
    )
    and (v_requested_stars is null or s.star_rating is null or s.star_rating = v_requested_stars)
    and (v_pax = 0 or s.capacity is null or s.capacity >= v_pax)
  order by match_score desc, s.name
  limit greatest(1, least(coalesce(p_limit,20),100));
end;
$$;

revoke all on function public.match_suppliers_for_request(uuid,text,integer) from public, anon;
grant execute on function public.match_suppliers_for_request(uuid,text,integer) to authenticated, service_role;

create or replace function public.create_supplier_invite(
  p_request_id uuid,
  p_supplier_id uuid,
  p_channel text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'admin' and coalesce(p.is_active,false)
  ) into v_is_admin;

  select * into v_request from public.requests where id = p_request_id;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  if v_request.created_by <> v_uid and not v_is_admin then
    raise exception 'not_request_owner' using errcode = '42501';
  end if;
  if v_request.status <> 'open' or not public.request_is_current(v_request.travel_date, v_request.created_at) then
    raise exception 'request_expired' using errcode = '22023';
  end if;

  select * into v_supplier from public.external_suppliers where id = p_supplier_id;
  if not found then raise exception 'supplier_not_found' using errcode = 'P0002'; end if;
  if v_supplier.opt_out or v_supplier.status = 'inactive' then
    raise exception 'supplier_unavailable' using errcode = '42501';
  end if;

  v_channel := lower(trim(coalesce(p_channel,'auto')));
  if v_channel = 'auto' then
    if nullif(trim(coalesce(v_supplier.email,'')),'') is not null then
      v_channel := 'email';
    elsif nullif(trim(coalesce(v_supplier.phone,'')),'') is not null then
      v_channel := 'sms';
    else
      v_channel := 'manual';
    end if;
  end if;
  if v_channel not in ('sms','telegram','email','whatsapp','manual') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  v_recipient := case
    when v_channel = 'email' then nullif(trim(coalesce(v_supplier.email,'')),'')
    when v_channel in ('sms','whatsapp') then nullif(trim(coalesce(v_supplier.phone,'')),'')
    when v_channel = 'telegram' then nullif(trim(coalesce(v_supplier.telegram,'')),'')
    else null
  end;
  if v_channel <> 'manual' and v_recipient is null then
    raise exception 'supplier_contact_missing' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.supplier_invites i
    where i.request_id = p_request_id and i.supplier_id = p_supplier_id
  ) and (
    select count(*) from public.supplier_invites i
    where i.request_id = p_request_id and i.created_by = v_uid
  ) >= 30 then
    raise exception 'invite_limit_reached' using errcode = '22023';
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex');
  v_preview := 'Agent Bifavia: ' || coalesce(v_request.category,'So‘rov') ||
    case when v_request.destination is not null then ' · ' || v_request.destination else '' end ||
    case when v_request.travel_date is not null then ' · ' || v_request.travel_date::text else '' end;

  select * into v_existing
  from public.supplier_invites i
  where i.request_id = p_request_id and i.supplier_id = p_supplier_id
  order by i.created_at desc
  limit 1
  for update;

  if found then
    update public.supplier_invites
      set channel = v_channel,
          recipient = v_recipient,
          token_hash = v_token_hash,
          status = 'queued',
          message_preview = v_preview,
          provider_message_id = null,
          failure_reason = null,
          sent_at = null,
          opened_at = null,
          responded_at = null,
          expires_at = v_expires_at,
          response = '{}'::jsonb,
          updated_at = now()
    where id = v_existing.id
    returning id into v_invite_id;
  else
    insert into public.supplier_invites(
      request_id,supplier_id,created_by,channel,recipient,token_hash,status,message_preview,expires_at
    ) values (
      p_request_id,p_supplier_id,v_uid,v_channel,v_recipient,v_token_hash,'queued',v_preview,v_expires_at
    ) returning id into v_invite_id;
  end if;

  v_recipient_hint := case
    when v_channel = 'email' and v_recipient is not null then
      left(v_recipient,1) || '***@' || split_part(v_recipient,'@',2)
    when v_channel in ('sms','whatsapp') and v_recipient is not null then
      '***' || right(regexp_replace(v_recipient,'\D','','g'),4)
    when v_channel = 'telegram' and v_recipient is not null then
      left(v_recipient,2) || '***'
    else 'Qo‘lda ulashish'
  end;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'token', v_token,
    'supplier_name', v_supplier.name,
    'channel', v_channel,
    'recipient_hint', v_recipient_hint,
    'status', 'queued',
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.create_supplier_invite(uuid,uuid,text) from public, anon;
grant execute on function public.create_supplier_invite(uuid,uuid,text) to authenticated, service_role;

create or replace function public.list_request_supplier_invites(p_request_id uuid)
returns table(
  id uuid,
  supplier_id uuid,
  supplier_name text,
  channel text,
  status text,
  recipient_hint text,
  created_at timestamptz,
  expires_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  response jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_is_admin boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select created_by into v_owner from public.requests where id=p_request_id;
  if not found then raise exception 'request_not_found' using errcode='P0002'; end if;
  select exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin' and coalesce(p.is_active,false)) into v_is_admin;
  if v_owner <> v_uid and not v_is_admin then raise exception 'not_request_owner' using errcode='42501'; end if;

  return query
  select i.id, i.supplier_id, s.name, i.channel, i.status,
    case
      when i.channel='email' and i.recipient is not null then left(i.recipient,1)||'***@'||split_part(i.recipient,'@',2)
      when i.channel in ('sms','whatsapp') and i.recipient is not null then '***'||right(regexp_replace(i.recipient,'\D','','g'),4)
      when i.channel='telegram' and i.recipient is not null then left(i.recipient,2)||'***'
      else 'Qo‘lda ulashish'
    end,
    i.created_at, i.expires_at, i.opened_at, i.responded_at, i.response
  from public.supplier_invites i
  join public.external_suppliers s on s.id=i.supplier_id
  where i.request_id=p_request_id
  order by i.created_at desc;
end;
$$;

revoke all on function public.list_request_supplier_invites(uuid) from public, anon;
grant execute on function public.list_request_supplier_invites(uuid) to authenticated, service_role;

create or replace function public.get_supplier_invite_public(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_invite public.supplier_invites%rowtype;
  v_request public.requests%rowtype;
  v_supplier public.external_suppliers%rowtype;
  v_company text;
begin
  if nullif(trim(coalesce(p_token,'')),'') is null then
    raise exception 'invalid_token' using errcode='22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(trim(p_token),'sha256'),'hex');

  select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1;
  if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;
  if v_invite.expires_at <= now() or v_invite.status in ('cancelled','expired','opted_out') then
    if v_invite.status not in ('opted_out','cancelled') then
      update public.supplier_invites set status='expired' where id=v_invite.id;
    end if;
    raise exception 'invite_expired' using errcode='22023';
  end if;

  select * into v_request from public.requests where id=v_invite.request_id;
  select * into v_supplier from public.external_suppliers where id=v_invite.supplier_id;
  select company_name into v_company from public.profiles where id=v_request.created_by;

  if v_invite.status in ('queued','sent') then
    update public.supplier_invites
      set status='opened', opened_at=coalesce(opened_at,now())
      where id=v_invite.id;
  elsif v_invite.opened_at is null then
    update public.supplier_invites set opened_at=now() where id=v_invite.id;
  end if;

  return jsonb_build_object(
    'invite_id', v_invite.id,
    'supplier_name', v_supplier.name,
    'request_category', v_request.category,
    'destination', v_request.destination,
    'travel_date', v_request.travel_date,
    'adults', v_request.adults,
    'children', v_request.children,
    'infants', v_request.infants,
    'budget', v_request.budget,
    'currency', v_request.currency,
    'description', v_request.description,
    'service_details', v_request.service_details,
    'requester_company', v_company,
    'expires_at', v_invite.expires_at,
    'status', case when v_invite.status='responded' then 'responded' else 'opened' end
  );
end;
$$;

revoke all on function public.get_supplier_invite_public(text) from public;
grant execute on function public.get_supplier_invite_public(text) to anon, authenticated, service_role;

create or replace function public.submit_supplier_invite_response(
  p_token text,
  p_available boolean,
  p_price numeric default null,
  p_currency text default 'UZS',
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_invite public.supplier_invites%rowtype;
begin
  if nullif(trim(coalesce(p_token,'')),'') is null then
    raise exception 'invalid_token' using errcode='22023';
  end if;
  if p_currency not in ('UZS','USD','EUR','RUB') then
    raise exception 'invalid_currency' using errcode='22023';
  end if;
  if coalesce(p_available,false) and (p_price is null or p_price < 0 or p_price::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'price_required' using errcode='22023';
  end if;
  if length(coalesce(p_comment,'')) > 1000 then
    raise exception 'comment_too_long' using errcode='22023';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(trim(p_token),'sha256'),'hex');
  select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1 for update;
  if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;
  if v_invite.expires_at <= now() or v_invite.status in ('cancelled','expired','opted_out') then
    raise exception 'invite_expired' using errcode='22023';
  end if;

  update public.supplier_invites
  set status='responded',
      responded_at=now(),
      response=jsonb_build_object(
        'available',coalesce(p_available,false),
        'price',p_price,
        'currency',p_currency,
        'comment',nullif(trim(coalesce(p_comment,'')),''),
        'submitted_at',now()
      )
  where id=v_invite.id;

  return jsonb_build_object('ok',true,'invite_id',v_invite.id);
end;
$$;

revoke all on function public.submit_supplier_invite_response(text,boolean,numeric,text,text) from public;
grant execute on function public.submit_supplier_invite_response(text,boolean,numeric,text,text) to anon, authenticated, service_role;

create or replace function public.opt_out_supplier_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_invite public.supplier_invites%rowtype;
begin
  if nullif(trim(coalesce(p_token,'')),'') is null then
    raise exception 'invalid_token' using errcode='22023';
  end if;
  v_hash := pg_catalog.encode(extensions.digest(trim(p_token),'sha256'),'hex');
  select * into v_invite from public.supplier_invites i where i.token_hash=v_hash limit 1 for update;
  if not found then raise exception 'invite_not_found' using errcode='P0002'; end if;

  update public.external_suppliers
    set opt_out=true, opt_out_at=now()
    where id=v_invite.supplier_id;
  update public.supplier_invites
    set status='opted_out'
    where supplier_id=v_invite.supplier_id and status in ('queued','sent','opened');

  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.opt_out_supplier_invite(text) from public;
grant execute on function public.opt_out_supplier_invite(text) to anon, authenticated, service_role;
