create table if not exists public.external_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_type text not null check (supplier_type in ('hotel','guide','transport','restaurant')),
  name text not null,
  region text,
  city text,
  district text,
  address text,
  phone text,
  email text,
  website text,
  telegram text,
  source_type text not null default 'manual' check (source_type in ('official_registry','open_data','public_business_contact','manual')),
  source_name text,
  source_url text,
  source_record_id text,
  source_updated_at timestamptz,
  registry_number text,
  star_rating smallint check (star_rating is null or star_rating between 1 and 5),
  capacity integer check (capacity is null or capacity >= 0),
  services text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  contact_verified boolean not null default false,
  platform_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'registry' check (status in ('registry','public_contact','contact_verified','verified','inactive')),
  opt_out boolean not null default false,
  opt_out_at timestamptz,
  last_contacted_at timestamptz,
  contact_count integer not null default 0 check (contact_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_suppliers_source_identity unique nulls not distinct (source_type, source_name, source_record_id)
);

create index if not exists external_suppliers_match_idx
  on public.external_suppliers (supplier_type, region, city, status)
  where opt_out = false and status <> 'inactive';
create index if not exists external_suppliers_phone_idx on public.external_suppliers (phone) where phone is not null;
create index if not exists external_suppliers_platform_profile_idx on public.external_suppliers (platform_profile_id) where platform_profile_id is not null;
create index if not exists external_suppliers_source_record_idx on public.external_suppliers (source_name, source_record_id) where source_record_id is not null;

create table if not exists public.supplier_invites (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  supplier_id uuid not null references public.external_suppliers(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('sms','telegram','email','whatsapp','manual')),
  recipient text,
  token_hash text not null unique,
  status text not null default 'queued' check (status in ('queued','sent','opened','responded','failed','opted_out','cancelled','expired')),
  message_preview text,
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, supplier_id, channel)
);

create index if not exists supplier_invites_request_idx on public.supplier_invites (request_id, status, created_at desc);
create index if not exists supplier_invites_supplier_idx on public.supplier_invites (supplier_id, created_at desc);
create index if not exists supplier_invites_created_by_idx on public.supplier_invites (created_by, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists external_suppliers_touch_updated_at on public.external_suppliers;
create trigger external_suppliers_touch_updated_at
before update on public.external_suppliers
for each row execute function public.touch_updated_at();

drop trigger if exists supplier_invites_touch_updated_at on public.supplier_invites;
create trigger supplier_invites_touch_updated_at
before update on public.supplier_invites
for each row execute function public.touch_updated_at();

alter table public.external_suppliers enable row level security;
alter table public.supplier_invites enable row level security;

revoke all on table public.external_suppliers from anon, authenticated;
revoke all on table public.supplier_invites from anon, authenticated;
grant select on table public.supplier_invites to authenticated;

create policy supplier_invites_owner_select
on public.supplier_invites for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and coalesce(p.is_active, false)
  )
);

create or replace function public.match_external_suppliers(
  p_supplier_type text,
  p_region text default null,
  p_city text default null,
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
  star_rating smallint,
  capacity integer,
  services text[]
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.supplier_type, s.region, s.city, s.district, s.status,
         s.contact_verified, s.source_type, s.star_rating, s.capacity, s.services
  from public.external_suppliers s
  where auth.uid() is not null
    and s.opt_out = false
    and s.status <> 'inactive'
    and s.supplier_type = p_supplier_type
    and (p_region is null or lower(coalesce(s.region,'')) = lower(p_region))
    and (p_city is null or lower(coalesce(s.city,'')) = lower(p_city))
  order by
    case s.status when 'verified' then 0 when 'contact_verified' then 1 when 'registry' then 2 else 3 end,
    s.contact_verified desc,
    s.name
  limit greatest(1, least(coalesce(p_limit,20), 100));
$$;

revoke all on function public.match_external_suppliers(text,text,text,integer) from public, anon;
grant execute on function public.match_external_suppliers(text,text,text,integer) to authenticated, service_role;
