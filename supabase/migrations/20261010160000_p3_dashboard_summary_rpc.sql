-- P3: collapse the dashboard's profile + four counters into one authenticated RPC.
-- The dashboard no longer needs to fetch unused recent requests or announcements.

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with current_profile as (
    select p.full_name,p.company_name,p.city,p.phone,p.agent_type,p.is_verified
    from public.profiles p
    where p.id=auth.uid()
    limit 1
  ), stats as (
    select jsonb_build_object(
      'openRequests',(
        select count(*)
        from public.requests r
        where r.status='open'
          and (
            r.travel_date >= timezone('Asia/Tashkent',now())::date
            or (r.travel_date is null and r.created_at >= now()-interval '30 days')
          )
      ),
      'offers',(
        select count(*)
        from public.offers o
        where o.agent_id=auth.uid()
      ),
      'deals',(
        select count(*)
        from public.deals d
        where d.status in ('accepted','processing','issued')
      ),
      'agents',(
        select count(*)
        from public.profiles p
        where p.is_active is true
      )
    ) as value
  )
  select jsonb_build_object(
    'profile',(select to_jsonb(p) from current_profile p),
    'stats',(select value from stats)
  );
$$;

revoke all on function public.get_dashboard_summary() from public,anon;
grant execute on function public.get_dashboard_summary() to authenticated,service_role;
