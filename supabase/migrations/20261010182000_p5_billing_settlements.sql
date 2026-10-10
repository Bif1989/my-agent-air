-- P5.2: manual billing settlements. This does not enforce account blocking and
-- does not integrate any external payment gateway yet.

create table if not exists public.billing_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('payment','waiver')),
  amount integer not null check (amount > 0),
  currency text not null default 'UZS' check (currency = 'UZS'),
  method text not null check (method in ('cash','bank_transfer','click','payme','other','waiver')),
  reference text,
  note text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.billing_settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.billing_settlements(id) on delete cascade,
  fee_id uuid not null references public.deal_fees(id) on delete restrict,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint billing_settlement_items_fee_key unique (fee_id)
);

create index if not exists billing_settlements_user_created_idx
  on public.billing_settlements (user_id, created_at desc);
create index if not exists billing_settlement_items_settlement_idx
  on public.billing_settlement_items (settlement_id);

alter table public.billing_settlements enable row level security;
alter table public.billing_settlement_items enable row level security;

revoke all on table public.billing_settlements from anon, authenticated;
revoke all on table public.billing_settlement_items from anon, authenticated;
grant select on table public.billing_settlements to authenticated;
grant select on table public.billing_settlement_items to authenticated;
grant select, insert, update, delete on table public.billing_settlements to service_role;
grant select, insert, update, delete on table public.billing_settlement_items to service_role;

drop policy if exists billing_settlements_select_own on public.billing_settlements;
create policy billing_settlements_select_own
  on public.billing_settlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists billing_settlement_items_select_own on public.billing_settlement_items;
create policy billing_settlement_items_select_own
  on public.billing_settlement_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.billing_settlements s
      where s.id = settlement_id
        and s.user_id = (select auth.uid())
    )
  );

