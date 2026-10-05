-- Structured service fields coexist with legacy descriptions. Historical rows remain version 0.
alter table public.requests
  add column service_details jsonb not null default '{}'::jsonb,
  add column form_version smallint not null default 0;
alter table public.requests add constraint requests_service_details_object
  check (jsonb_typeof(service_details) = 'object' and octet_length(service_details::text) <= 16000);
alter table public.requests add constraint requests_form_version check (form_version in (0,1));

create function public.validate_service_request()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  definitions jsonb := '{"Aviachipta":{"origin":true,"fields":[{"key":"trip_type","type":"select","required":true,"options":[["one_way","Bir tomonga","В одну сторону"],["round_trip","Borish–qaytish","Туда–обратно"],["multi_city","Murakkab yo‘nalish","Сложный маршрут"]]},{"key":"return_date","type":"date","required":true,"when":["trip_type","round_trip"]},{"key":"route_details","type":"textarea","required":true,"when":["trip_type","multi_city"],"maxLength":600},{"key":"cabin_class","type":"select","options":[["economy","Ekonom","Эконом"],["premium_economy","Premium ekonom","Премиум-эконом"],["business","Biznes","Бизнес"],["first","Birinchi","Первый"]]},{"key":"flight_preference","type":"select","options":[["any","Peresadka mumkin","Можно с пересадкой"],["direct","Faqat to‘g‘ridan-to‘g‘ri","Только прямой"]]},{"key":"airline"},{"key":"date_flexibility","type":"select","options":[["exact","Faqat ko‘rsatilgan sana","Только указанная дата"],["1","±1 kun","±1 день"],["3","±3 kun","±3 дня"],["7","±7 kun","±7 дней"]]},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Tur paket":{"origin":true,"fields":[{"key":"transport","type":"select","required":true,"options":[["flight","Samolyot","Самолёт"],["bus","Avtobus / miniven","Автобус / минивэн"],["train","Poyezd","Поезд"],["own","O‘z transportida","Своим транспортом"]]},{"key":"duration_days","type":"number","required":true,"min":1,"max":366},{"key":"nights","type":"number","min":0,"max":365},{"key":"hotel_stars","type":"select","options":[["any","Farqi yo‘q","Не важно"],["3","3 yulduz","3 звезды"],["4","4 yulduz","4 звезды"],["5","5 yulduz","5 звёзд"]]},{"key":"meal_plan","type":"select","options":[["room_only","Ovqatsiz (RO)","Без питания (RO)"],["breakfast","Nonushta (BB)","Завтрак (BB)"],["half_board","Nonushta va kechki ovqat (HB)","Завтрак и ужин (HB)"],["full_board","Uch mahal (FB)","Трёхразовое (FB)"],["all_inclusive","Hammasi ichida (AI)","Всё включено (AI)"],["ultra_all_inclusive","Ultra hammasi ichida (UAI)","Ультра всё включено (UAI)"]]},{"key":"room_type"},{"key":"included_services","type":"textarea","maxLength":600},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Mehmonxona":{"origin":false,"fields":[{"key":"check_out","type":"date","required":true},{"key":"rooms","type":"number","required":true,"min":1,"max":500},{"key":"hotel_name"},{"key":"hotel_stars","type":"select","options":[["any","Farqi yo‘q","Не важно"],["3","3 yulduz","3 звезды"],["4","4 yulduz","4 звезды"],["5","5 yulduz","5 звёзд"]]},{"key":"meal_plan","type":"select","options":[["room_only","Ovqatsiz (RO)","Без питания (RO)"],["breakfast","Nonushta (BB)","Завтрак (BB)"],["half_board","Nonushta va kechki ovqat (HB)","Завтрак и ужин (HB)"],["full_board","Uch mahal (FB)","Трёхразовое (FB)"],["all_inclusive","Hammasi ichida (AI)","Всё включено (AI)"],["ultra_all_inclusive","Ultra hammasi ichida (UAI)","Ультра всё включено (UAI)"]]},{"key":"room_type"},{"key":"room_distribution","type":"textarea","maxLength":600},{"key":"guest_nationality"},{"key":"cancellation","type":"select","options":[["flexible","Bepul bekor qilish imkoniyati","Возможность бесплатной отмены"],["any","Har qanday tarif","Любой тариф"]]},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Transfer":{"origin":true,"fields":[{"key":"transfer_type","type":"select","required":true,"options":[["one_way","Bir tomonga","В одну сторону"],["round_trip","Borish–qaytish","Туда–обратно"],["hourly","Soatbay ijaraga","Почасовая аренда"]]},{"key":"pickup_time","type":"time","required":true},{"key":"vehicle","required":true},{"key":"return_date","type":"date","required":true,"when":["transfer_type","round_trip"]},{"key":"return_time","type":"time","required":true,"when":["transfer_type","round_trip"]},{"key":"duration_hours","type":"number","required":true,"when":["transfer_type","hourly"],"min":1,"max":720},{"key":"flight_number"},{"key":"luggage_count","type":"number","min":0,"max":1000},{"key":"child_seats","type":"number","min":0,"max":500},{"key":"route_details","type":"textarea","maxLength":600},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Gid":{"origin":false,"fields":[{"key":"language","required":true},{"key":"duration_hours","type":"number","required":true,"min":0.5,"max":24,"step":0.5},{"key":"duration_days","type":"number","min":1,"max":365},{"key":"route_details","type":"textarea","required":true,"maxLength":600},{"key":"start_time","type":"time"},{"key":"guide_type","type":"select","options":[["walking","Piyoda ekskursiya","Пешеходная экскурсия"],["with_transport","Gid va transport","Гид с транспортом"],["interpreter","Tarjimonlik / hamrohlik","Перевод / сопровождение"]]},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Viza":{"origin":false,"fields":[{"key":"nationality","required":true},{"key":"residence_country","required":true},{"key":"visa_purpose","type":"select","required":true,"options":[["tourism","Turizm","Туризм"],["business","Biznes","Бизнес"],["visit","Mehmon / qarindosh","Гостевая"],["study","O‘qish","Учёба"],["work","Ish","Работа"],["transit","Tranzit","Транзит"],["other","Boshqa","Другое"]]},{"key":"duration_days","type":"number","required":true,"min":1,"max":3650},{"key":"visa_service","type":"select","required":true,"options":[["consultation","Maslahat","Консультация"],["documents","Hujjat tayyorlash","Подготовка документов"],["appointment","Qabulga yozilish","Запись на подачу"],["full_support","To‘liq ko‘mak","Полное сопровождение"]]},{"key":"submission_city"},{"key":"visa_entries","type":"select","options":[["single","Bir marta","Однократная"],["double","Ikki marta","Двукратная"],["multiple","Ko‘p martalik","Многократная"]]},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]},"Boshqa":{"origin":false,"fields":[{"key":"service_name","required":true},{"key":"quantity","type":"number","required":true,"min":1,"max":5000},{"key":"unit","type":"select","required":true,"options":[["person","Kishi","Человек"],["ticket","Chipta","Билет"],["meal","Taom / porsiya","Порция"],["hour","Soat","Час"],["item","Dona / xizmat","Штука / услуга"]]},{"key":"start_time","type":"time"},{"key":"child_ages","maxLength":2000},{"key":"infant_ages_months","maxLength":2000},{"key":"budget_basis","type":"select","options":[["total","Jami xizmat uchun","За всю услугу"],["per_person","Bir kishiga","За человека"],["per_room_night","Bir xona / bir tun","За номер / ночь"],["per_person_night","Bir kishi / bir tun","За человека / ночь"],["per_vehicle","Bir transportga","За транспорт"],["per_hour","Bir soatga","За час"],["per_day","Bir kunga","За день"],["per_unit","Bir dona / xizmatga","За единицу"]]}]}}'::jsonb;
  definition jsonb;
  item jsonb;
  data jsonb := new.service_details;
  key text;
  value text;
  choices text[];
  age text;
  ages text[];
  count_value integer;
  max_age integer;
  is_visible boolean;
