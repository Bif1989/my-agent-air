create table if not exists public.registration_sms_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempts integer not null default 0,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.registration_sms_otps enable row level security;
revoke all on table public.registration_sms_otps from anon, authenticated;
create index if not exists registration_sms_otps_phone_created_idx on public.registration_sms_otps (phone, created_at desc);
create index if not exists registration_sms_otps_expires_idx on public.registration_sms_otps (expires_at);