create or replace function public.admin_list_billing_accounts()
returns table (
  user_id uuid,
  full_name text,
  company_name text,
  city text,
  agent_type text,
  pending_count bigint,
  outstanding_amount bigint,
  paid_count bigint,
  paid_amount bigint,
  waived_count bigint,
  waived_amount bigint,
  free_count bigint,
  latest_fee_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.company_name,
    p.city,
    p.agent_type,
    count(f.id) filter (where f.status = 'pending')::bigint,
    coalesce(sum(f.fee_amount) filter (where f.status = 'pending'), 0)::bigint,
    count(f.id) filter (where f.status = 'paid')::bigint,
    coalesce(sum(f.fee_amount) filter (where f.status = 'paid'), 0)::bigint,
    count(f.id) filter (where f.status = 'waived')::bigint,
    coalesce(sum(f.fee_amount) filter (where f.status = 'waived'), 0)::bigint,
    count(f.id) filter (where f.status = 'free')::bigint,
    max(f.deal_completed_at)
  from public.profiles p
  join public.deal_fees f on f.user_id = p.id
  where p.role = 'agent'
  group by p.id, p.full_name, p.company_name, p.city, p.agent_type
  order by
    coalesce(sum(f.fee_amount) filter (where f.status = 'pending'), 0) desc,
    max(f.deal_completed_at) desc nulls last;
end;
$$;

create or replace function public.admin_list_billing_fees(p_user_id uuid)
returns table (
  fee_id uuid,
  deal_id uuid,
  role_snapshot text,
  fee_amount integer,
  currency text,
  monthly_sequence integer,
  fee_status text,
  period_start date,
  deal_completed_at timestamptz,
  category text,
  origin text,
  destination text,
  travel_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    f.id,
    f.deal_id,
    f.role_snapshot,
    f.fee_amount,
    f.currency,
    f.monthly_sequence,
    f.status,
    f.period_start,
    f.deal_completed_at,
    r.category,
    r.origin,
    r.destination,
    r.travel_date
  from public.deal_fees f
  join public.deals d on d.id = f.deal_id
  left join public.requests r on r.id = d.request_id
  where f.user_id = p_user_id
  order by f.deal_completed_at desc, f.id desc;
end;
$$;

create or replace function public.admin_list_billing_settlements(p_user_id uuid default null)
returns table (
  settlement_id uuid,
  user_id uuid,
  full_name text,
  company_name text,
  kind text,
  amount integer,
  currency text,
  method text,
  reference text,
  note text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz,
  fee_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.user_id,
    target.full_name,
    target.company_name,
    s.kind,
    s.amount,
    s.currency,
    s.method,
    s.reference,
    s.note,
    s.recorded_by,
    coalesce(admin_profile.full_name, admin_profile.company_name, 'Administrator'),
    s.created_at,
    count(i.id)::bigint
  from public.billing_settlements s
  join public.profiles target on target.id = s.user_id
  left join public.profiles admin_profile on admin_profile.id = s.recorded_by
  left join public.billing_settlement_items i on i.settlement_id = s.id
  where p_user_id is null or s.user_id = p_user_id
  group by s.id, target.full_name, target.company_name, admin_profile.full_name, admin_profile.company_name
  order by s.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_record_billing_settlement(
  p_user_id uuid,
  p_fee_ids uuid[],
  p_kind text,
  p_method text default 'bank_transfer',
  p_reference text default null,
  p_note text default null
)
returns public.billing_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_settlement public.billing_settlements%rowtype;
  v_expected_count integer;
  v_valid_count integer;
  v_amount integer;
  v_fee public.deal_fees%rowtype;
  v_method text;
begin
  if v_admin_id is null or not exists (
    select 1
    from public.profiles p
    where p.id = v_admin_id
      and p.role = 'admin'
      and coalesce(p.is_active, false)
      and p.registration_status = 'active'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_kind not in ('payment','waiver') then
    raise exception 'invalid_settlement_kind' using errcode = '22023';
  end if;

  if p_fee_ids is null or coalesce(array_length(p_fee_ids, 1), 0) = 0 then
    raise exception 'fee_selection_required' using errcode = '22023';
  end if;

  v_expected_count := cardinality(array(select distinct x from unnest(p_fee_ids) as x));

  perform 1
  from public.deal_fees f
  where f.id = any(p_fee_ids)
  order by f.id
  for update;

  select count(*)::integer, coalesce(sum(f.fee_amount), 0)::integer
  into v_valid_count, v_amount
  from public.deal_fees f
  where f.id = any(p_fee_ids)
    and f.user_id = p_user_id
    and f.status = 'pending'
    and f.fee_amount > 0;

  if v_valid_count <> v_expected_count then
    raise exception 'fees_must_be_pending_and_owned_by_user' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.billing_settlement_items i
    where i.fee_id = any(p_fee_ids)
  ) then
    raise exception 'fee_already_settled' using errcode = '23505';
  end if;

  if p_kind = 'payment' then
    if p_method not in ('cash','bank_transfer','click','payme','other') then
      raise exception 'invalid_payment_method' using errcode = '22023';
    end if;
    v_method := p_method;
  else
    v_method := 'waiver';
  end if;

  insert into public.billing_settlements (
    user_id, kind, amount, currency, method, reference, note, recorded_by
  ) values (
    p_user_id,
    p_kind,
    v_amount,
    'UZS',
    v_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_note, '')), ''),
    v_admin_id
  )
  returning * into v_settlement;

  for v_fee in
    select *
    from public.deal_fees f
    where f.id = any(p_fee_ids)
      and f.user_id = p_user_id
      and f.status = 'pending'
    order by f.id
  loop
    insert into public.billing_settlement_items (settlement_id, fee_id, amount)
    values (v_settlement.id, v_fee.id, v_fee.fee_amount);
  end loop;

  update public.deal_fees
  set status = case when p_kind = 'payment' then 'paid' else 'waived' end,
      paid_at = case when p_kind = 'payment' then v_settlement.created_at else null end
  where id = any(p_fee_ids)
    and user_id = p_user_id
    and status = 'pending';

  return v_settlement;
end;
$$;

revoke all on function public.admin_list_billing_accounts() from public, anon;
revoke all on function public.admin_list_billing_fees(uuid) from public, anon;
revoke all on function public.admin_list_billing_settlements(uuid) from public, anon;
revoke all on function public.admin_record_billing_settlement(uuid, uuid[], text, text, text, text) from public, anon;

grant execute on function public.admin_list_billing_accounts() to authenticated, service_role;
grant execute on function public.admin_list_billing_fees(uuid) to authenticated, service_role;
grant execute on function public.admin_list_billing_settlements(uuid) to authenticated, service_role;
grant execute on function public.admin_record_billing_settlement(uuid, uuid[], text, text, text, text) to authenticated, service_role;
