-- P6.1 Trust & Quality: reviews are possible only after a real completed deal.
-- Trust stats are server-controlled and cannot be edited directly by authenticated clients.

create table if not exists public.deal_reviews (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint deal_reviews_one_per_reviewer unique (deal_id, reviewer_id),
  constraint deal_reviews_not_self check (reviewer_id <> reviewee_id),
  constraint deal_reviews_comment_length check (comment is null or char_length(comment) <= 1000)
);

create index if not exists deal_reviews_reviewee_created_idx
  on public.deal_reviews (reviewee_id, created_at desc);
create index if not exists deal_reviews_reviewer_created_idx
  on public.deal_reviews (reviewer_id, created_at desc);

create table if not exists public.profile_trust_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  review_count integer not null default 0 check (review_count >= 0),
  rating_average numeric(3,2),
  completed_deals integer not null default 0 check (completed_deals >= 0),
  trust_score integer not null default 30 check (trust_score between 0 and 100),
  updated_at timestamptz not null default now(),
  constraint profile_trust_rating_check check (rating_average is null or rating_average between 1 and 5)
);

alter table public.deal_reviews enable row level security;
alter table public.profile_trust_stats enable row level security;

revoke all on table public.deal_reviews from anon, authenticated;
revoke all on table public.profile_trust_stats from anon, authenticated;
grant select on table public.profile_trust_stats to authenticated;
grant select, insert, update, delete on table public.deal_reviews to service_role;
grant select, insert, update, delete on table public.profile_trust_stats to service_role;

drop policy if exists profile_trust_stats_authenticated_read on public.profile_trust_stats;
create policy profile_trust_stats_authenticated_read
  on public.profile_trust_stats
  for select
  to authenticated
  using ((select auth.uid()) is not null);

create or replace function app_private.refresh_profile_trust_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified boolean := false;
  v_completed integer := 0;
  v_review_count integer := 0;
  v_rating numeric(3,2);
  v_score integer := 30;
begin
  if p_user_id is null then return; end if;

  select coalesce(p.is_verified, false)
    into v_verified
  from public.profiles p
  where p.id = p_user_id;

  if not found then return; end if;

  select count(*)::integer
    into v_completed
  from public.deals d
  where d.status = 'completed'
    and (d.buyer_id = p_user_id or d.seller_id = p_user_id);

  select count(*)::integer, round(avg(r.rating)::numeric, 2)
    into v_review_count, v_rating
  from public.deal_reviews r
  where r.reviewee_id = p_user_id;

  v_score := least(
    100,
    30
      + case when v_verified then 15 else 0 end
      + least(v_completed, 10) * 2
      + case
          when v_review_count > 0 and v_rating is not null
            then round(((v_rating - 1) / 4) * 35)::integer
          else 0
        end
  );

  insert into public.profile_trust_stats (
    user_id, review_count, rating_average, completed_deals, trust_score, updated_at
  ) values (
    p_user_id, v_review_count, v_rating, v_completed, v_score, now()
  )
  on conflict (user_id) do update set
    review_count = excluded.review_count,
    rating_average = excluded.rating_average,
    completed_deals = excluded.completed_deals,
    trust_score = excluded.trust_score,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function app_private.refresh_profile_trust_stats(uuid) from public, anon, authenticated;
grant execute on function app_private.refresh_profile_trust_stats(uuid) to service_role;

create or replace function app_private.refresh_deal_participant_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform app_private.refresh_profile_trust_stats(new.buyer_id);
    perform app_private.refresh_profile_trust_stats(new.seller_id);
  end if;
  return new;
end;
$$;

revoke all on function app_private.refresh_deal_participant_trust() from public, anon, authenticated;

drop trigger if exists trg_deals_refresh_trust on public.deals;
create trigger trg_deals_refresh_trust
  after insert or update of status on public.deals
  for each row execute function app_private.refresh_deal_participant_trust();

create or replace function app_private.refresh_reviewee_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.refresh_profile_trust_stats(new.reviewee_id);
  return new;
end;
$$;

revoke all on function app_private.refresh_reviewee_trust() from public, anon, authenticated;

drop trigger if exists trg_deal_reviews_refresh_trust on public.deal_reviews;
create trigger trg_deal_reviews_refresh_trust
  after insert on public.deal_reviews
  for each row execute function app_private.refresh_reviewee_trust();

create or replace function app_private.refresh_verified_profile_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_verified is distinct from new.is_verified then
    perform app_private.refresh_profile_trust_stats(new.id);
  end if;
  return new;
end;
$$;

revoke all on function app_private.refresh_verified_profile_trust() from public, anon, authenticated;

drop trigger if exists trg_profiles_refresh_trust on public.profiles;
create trigger trg_profiles_refresh_trust
  after update of is_verified on public.profiles
  for each row execute function app_private.refresh_verified_profile_trust();

