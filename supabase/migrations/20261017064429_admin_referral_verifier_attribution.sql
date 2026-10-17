create or replace function public.admin_get_referral_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_overview jsonb;
  v_referrers jsonb;
  v_referrals jsonb;
  v_rewards jsonb;
begin
  if v_uid is null or not app_private.account_is_admin(v_uid) then
    raise exception 'admin_required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'total_referrals',count(*)::bigint,
    'qualified_referrals',count(*) filter(where status='qualified')::bigint,
    'pending_referrals',count(*) filter(where status='pending')::bigint,
    'rejected_referrals',count(*) filter(where status='rejected')::bigint,
    'total_bonus',coalesce((select sum(amount)::bigint from app_private.referral_rewards),0)
  ) into v_overview
  from app_private.referrals;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.total_bonus desc,x.direct_count desc,x.full_name),'[]'::jsonb)
  into v_referrers
  from (
    select p.id as user_id,p.full_name,p.company_name,p.phone,p.agent_type,p.is_verified,
           count(r.referred_user_id)::bigint as direct_count,
           count(r.referred_user_id) filter(where r.status='qualified')::bigint as qualified_count,
           count(r.referred_user_id) filter(where r.status='pending')::bigint as pending_count,
           count(r.referred_user_id) filter(where r.status='rejected')::bigint as rejected_count,
           coalesce(rb.level1_count,0)::bigint as level1_count,
           coalesce(rb.level2_count,0)::bigint as level2_count,
           coalesce(rb.level3_count,0)::bigint as level3_count,
           coalesce(rb.total_bonus,0)::bigint as total_bonus,
           max(r.created_at) as last_referral_at
    from public.profiles p
    left join app_private.referrals r on r.referrer_user_id=p.id
    left join lateral (
      select count(*) filter(where rr.level=1)::bigint level1_count,
             count(*) filter(where rr.level=2)::bigint level2_count,
             count(*) filter(where rr.level=3)::bigint level3_count,
             coalesce(sum(rr.amount),0)::bigint total_bonus
      from app_private.referral_rewards rr
      where rr.beneficiary_user_id=p.id
    ) rb on true
    where p.role='agent'
    group by p.id,p.full_name,p.company_name,p.phone,p.agent_type,p.is_verified,rb.level1_count,rb.level2_count,rb.level3_count,rb.total_bonus
    having count(r.referred_user_id)>0 or coalesce(rb.total_bonus,0)>0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_referrals
  from (
    select r.referred_user_id,r.referrer_user_id,r.status,r.created_at,r.qualified_at,
           rp.full_name as referrer_name,rp.company_name as referrer_company,
           tp.full_name as referred_name,tp.company_name as referred_company,tp.phone as referred_phone,tp.agent_type as referred_agent_type,tp.is_verified as referred_is_verified,
           ver.admin_id as verified_by_admin_id,ver.admin_name as verified_by_admin_name,ver.verified_at,
           coalesce((select sum(rr.amount) from app_private.referral_rewards rr where rr.referred_user_id=r.referred_user_id),0)::bigint as generated_bonus
    from app_private.referrals r
    join public.profiles rp on rp.id=r.referrer_user_id
    join public.profiles tp on tp.id=r.referred_user_id
    left join lateral (
      select al.admin_id,ap.full_name as admin_name,al.created_at as verified_at
      from public.admin_audit_log al
      join public.profiles ap on ap.id=al.admin_id
      where al.target_profile_id=r.referred_user_id
        and al.action='set_verified'
        and al.new_value='true'::jsonb
      order by al.created_at desc
      limit 1
    ) ver on true
    order by r.created_at desc
    limit 300
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rewards
  from (
    select rr.id,rr.referred_user_id,rr.beneficiary_user_id,rr.level,rr.amount,rr.created_at,
           bp.full_name as beneficiary_name,bp.company_name as beneficiary_company,
           rp.full_name as referred_name,rp.company_name as referred_company
    from app_private.referral_rewards rr
    join public.profiles bp on bp.id=rr.beneficiary_user_id
    join public.profiles rp on rp.id=rr.referred_user_id
    order by rr.created_at desc
    limit 500
  ) x;

  return jsonb_build_object('ok',true,'overview',v_overview,'referrers',v_referrers,'referrals',v_referrals,'rewards',v_rewards);
end;
$function$;

revoke all on function public.admin_get_referral_dashboard() from public,anon;
grant execute on function public.admin_get_referral_dashboard() to authenticated,service_role;
