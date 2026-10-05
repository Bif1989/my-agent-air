-- Every test record and its notifications are rolled back.
begin;
do $$ declare actor uuid := gen_random_uuid(); begin
  perform set_config('test.form_actor',actor::text,true);
  insert into auth.users(id,email,raw_user_meta_data) values(actor,'forms-'||actor||'@example.invalid',jsonb_build_object('full_name','Forms fixture','company_name','Test only','city','Toshkent','phone','+998000000000','agent_type','Aviakassa'));
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.form_actor'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare item jsonb; payload jsonb; request_id uuid; start_date date := (now() at time zone 'Asia/Tashkent')::date+7; saved jsonb; failures integer := 0;
begin
  for item in select * from jsonb_array_elements('[
    {"category":"Aviachipta","details":{"trip_type":"one_way","cabin_class":"business"}},
    {"category":"Tur paket","details":{"transport":"bus","duration_days":"1","nights":"0"}},
    {"category":"Mehmonxona","details":{"rooms":"2"}},
    {"category":"Transfer","details":{"transfer_type":"one_way","pickup_time":"10:30","vehicle":"Staria 8 o‘rin"}},
    {"category":"Gid","details":{"language":"Rus","duration_hours":"4","route_details":"Registon"}},
    {"category":"Viza","details":{"nationality":"O‘zbekiston","residence_country":"O‘zbekiston","visa_purpose":"tourism","duration_days":"15","visa_service":"documents"}},
    {"category":"Boshqa","details":{"service_name":"Guruh tushligi","quantity":"20","unit":"meal"}}
  ]'::jsonb) loop
    payload := item->'details';
    if item->>'category'='Mehmonxona' then payload := payload||jsonb_build_object('check_out',(start_date+3)::text); end if;
    insert into public.requests(created_by,category,origin,destination,travel_date,adults,children,infants,currency,service_details,form_version)
      values(auth.uid(),item->>'category','Toshkent','Samarqand',start_date,2,0,0,'UZS',payload,1) returning id into request_id;
    payload := payload||jsonb_build_object('budget_basis','total');
    update public.requests set description='Tahrirlangan izoh',service_details=payload,budget=100,currency='USD',form_version=1 where id=request_id;
    select service_details into saved from public.requests where id=request_id;
    if saved<>payload then raise exception 'FAIL: detail loss for %',item->>'category'; end if;
    update public.requests set status='closed' where id=request_id;
  end loop;
  -- Legacy rows still save; editing can explicitly upgrade them to form version 1.
  insert into public.requests(created_by,category,origin,travel_date,description)
    values(auth.uid(),'Mehmonxona','Buxoro',start_date,E'Eski izoh\n\nXizmat tafsilotlari:\nXonalar: 2\nTunlar: 3');
  for item in select * from jsonb_array_elements('[
    {"category":"Aviachipta","details":{"trip_type":"round_trip","return_date":"2020-01-01"}},
    {"category":"Mehmonxona","details":{"rooms":"0","check_out":"2030-01-01"}},
    {"category":"Mehmonxona","details":{"rooms":"1","check_out":"2030-02-30"}},
    {"category":"Transfer","details":{"transfer_type":"one_way","vehicle":"Bus","pickup_time":"25:00"}},
    {"category":"Gid","details":{"duration_hours":"4","route_details":"Registon"}},
    {"category":"Viza","details":{"visa_purpose":"tourism"}},
    {"category":"Boshqa","details":{"service_name":"Lunch","quantity":"-1","unit":"meal"}},
    {"category":"Tur paket","details":{"transport":"bus","duration_days":"1","nights":"2"}},
    {"category":"Aviachipta","details":{"trip_type":"one_way","rooms":"1"}},
    {"category":"Aviachipta","details":{"trip_type":"one_way","cabin_class":3}}
  ]'::jsonb) loop
    begin
      insert into public.requests(created_by,category,origin,destination,travel_date,adults,children,infants,service_details,form_version)
        values(auth.uid(),item->>'category','Toshkent','Samarqand',start_date,2,0,0,item->'details',1);
      raise exception 'FAIL: invalid service form accepted: %',item;
    exception when check_violation then failures := failures+1; end;
  end loop;
  begin
    insert into public.requests(created_by,category,origin,destination,travel_date,adults,children,infants,service_details,form_version)
      values(auth.uid(),'Mehmonxona',null,'Buxoro',start_date,2,2,0,jsonb_build_object('rooms','1','check_out',(start_date+2)::text,'child_ages','7'),1);
    raise exception 'FAIL: missing child age accepted';
  exception when check_violation then failures := failures+1; end;
  begin
    insert into public.requests(created_by,category,origin,destination,travel_date,adults,children,infants,budget,currency,service_details,form_version)
      values(auth.uid(),'Aviachipta','TAS','IST',start_date,2,0,0,100,'USD','{"trip_type":"one_way"}',1);
    raise exception 'FAIL: unknown price basis accepted';
  exception when check_violation then failures := failures+1; end;
  insert into public.requests(created_by,category,origin,destination,travel_date,adults,children,infants,service_details,form_version)
    values(auth.uid(),'Aviachipta','TAS','IST',start_date,2,0,0,'{"trip_type":"one_way"}',1) returning id into request_id;
  begin
    update public.requests set form_version=0 where id=request_id;
    raise exception 'FAIL: form validation bypassed by downgrade';
  exception when check_violation then failures := failures+1; end;
  if failures<>13 then raise exception 'FAIL: only % negative cases tested',failures; end if;
end $$;
reset role;
rollback;
select 'PASS: 7 service categories, read/edit preservation, status changes, legacy rows and 13 invalid-input cases; fixtures rolled back' as result;
