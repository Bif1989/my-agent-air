create table if not exists public.uz_locations (
  region text not null,
  locality text not null,
  kind text not null check (kind in ('city','district')),
  sort_order integer not null default 0,
  primary key (region, locality)
);

alter table public.uz_locations enable row level security;
revoke all on table public.uz_locations from public, anon;
grant select on table public.uz_locations to authenticated;

drop policy if exists uz_locations_authenticated_read on public.uz_locations;
create policy uz_locations_authenticated_read
on public.uz_locations
for select
to authenticated
using (true);

with region_seed as (
  select key as region, value as localities
  from jsonb_each($json$
{"Qoraqalpog‘iston Respublikasi":["Nukus shahri","Amudaryo tumani","Beruniy tumani","Bo‘zatov tumani","Qorao‘zak tumani","Kegeyli tumani","Qo‘ng‘irot tumani","Qanliko‘l tumani","Mo‘ynoq tumani","Nukus tumani","Taxiatosh tumani","Taxtako‘pir tumani","To‘rtko‘l tumani","Xo‘jayli tumani","Chimboy tumani","Shumanay tumani","Ellikkala tumani"],"Andijon viloyati":["Andijon shahri","Xonobod shahri","Oltinko‘l tumani","Andijon tumani","Baliqchi tumani","Bo‘ston tumani","Buloqboshi tumani","Jalaquduq tumani","Izboskan tumani","Ulug‘nor tumani","Qo‘rg‘ontepa tumani","Asaka tumani","Marhamat tumani","Shahrixon tumani","Paxtaobod tumani","Xo‘jaobod tumani"],"Buxoro viloyati":["Buxoro shahri","Kogon shahri","Olot tumani","Buxoro tumani","Vobkent tumani","G‘ijduvon tumani","Kogon tumani","Qorako‘l tumani","Qorovulbozor tumani","Peshku tumani","Romitan tumani","Jondor tumani","Shofirkon tumani"],"Jizzax viloyati":["Jizzax shahri","Arnasoy tumani","Baxmal tumani","G‘allaorol tumani","Sharof Rashidov tumani","Do‘stlik tumani","Zomin tumani","Zarbdor tumani","Mirzacho‘l tumani","Zafarobod tumani","Paxtakor tumani","Forish tumani","Yangiobod tumani"],"Qashqadaryo viloyati":["Qarshi shahri","Shahrisabz shahri","Ko‘kdala tumani","G‘uzor tumani","Dehqonobod tumani","Qamashi tumani","Qarshi tumani","Koson tumani","Kitob tumani","Mirishkor tumani","Muborak tumani","Nishon tumani","Kasbi tumani","Chiroqchi tumani","Shahrisabz tumani","Yakkabog‘ tumani"],"Navoiy viloyati":["Navoiy shahri","Zarafshon shahri","G‘ozg‘on shahri","Konimex tumani","Qiziltepa tumani","Navbahor tumani","Karmana tumani","Nurota tumani","Tomdi tumani","Uchquduq tumani","Xatirchi tumani"],"Namangan viloyati":["Namangan shahri","Davlatobod tumani","Yangi Namangan tumani","Mingbuloq tumani","Kosonsoy tumani","Namangan tumani","Norin tumani","Pop tumani","To‘raqo‘rg‘on tumani","Uychi tumani","Uchqo‘rg‘on tumani","Chortoq tumani","Chust tumani","Yangiqo‘rg‘on tumani"],"Samarqand viloyati":["Samarqand shahri","Kattaqo‘rg‘on shahri","Oqdaryo tumani","Bulung‘ur tumani","Jomboy tumani","Ishtixon tumani","Kattaqo‘rg‘on tumani","Qo‘shrabot tumani","Narpay tumani","Payariq tumani","Pastdarg‘om tumani","Paxtachi tumani","Samarqand tumani","Nurobod tumani","Urgut tumani","Tayloq tumani"],"Surxondaryo viloyati":["Termiz shahri","Oltinsoy tumani","Angor tumani","Bandixon tumani","Boysun tumani","Muzrabot tumani","Denov tumani","Jarqo‘rg‘on tumani","Qumqo‘rg‘on tumani","Qiziriq tumani","Sariosiyo tumani","Termiz tumani","Uzun tumani","Sherobod tumani","Sho‘rchi tumani"],"Sirdaryo viloyati":["Guliston shahri","Shirin shahri","Yangiyer shahri","Oqoltin tumani","Boyovut tumani","Sayxunobod tumani","Guliston tumani","Sardoba tumani","Mirzaobod tumani","Sirdaryo tumani","Xovos tumani"],"Toshkent viloyati":["Nurafshon shahri","Olmaliq shahri","Angren shahri","Bekobod shahri","Chirchiq shahri","Ohangaron shahri","Yangiyo‘l shahri","Oqqo‘rg‘on tumani","Ohangaron tumani","Bekobod tumani","Bo‘stonliq tumani","Bo‘ka tumani","Quyichirchiq tumani","Zangiota tumani","Yuqorichirchiq tumani","Qibray tumani","Parkent tumani","Piskent tumani","O‘rtachirchiq tumani","Chinoz tumani","Yangiyo‘l tumani","Toshkent tumani"],"Farg‘ona viloyati":["Farg‘ona shahri","Qo‘qon shahri","Quvasoy shahri","Marg‘ilon shahri","Oltiariq tumani","Qo‘shtepa tumani","Bog‘dod tumani","Buvayda tumani","Beshariq tumani","Quva tumani","Uchko‘prik tumani","Rishton tumani","So‘x tumani","Toshloq tumani","O‘zbekiston tumani","Farg‘ona tumani","Dang‘ara tumani","Furqat tumani","Yozyovon tumani"],"Xorazm viloyati":["Urganch shahri","Xiva shahri","Bog‘ot tumani","Gurlan tumani","Qo‘shko‘pir tumani","Urganch tumani","Xazorasp tumani","Tuproqqal’a tumani","Xonqa tumani","Xiva tumani","Shovot tumani","Yangiariq tumani","Yangibozor tumani"],"Toshkent shahri":["Toshkent shahri","Uchtepa tumani","Bektemir tumani","Yunusobod tumani","Mirzo Ulug‘bek tumani","Mirobod tumani","Shayxontohur tumani","Olmazor tumani","Sergeli tumani","Yakkasaroy tumani","Yashnobod tumani","Yangihayot tumani","Chilonzor tumani"]}
$json$::jsonb)
), expanded as (
  select region, jsonb_array_elements_text(localities) as locality
  from region_seed
), numbered as (
  select region, locality,
    case when locality like '% shahri' then 'city' else 'district' end as kind,
    row_number() over (order by region, locality)::integer as sort_order
  from expanded
)
insert into public.uz_locations(region, locality, kind, sort_order)
select region, locality, kind, sort_order from numbered
on conflict (region, locality) do update
set kind=excluded.kind, sort_order=excluded.sort_order;

