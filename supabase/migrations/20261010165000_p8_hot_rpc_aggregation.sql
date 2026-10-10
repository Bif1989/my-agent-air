-- P8 final performance pass.
-- Preserve RPC signatures and result shapes while replacing repeated per-row scans
-- with one-pass aggregates over only the rows needed by each request.

create or replace function public.list_messenger_conversations()
returns table(
  room_id uuid,
  room_type text,
  title text,
  slug text,
  counterpart_id uuid,
  counterpart_full_name text,
  counterpart_company_name text,
  counterpart_city text,
  counterpart_is_verified boolean,
  last_message text,
  last_message_type text,
  last_message_at timestamptz,
  last_sender_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as materialized (
    select auth.uid() as uid
  ),
  accessible as materialized (
    select r.id,r.room_type,r.title,r.slug,r.updated_at,r.created_at,m.last_read_at,m.joined_at
    from public.chat_rooms r
    cross join me
    left join public.chat_room_members m on m.room_id=r.id and m.user_id=me.uid
    where me.uid is not null
      and app_private.account_is_active(me.uid)
      and r.is_active=true
      and (r.room_type='public' or m.user_id is not null)
  ),
  latest as (
    select distinct on (cm.room_id)
      cm.room_id,cm.message,cm.message_type,cm.created_at,cm.sender_id
    from public.chat_messages cm
    join accessible a on a.id=cm.room_id
    where cm.deleted_at is null
    order by cm.room_id,cm.created_at desc,cm.id desc
  ),
  unread as (
    select cm.room_id,count(*)::bigint as unread_count
    from public.chat_messages cm
    join accessible a on a.id=cm.room_id
    cross join me
    where cm.deleted_at is null
      and cm.sender_id<>me.uid
      and cm.created_at>coalesce(a.last_read_at,a.joined_at,now())
    group by cm.room_id
  )
  select
    a.id,a.room_type,a.title,a.slug,
    cp.id,cp.full_name,cp.company_name,cp.city,cp.is_verified,
    lm.message,lm.message_type,lm.created_at,lm.sender_id,
    coalesce(u.unread_count,0)::bigint
  from accessible a
  cross join me
  left join lateral (
    select p.id,p.full_name,p.company_name,p.city,p.is_verified
    from public.chat_room_members om
    join public.profiles p on p.id=om.user_id
    where a.room_type='direct' and om.room_id=a.id and om.user_id<>me.uid
    limit 1
  ) cp on true
  left join latest lm on lm.room_id=a.id
  left join unread u on u.room_id=a.id
  order by
    case when a.room_type='public' and a.slug='umumiy' then 0 else 1 end,
    coalesce(lm.created_at,a.updated_at,a.created_at) desc;
$$;

create or replace function public.list_feed_posts(
  p_category text default null::text,
  p_post_type text default null::text,
  p_search text default null::text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  author_id uuid,
  post_type text,
  category text,
  title text,
  body text,
  origin text,
  destination text,
  price numeric,
  currency text,
  contact_phone text,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  author_full_name text,
  author_company_name text,
  author_city text,
  author_avatar_url text,
  author_is_verified boolean,
  comment_count bigint,
  like_count bigint,
  fire_count bigint,
  deal_count bigint,
  my_reaction text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as materialized (
    select
      p.id,p.author_id,p.post_type,p.category,p.title,p.body,p.origin,p.destination,p.price,p.currency,
      p.contact_phone,p.status,p.expires_at,p.created_at,p.updated_at,p.edited_at,
      a.full_name as author_full_name,a.company_name as author_company_name,a.city as author_city,
      a.avatar_url as author_avatar_url,a.is_verified as author_is_verified
    from public.posts p
    join public.profiles a on a.id=p.author_id
    where p.status <> 'deleted'
      and (p_category is null or p.category=p_category)
      and (p_post_type is null or p.post_type=p_post_type)
      and (
        p_search is null or trim(p_search)='' or
        coalesce(p.title,'') ilike '%'||trim(p_search)||'%' or
        p.body ilike '%'||trim(p_search)||'%' or
        coalesce(p.origin,'') ilike '%'||trim(p_search)||'%' or
        coalesce(p.destination,'') ilike '%'||trim(p_search)||'%' or
        coalesce(a.full_name,'') ilike '%'||trim(p_search)||'%' or
        coalesce(a.company_name,'') ilike '%'||trim(p_search)||'%'
      )
    order by p.created_at desc
    limit greatest(1,least(coalesce(p_limit,20),50))
    offset greatest(coalesce(p_offset,0),0)
  ),
  comments as (
    select c.post_id,count(*)::bigint as comment_count
    from public.post_comments c
    join base b on b.id=c.post_id
    where c.deleted_at is null
    group by c.post_id
  ),
  reactions as (
    select
      r.post_id,
      count(*) filter (where r.reaction='like')::bigint as like_count,
      count(*) filter (where r.reaction='fire')::bigint as fire_count,
      count(*) filter (where r.reaction='deal')::bigint as deal_count,
      max(r.reaction) filter (where r.user_id=(select auth.uid())) as my_reaction
    from public.post_reactions r
    join base b on b.id=r.post_id
    group by r.post_id
  )
  select
    b.id,b.author_id,b.post_type,b.category,b.title,b.body,b.origin,b.destination,b.price,b.currency,
    b.contact_phone,b.status,b.expires_at,b.created_at,b.updated_at,b.edited_at,
    b.author_full_name,b.author_company_name,b.author_city,b.author_avatar_url,b.author_is_verified,
    coalesce(c.comment_count,0)::bigint,
    coalesce(r.like_count,0)::bigint,
    coalesce(r.fire_count,0)::bigint,
    coalesce(r.deal_count,0)::bigint,
    r.my_reaction
  from base b
  left join comments c on c.post_id=b.id
  left join reactions r on r.post_id=b.id
  order by b.created_at desc;
$$;
