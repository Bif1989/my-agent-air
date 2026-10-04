-- Run after resume_security. Every fixture and queued push event is rolled back.
begin;

do $$
declare buyer uuid := gen_random_uuid(); seller uuid := gen_random_uuid(); blocked uuid := gen_random_uuid(); incomplete uuid := gen_random_uuid();
begin
  perform set_config('test.buyer',buyer::text,true);
  perform set_config('test.seller',seller::text,true);
  perform set_config('test.blocked',blocked::text,true);
  perform set_config('test.incomplete',incomplete::text,true);
  insert into auth.users(id,email,raw_user_meta_data)
  select id, 'audit-'||id||'@example.invalid', jsonb_build_object('full_name','Audit fixture','company_name','Audit only','city','Toshkent','phone','+998000000000','agent_type','Aviakassa')
  from unnest(array[buyer,seller,blocked,incomplete]) as id;
  update public.profiles set is_active=false where id=blocked;
  update public.profiles set company_name=null where id=incomplete;
  insert into public.requests(created_by,category,origin,destination,travel_date,status)
  values(buyer,'Aviachipta','TAS','IST',(now() at time zone 'Asia/Tashkent')::date+7,'open')
  returning id::text into strict buyer;
  perform set_config('test.request',buyer::text,true);
  insert into public.requests(created_by,category,travel_date,status)
  values(current_setting('test.buyer')::uuid,'Aviachipta',(now() at time zone 'Asia/Tashkent')::date-1,'open')
  returning id::text into strict buyer;
  perform set_config('test.expired',buyer::text,true);
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.incomplete'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin
    insert into public.requests(created_by,category,status) values(auth.uid(),'Aviachipta','open');
    raise exception 'FAIL: incomplete profile created a request';
  exception when insufficient_privilege then
    if sqlerrm <> 'profile_incomplete' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.seller'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare offer uuid; begin
  begin
    insert into public.offers(request_id,agent_id,price,currency,status) values(current_setting('test.request')::uuid,auth.uid(),-1,'USD','pending');
    raise exception 'FAIL: negative offer price accepted';
  exception when check_violation then null; end;
  begin
    insert into public.offers(request_id,agent_id,price,currency,status) values(current_setting('test.request')::uuid,auth.uid(),10,'FAKE','pending');
    raise exception 'FAIL: unsupported currency accepted';
  exception when check_violation then null; end;
  begin
    insert into public.offers(request_id,agent_id,price,currency,status) values(current_setting('test.expired')::uuid,auth.uid(),10,'USD','pending');
    raise exception 'FAIL: expired request received an offer';
  exception when invalid_parameter_value then
    if sqlerrm <> 'request_expired' then raise; end if;
  end;
  insert into public.offers(request_id,agent_id,price,currency,status) values(current_setting('test.request')::uuid,auth.uid(),100,'USD','pending') returning id into offer;
  perform set_config('test.offer',offer::text,true);
  begin
    perform public.accept_offer(offer);
    raise exception 'FAIL: seller accepted someone else''s request';
  exception when insufficient_privilege then
    if sqlerrm <> 'not_request_owner' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.buyer'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare deal uuid; repeat_deal uuid; message_id uuid := gen_random_uuid(); begin
  begin
    insert into public.requests(created_by,category,budget,status) values(auth.uid(),'Aviachipta',-5,'open');
    raise exception 'FAIL: negative budget accepted';
  exception when check_violation then null; end;
  deal := public.accept_offer(current_setting('test.offer')::uuid);
  repeat_deal := public.accept_offer(current_setting('test.offer')::uuid);
  if deal <> repeat_deal then raise exception 'FAIL: retry duplicated a deal'; end if;
  if (select count(*) from public.deals where offer_id=current_setting('test.offer')::uuid) <> 1 then raise exception 'FAIL: incorrect deal count'; end if;
  perform set_config('test.deal',deal::text,true);
  begin
    insert into public.messages(deal_id,sender_id,message,message_type) values(deal,auth.uid(),'Fake system message','system');
    raise exception 'FAIL: user forged a system message';
  exception when insufficient_privilege then
    if sqlerrm <> 'system_message_forbidden' then raise; end if;
  end;
  insert into public.messages(id,deal_id,sender_id,message,message_type) values(message_id,deal,auth.uid(),'Audit only','text');
  insert into public.messages(id,deal_id,sender_id,message,message_type) values(message_id,deal,auth.uid(),'Audit only','text') on conflict (id) do nothing;
  if (select count(*) from public.messages where id=message_id) <> 1 then raise exception 'FAIL: retry duplicated a message'; end if;
  begin
    perform public.update_deal_status(deal,'completed');
    raise exception 'FAIL: skipped required deal stages';
  exception when raise_exception then
    if sqlerrm <> 'invalid_status_transition' then raise; end if;
  end;
  perform public.update_deal_status(deal,'processing');
  perform public.update_deal_status(deal,'processing');
  perform public.update_deal_status(deal,'issued');
  perform public.update_deal_status(deal,'completed');
  if (select status from public.deals where id=deal) <> 'completed' then raise exception 'FAIL: deal flow did not complete'; end if;
end $$;
reset role;

-- Make the deal's seller inactive after the positive flow, without changing any real user.
update public.profiles set is_active=false where id=current_setting('test.seller')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.seller'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin
    insert into public.requests(created_by,category,status) values(auth.uid(),'Aviachipta','open');
    raise exception 'FAIL: blocked user created request';
  exception when insufficient_privilege then if sqlerrm <> 'account_inactive' then raise; end if; end;
  begin
    insert into public.messages(deal_id,sender_id,message) values(current_setting('test.deal')::uuid,auth.uid(),'Blocked audit fixture');
    raise exception 'FAIL: blocked user sent deal message';
  exception when insufficient_privilege then if sqlerrm <> 'account_inactive' then raise; end if; end;
  begin
    perform public.update_deal_status(current_setting('test.deal')::uuid,'completed');
    raise exception 'FAIL: blocked user used status RPC';
  exception when insufficient_privilege then if sqlerrm <> 'account_inactive' then raise; end if; end;
  begin
    perform public.accept_offer(current_setting('test.offer')::uuid);
    raise exception 'FAIL: blocked user used acceptance RPC';
  exception when insufficient_privilege then if sqlerrm <> 'account_inactive' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ begin
  begin
    perform public.accept_offer(current_setting('test.offer')::uuid);
    raise exception 'FAIL: anonymous acceptance RPC allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: positive deal flow, idempotent retry, incomplete/blocked/anonymous access, expiry, money and system-message checks' as result;
rollback;
