create table if not exists public.marketing_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.marketing_leads(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','status_changed','note_updated')),
  old_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists marketing_lead_events_lead_created_idx on public.marketing_lead_events(lead_id, created_at desc);
alter table public.marketing_lead_events enable row level security;
revoke all on table public.marketing_lead_events from anon, authenticated;
grant select, insert on table public.marketing_lead_events to service_role;

create or replace function public.admin_list_marketing_leads(
  p_status text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  id uuid,
  source text,
  platform text,
  campaign_name text,
  adset_name text,
  ad_name text,
  form_id text,
  leadgen_id text,
  full_name text,
  phone text,
  preferred_travel text,
  status text,
  notes text,
  received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not app_private.account_is_admin(v_uid) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('new','contacted','qualified','won','lost','spam') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return query
  select l.id,l.source,l.platform,l.campaign_name,l.adset_name,l.ad_name,l.form_id,l.leadgen_id,
         l.full_name,l.phone,l.preferred_travel,l.status,l.notes,l.received_at,l.created_at,l.updated_at
  from public.marketing_leads l
  where (p_status is null or l.status = p_status)
    and (nullif(btrim(coalesce(p_search,'')), '') is null
      or coalesce(l.full_name,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(l.phone,'') ilike '%' || btrim(p_search) || '%'
      or coalesce(l.campaign_name,'') ilike '%' || btrim(p_search) || '%')
  order by l.received_at desc, l.id desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.admin_update_marketing_lead(
  p_id uuid,
  p_status text,
  p_notes text default null
)
returns table(
  id uuid,
  status text,
  notes text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old_status text;
  v_old_notes text;
begin
  if v_uid is null or not app_private.account_is_admin(v_uid) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_status not in ('new','contacted','qualified','won','lost','spam') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select l.status,l.notes into v_old_status,v_old_notes from public.marketing_leads l where l.id=p_id for update;
  if not found then raise exception 'lead_not_found' using errcode='P0002'; end if;

  update public.marketing_leads l
  set status=p_status,
      notes=nullif(btrim(coalesce(p_notes,'')), ''),
      updated_at=now()
  where l.id=p_id;

  if v_old_status is distinct from p_status then
    insert into public.marketing_lead_events(lead_id,admin_id,event_type,old_status,new_status,note)
    values(p_id,v_uid,'status_changed',v_old_status,p_status,nullif(btrim(coalesce(p_notes,'')),''));
  elsif v_old_notes is distinct from nullif(btrim(coalesce(p_notes,'')), '') then
    insert into public.marketing_lead_events(lead_id,admin_id,event_type,old_status,new_status,note)
    values(p_id,v_uid,'note_updated',v_old_status,p_status,nullif(btrim(coalesce(p_notes,'')),''));
  end if;

  return query select l.id,l.status,l.notes,l.updated_at from public.marketing_leads l where l.id=p_id;
end;
$$;

revoke all on function public.admin_list_marketing_leads(text,text,integer,integer) from public, anon;
revoke all on function public.admin_update_marketing_lead(uuid,text,text) from public, anon;
grant execute on function public.admin_list_marketing_leads(text,text,integer,integer) to authenticated;
grant execute on function public.admin_update_marketing_lead(uuid,text,text) to authenticated;
