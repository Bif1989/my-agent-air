create or replace function public.enforce_active_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    if current_user in ('postgres','supabase_admin','service_role') then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or not coalesce(v_profile.is_active,false) or v_profile.registration_status <> 'active' then
    raise exception 'account_inactive_or_incomplete' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and tg_table_name in ('requests','offers') and
    (nullif(trim(v_profile.full_name),'') is null or nullif(trim(v_profile.company_name),'') is null or nullif(trim(v_profile.phone),'') is null
      or nullif(trim(v_profile.city),'') is null or nullif(trim(v_profile.agent_type),'') is null or v_profile.agent_type = 'agent') then
    raise exception 'profile_incomplete' using errcode = '42501';
  end if;

  if tg_op <> 'DELETE' then
    if tg_table_name in ('messages','chat_messages') then
      if current_user in ('authenticated','anon') and new.message_type = 'system' then
        raise exception 'system_message_forbidden' using errcode = '42501';
      end if;
    end if;

    if tg_table_name = 'requests' then
      if tg_op = 'INSERT' then new.created_at := now(); end if;
      if new.status = 'open' and not public.request_is_current(new.travel_date,new.created_at) then
        raise exception 'request_expired' using errcode = '22023';
      end if;
    end if;

    if tg_table_name = 'offers' then
      if new.status = 'pending' and not exists (
        select 1 from public.requests r
        where r.id = new.request_id and r.status = 'open'
          and public.request_is_current(r.travel_date,r.created_at)
      ) then
        raise exception 'request_expired' using errcode = '22023';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