create or replace function public.submit_deal_review(
  p_deal_id uuid,
  p_rating integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_reviewee uuid;
  v_comment text;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not app_private.account_is_active(v_uid) then
    raise exception 'account_inactive_or_incomplete' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = '22023';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for share;

  if not found then
    raise exception 'deal_not_found' using errcode = 'P0002';
  end if;
  if v_deal.status <> 'completed' then
    raise exception 'deal_not_completed' using errcode = 'P0001';
  end if;
  if v_uid <> v_deal.buyer_id and v_uid <> v_deal.seller_id then
    raise exception 'not_deal_participant' using errcode = '42501';
  end if;

  v_reviewee := case when v_uid = v_deal.buyer_id then v_deal.seller_id else v_deal.buyer_id end;
  if v_reviewee is null or v_reviewee = v_uid then
    raise exception 'invalid_reviewee' using errcode = '22023';
  end if;

  v_comment := nullif(trim(coalesce(p_comment, '')), '');
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;

  begin
    insert into public.deal_reviews (deal_id, reviewer_id, reviewee_id, rating, comment)
    values (p_deal_id, v_uid, v_reviewee, p_rating::smallint, v_comment)
    returning id into v_review_id;
  exception when unique_violation then
    raise exception 'review_already_submitted' using errcode = '23505';
  end;

  insert into public.activity_log (deal_id, request_id, actor_id, event_type, event_data)
  values (
    v_deal.id,
    v_deal.request_id,
    v_uid,
    'deal_review_submitted',
    jsonb_build_object('reviewee_id', v_reviewee, 'rating', p_rating)
  );

  return v_review_id;
end;
$$;

revoke all on function public.submit_deal_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_deal_review(uuid, integer, text) to authenticated, service_role;

create or replace function public.get_my_deal_review(p_deal_id uuid)
returns table (
  id uuid,
  deal_id uuid,
  reviewee_id uuid,
  rating smallint,
  comment text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not app_private.account_is_active(v_uid) then
    raise exception 'account_inactive_or_incomplete' using errcode = '42501';
  end if;

  return query
  select r.id, r.deal_id, r.reviewee_id, r.rating, r.comment, r.created_at
  from public.deal_reviews r
  where r.deal_id = p_deal_id and r.reviewer_id = v_uid
  limit 1;
end;
$$;

revoke all on function public.get_my_deal_review(uuid) from public, anon;
grant execute on function public.get_my_deal_review(uuid) to authenticated, service_role;

create or replace function public.list_agent_reviews(
  p_user_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  deal_id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_id uuid,
  reviewer_name text,
  reviewer_company text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not app_private.account_is_active(v_uid) then
    raise exception 'account_inactive_or_incomplete' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_active is true and p.registration_status = 'active'
  ) then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  return query
  select
    r.id,
    r.deal_id,
    r.rating,
    r.comment,
    r.created_at,
    r.reviewer_id,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.company_name), ''), 'Agent') as reviewer_name,
    p.company_name as reviewer_company
  from public.deal_reviews r
  join public.profiles p on p.id = r.reviewer_id
  where r.reviewee_id = p_user_id
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

revoke all on function public.list_agent_reviews(uuid, integer) from public, anon;
grant execute on function public.list_agent_reviews(uuid, integer) to authenticated, service_role;

-- Backfill current stats without multiplying completed-deal and review aggregates.
with deal_counts as (
  select participant_id as user_id, count(*)::integer as completed_deals
  from (
    select d.buyer_id as participant_id from public.deals d where d.status = 'completed' and d.buyer_id is not null
    union all
    select d.seller_id as participant_id from public.deals d where d.status = 'completed' and d.seller_id is not null
  ) participants
  group by participant_id
), review_counts as (
  select r.reviewee_id as user_id, count(*)::integer as review_count, round(avg(r.rating)::numeric, 2) as rating_average
  from public.deal_reviews r
  group by r.reviewee_id
)
insert into public.profile_trust_stats (user_id, review_count, rating_average, completed_deals, trust_score, updated_at)
select
  p.id,
  coalesce(r.review_count, 0),
  r.rating_average,
  coalesce(d.completed_deals, 0),
  least(
    100,
    30
      + case when coalesce(p.is_verified, false) then 15 else 0 end
      + least(coalesce(d.completed_deals, 0), 10) * 2
      + case
          when coalesce(r.review_count, 0) > 0 and r.rating_average is not null
            then round(((r.rating_average - 1) / 4) * 35)::integer
          else 0
        end
  ),
  now()
from public.profiles p
left join deal_counts d on d.user_id = p.id
left join review_counts r on r.user_id = p.id
on conflict (user_id) do update set
  review_count = excluded.review_count,
  rating_average = excluded.rating_average,
  completed_deals = excluded.completed_deals,
  trust_score = excluded.trust_score,
  updated_at = excluded.updated_at;