begin
  if tg_op = 'UPDATE' and old.form_version = 1 and new.form_version <> 1 then
    raise exception 'request_form_downgrade_forbidden' using errcode='23514';
  end if;
  if new.form_version = 0 then return new; end if;
  if tg_op = 'UPDATE' and row(new.category,new.origin,new.destination,new.travel_date,new.adults,new.children,new.infants,new.baggage,new.budget,new.currency,new.description,new.service_details,new.form_version)
    is not distinct from row(old.category,old.origin,old.destination,old.travel_date,old.adults,old.children,old.infants,old.baggage,old.budget,old.currency,old.description,old.service_details,old.form_version) then return new; end if;
  definition := definitions->new.category;
  if definition is null then raise exception 'request_field_invalid:category' using errcode='23514'; end if;
  if new.travel_date is null then raise exception 'request_field_invalid:travel_date' using errcode='23514'; end if;
  if new.destination is null or btrim(new.destination) = '' or length(new.destination)>120 then raise exception 'request_field_invalid:destination' using errcode='23514'; end if;
  if (definition->>'origin')::boolean and (new.origin is null or btrim(new.origin)='' or length(new.origin)>120) then raise exception 'request_field_invalid:origin' using errcode='23514'; end if;
  if new.category='Aviachipta' and lower(btrim(new.origin))=lower(btrim(new.destination)) then raise exception 'request_field_invalid:destination' using errcode='23514'; end if;
  if new.adults is null or new.adults<1 or new.adults>500 or new.children is null or new.children<0 or new.children>500 or new.infants is null or new.infants<0 or new.infants>500 then raise exception 'request_field_invalid:passengers' using errcode='23514'; end if;
  if new.category='Aviachipta' and new.infants>new.adults then raise exception 'request_field_invalid:infants' using errcode='23514'; end if;
  if length(coalesce(new.description,''))>1000 or length(coalesce(new.baggage,''))>120 then raise exception 'request_field_invalid:description' using errcode='23514'; end if;
  if jsonb_typeof(data)<>'object' then raise exception 'request_field_invalid:service_details' using errcode='23514'; end if;
  for key in select jsonb_object_keys(data) loop
    if not exists(select 1 from jsonb_array_elements(definition->'fields') f where f->>'key'=key) then raise exception 'request_field_invalid:unknown_detail' using errcode='23514'; end if;
    if jsonb_typeof(data->key)<>'string' then raise exception 'request_field_invalid:detail_type' using errcode='23514'; end if;
  end loop;
  for item in select * from jsonb_array_elements(definition->'fields') loop
    key := item->>'key'; value := btrim(coalesce(data->>key,''));
    is_visible := item->'when' is null or data->>(item->'when'->>0) = item->'when'->>1;
    if not coalesce(is_visible,false) then
      if value<>'' then raise exception 'request_field_invalid:unexpected_detail' using errcode='23514'; end if;
      continue;
    end if;
    if value='' then
      if coalesce((item->>'required')::boolean,false) then raise exception 'request_field_missing:%',key using errcode='23514'; end if;
      continue;
    end if;
    if length(value)>coalesce((item->>'maxLength')::integer,160) then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
    if item->>'type'='select' and not exists(select 1 from jsonb_array_elements(item->'options') option where option->>0=value) then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
    if item->>'type'='number' then
      if value !~ '^\d+(\.\d+)?$' then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
      if value::numeric<coalesce((item->>'min')::numeric,0) or value::numeric>coalesce((item->>'max')::numeric,500) or mod(value::numeric,coalesce((item->>'step')::numeric,1))<>0 then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
    end if;
    if item->>'type'='date' then
      if value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
      begin perform value::date;
      exception when datetime_field_overflow or invalid_datetime_format then raise exception 'request_field_invalid:%',key using errcode='23514'; end;
    end if;
    if item->>'type'='time' and value !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
  end loop;
  foreach key in array array['child_ages','infant_ages_months'] loop
    count_value := case when key='child_ages' then new.children else new.infants end;
    max_age := case when key='infant_ages_months' then 23 when new.category='Aviachipta' then 11 else 17 end;
    value := btrim(coalesce(data->>key,''));
    if value<>'' or (count_value>0 and new.category in ('Aviachipta','Mehmonxona','Tur paket')) then
      ages := regexp_split_to_array(value,'\s*,\s*');
      if array_length(ages,1)<>count_value then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
      foreach age in array ages loop
        if age !~ '^\d{1,2}$' then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
        if age::integer>max_age or age::integer<(case when key='child_ages' then 2 else 0 end) then raise exception 'request_field_invalid:%',key using errcode='23514'; end if;
      end loop;
    end if;
  end loop;
  if new.category='Mehmonxona' and ((data->>'check_out')::date-new.travel_date not between 1 and 365) then raise exception 'request_field_invalid:check_out' using errcode='23514'; end if;
  if data->>'trip_type'='round_trip' or data->>'transfer_type'='round_trip' then
    if (data->>'return_date')::date<new.travel_date then raise exception 'request_field_invalid:return_date' using errcode='23514'; end if;
    if new.category='Transfer' and (data->>'return_date')::date=new.travel_date and data->>'return_time'<=data->>'pickup_time' then raise exception 'request_field_invalid:return_time' using errcode='23514'; end if;
  end if;
  if new.category='Tur paket' and nullif(data->>'nights','') is not null and (data->>'nights')::numeric >= (data->>'duration_days')::numeric then raise exception 'request_field_invalid:nights' using errcode='23514'; end if;
  if new.budget is not null and (new.budget<=0 or new.budget>1000000000000 or new.currency is null or new.currency not in ('USD','UZS','EUR','RUB') or nullif(data->>'budget_basis','') is null) then raise exception 'request_field_invalid:budget' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.validate_service_request() from public,anon,authenticated;
create trigger validate_service_request before insert or update on public.requests for each row execute function public.validate_service_request();
