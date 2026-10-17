create table if not exists public.admin_sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  message text not null check (char_length(trim(message)) between 1 and 480),
  provider text not null default 'eskiz' check (provider = 'eskiz'),
  status text not null default 'draft' check (status in ('draft','sending','completed','cancelled')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_sms_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.admin_sms_campaigns(id) on delete cascade,
  phone text not null check (phone ~ '^998[0-9]{9}$'),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  provider_message_id text,
  failure_reason text,
  attempts integer not null default 0 check (attempts >= 0),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone)
);

create index if not exists admin_sms_campaigns_created_at_idx
  on public.admin_sms_campaigns(created_at desc);
create index if not exists admin_sms_recipients_campaign_status_idx
  on public.admin_sms_recipients(campaign_id, status, id);

alter table public.admin_sms_campaigns enable row level security;
alter table public.admin_sms_recipients enable row level security;

revoke all on table public.admin_sms_campaigns from public, anon, authenticated;
revoke all on table public.admin_sms_recipients from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_sms_campaigns to service_role;
grant select, insert, update, delete on table public.admin_sms_recipients to service_role;

create or replace function public.claim_admin_sms_batch(p_campaign_id uuid, p_limit integer default 5)
returns setof public.admin_sms_recipients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit < 1 or p_limit > 20 then
    raise exception 'invalid_batch_size';
  end if;

  -- Recover a claim only if a previous server request died well beyond its 30s runtime window.
  update public.admin_sms_recipients
  set status = 'pending', updated_at = now()
  where campaign_id = p_campaign_id
    and status = 'processing'
    and updated_at < now() - interval '2 minutes';

  return query
  with picked as (
    select r.id
    from public.admin_sms_recipients r
    where r.campaign_id = p_campaign_id
      and r.status = 'pending'
    order by r.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.admin_sms_recipients r
    set status = 'processing', updated_at = now()
    from picked
    where r.id = picked.id
    returning r.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_admin_sms_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_admin_sms_batch(uuid, integer) to service_role;
