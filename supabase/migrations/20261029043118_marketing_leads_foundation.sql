create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'meta' check (source in ('meta','instagram','facebook','manual','other')),
  platform text not null default 'meta' check (platform in ('meta','instagram','facebook','other')),
  campaign_name text,
  adset_name text,
  ad_name text,
  form_id text,
  leadgen_id text,
  full_name text,
  phone text,
  preferred_travel text,
  status text not null default 'new' check (status in ('new','contacted','qualified','won','lost','spam')),
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_leads_leadgen_id_uidx
  on public.marketing_leads (leadgen_id)
  where leadgen_id is not null;
create index if not exists marketing_leads_received_at_idx
  on public.marketing_leads (received_at desc);
create index if not exists marketing_leads_status_received_idx
  on public.marketing_leads (status, received_at desc);
create index if not exists marketing_leads_phone_idx
  on public.marketing_leads (phone)
  where phone is not null;

alter table public.marketing_leads enable row level security;
revoke all on table public.marketing_leads from anon, authenticated;
grant select, insert, update, delete on table public.marketing_leads to service_role;

comment on table public.marketing_leads is 'Server-ingested marketing leads, including Meta Instant Forms. Client roles have no direct access.';
comment on column public.marketing_leads.raw_payload is 'Original provider payload retained server-side for audit/debugging; never expose directly to client roles.';