alter table public.profiles add column if not exists region text;

update public.profiles
set
  region = case
    when lower(trim(city))='baliqchi tumani' then 'Andijon viloyati'
    when lower(trim(city))='chust' then 'Namangan viloyati'
    when lower(trim(city)) in ('namangan','namangan shahar') then 'Namangan viloyati'
    when lower(trim(city)) in ('samarkand','samarqand') then 'Samarqand viloyati'
    when lower(trim(city)) in ('tashkent','toshkent','тошкент') then 'Toshkent shahri'
    else region
  end,
  city = case
    when lower(trim(city))='baliqchi tumani' then 'Baliqchi tumani'
    when lower(trim(city))='chust' then 'Chust tumani'
    when lower(trim(city)) in ('namangan','namangan shahar') then 'Namangan shahri'
    when lower(trim(city)) in ('samarkand','samarqand') then 'Samarqand shahri'
    when lower(trim(city)) in ('tashkent','toshkent','тошкент') then 'Toshkent shahri'
    else nullif(trim(city),'')
  end
where city is not null;

alter table public.profiles drop constraint if exists profiles_location_pair_check;
alter table public.profiles add constraint profiles_location_pair_check
check ((region is null and city is null) or (region is not null and city is not null));

alter table public.profiles drop constraint if exists profiles_region_city_fkey;
alter table public.profiles add constraint profiles_region_city_fkey
foreign key (region, city)
references public.uz_locations(region, locality)
on update cascade
on delete restrict;

create index if not exists profiles_region_city_idx on public.profiles(region, city);
