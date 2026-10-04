-- Read-only catalog export from fsemjqlreuzvpyvbmxzt, 2026-10-04, before resume_security.

-- Bootstrap/reference for a fresh Supabase database. Never apply over the existing project.

-- Contains schema and grants only; auth users, application rows and push secrets are excluded.

begin;

set local search_path = public, extensions;

create extension if not exists pg_net with schema extensions;

create schema if not exists private_push;

revoke all on schema private_push from public, anon, authenticated;

create table private_push.config (
  "singleton" boolean default true not null,
  "webhook_secret" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null,
  primary key (singleton)
);

insert into private_push.config(singleton,webhook_secret) values(true,'');

create table public."requests" (
  "id" uuid default gen_random_uuid() not null,
  "created_by" uuid not null,
  "category" text not null,
  "origin" text,
  "destination" text,
  "travel_date" date,
  "adults" integer default 1,
  "children" integer default 0,
  "infants" integer default 0,
  "baggage" text,
  "budget" numeric(12,2),
  "currency" text default 'USD'::text,
  "description" text,
  "status" text default 'open'::text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."offers" (
  "id" uuid default gen_random_uuid() not null,
  "request_id" uuid not null,
  "agent_id" uuid not null,
  "price" numeric(12,2),
  "currency" text default 'USD'::text,
  "airline" text,
  "baggage" text,
  "comment" text,
  "status" text default 'pending'::text,
  "created_at" timestamp with time zone default now()
);

create table public."deals" (
  "id" uuid default gen_random_uuid() not null,
  "request_id" uuid not null,
  "offer_id" uuid not null,
  "buyer_id" uuid not null,
  "seller_id" uuid not null,
  "agreed_price" numeric(12,2),
  "currency" text default 'USD'::text,
  "status" text default 'accepted'::text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

create table public."messages" (
  "id" uuid default gen_random_uuid() not null,
  "deal_id" uuid not null,
  "sender_id" uuid not null,
  "message" text not null,
  "message_type" text default 'text'::text,
  "created_at" timestamp with time zone default now(),
  "read_at" timestamp with time zone
);

create table public."activity_log" (
  "id" bigint generated always as identity not null,
  "deal_id" uuid,
  "request_id" uuid,
  "actor_id" uuid,
  "event_type" text not null,
  "event_data" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now()
);

create table public."profiles" (
  "id" uuid not null,
  "full_name" text not null,
  "avatar_url" text,
  "company_name" text,
  "city" text,
  "phone" text,
  "agent_type" text default 'agent'::text,
  "services" text[] default '{}'::text[],
  "is_verified" boolean default false,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "role" text default 'agent'::text not null
);

create table public."verification_requests" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "request_note" text,
  "status" text default 'pending'::text not null,
  "review_note" text,
  "created_at" timestamp with time zone default now() not null,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid
);

create table public."admin_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "admin_id" uuid not null,
  "target_profile_id" uuid not null,
  "action" text not null,
  "old_value" boolean,
  "new_value" boolean not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."chat_room_members" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "member_role" text default 'member'::text not null,
  "joined_at" timestamp with time zone default now() not null,
  "last_read_at" timestamp with time zone
);

create table public."chat_messages" (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid not null,
  "sender_id" uuid not null,
  "message" text not null,
  "message_type" text default 'text'::text not null,
  "reply_to_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table public."chat_rooms" (
  "id" uuid default gen_random_uuid() not null,
  "room_type" text not null,
  "title" text,
  "slug" text,
  "direct_key" text,
  "created_by" uuid,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "description" text
);

create table public."posts" (
  "id" uuid default gen_random_uuid() not null,
  "author_id" uuid not null,
  "post_type" text default 'post'::text not null,
  "category" text default 'boshqa'::text not null,
  "title" text,
  "body" text not null,
  "origin" text,
  "destination" text,
  "price" numeric,
  "currency" text default 'USD'::text not null,
  "contact_phone" text,
  "status" text default 'active'::text not null,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "edited_at" timestamp with time zone
);

create table public."post_comments" (
  "id" uuid default gen_random_uuid() not null,
  "post_id" uuid not null,
  "author_id" uuid not null,
  "body" text not null,
  "created_at" timestamp with time zone default now() not null,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

create table public."post_reactions" (
  "post_id" uuid not null,
  "user_id" uuid not null,
  "reaction" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."push_subscriptions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "endpoint" text not null,
  "p256dh" text not null,
  "auth_key" text not null,
  "created_at" timestamp with time zone default now() not null,
  "last_seen_at" timestamp with time zone default now() not null
);

create table public."notification_preferences" (
  "user_id" uuid not null,
  "chat_messages" boolean default true not null,
  "deal_messages" boolean default true not null,
  "offers" boolean default true not null,
  "new_requests" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."vk_identities" (
  "vk_user_id" bigint not null,
  "user_id" uuid not null,
  "first_name" text,
  "last_name" text,
  "photo_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table public."requests" add constraint "requests_adults_check" CHECK ((adults >= 0));

alter table public."requests" add constraint "requests_children_check" CHECK ((children >= 0));

alter table public."requests" add constraint "requests_infants_check" CHECK ((infants >= 0));

alter table public."requests" add constraint "requests_pkey" PRIMARY KEY (id);

alter table public."requests" add constraint "requests_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'closed'::text, 'cancelled'::text])));

alter table public."offers" add constraint "offers_pkey" PRIMARY KEY (id);

alter table public."offers" add constraint "offers_request_id_agent_id_key" UNIQUE (request_id, agent_id);

alter table public."offers" add constraint "offers_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])));

alter table public."deals" add constraint "deals_pkey" PRIMARY KEY (id);

alter table public."deals" add constraint "deals_status_check" CHECK ((status = ANY (ARRAY['accepted'::text, 'processing'::text, 'issued'::text, 'completed'::text, 'cancelled'::text])));

alter table public."messages" add constraint "messages_message_nonempty" CHECK (((char_length(btrim(message)) >= 1) AND (char_length(btrim(message)) <= 4000)));

alter table public."messages" add constraint "messages_message_type_check" CHECK ((message_type = ANY (ARRAY['text'::text, 'system'::text, 'ticket'::text, 'pnr'::text, 'file'::text])));

alter table public."messages" add constraint "messages_pkey" PRIMARY KEY (id);

alter table public."activity_log" add constraint "activity_log_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['agent'::text, 'admin'::text])));

alter table public."verification_requests" add constraint "verification_requests_pkey" PRIMARY KEY (id);

alter table public."verification_requests" add constraint "verification_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

alter table public."admin_audit_log" add constraint "admin_audit_log_action_check" CHECK ((action = ANY (ARRAY['set_verified'::text, 'set_active'::text])));

alter table public."admin_audit_log" add constraint "admin_audit_log_pkey" PRIMARY KEY (id);

alter table public."chat_room_members" add constraint "chat_room_members_member_role_check" CHECK ((member_role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));

alter table public."chat_room_members" add constraint "chat_room_members_pkey" PRIMARY KEY (room_id, user_id);

alter table public."chat_messages" add constraint "chat_messages_length_check" CHECK (((char_length(TRIM(BOTH FROM message)) >= 1) AND (char_length(TRIM(BOTH FROM message)) <= 4000)));

alter table public."chat_messages" add constraint "chat_messages_message_type_check" CHECK ((message_type = ANY (ARRAY['text'::text, 'system'::text, 'file'::text])));

alter table public."chat_messages" add constraint "chat_messages_pkey" PRIMARY KEY (id);

alter table public."chat_rooms" add constraint "chat_rooms_description_length_check" CHECK (((description IS NULL) OR (char_length(description) <= 500)));

alter table public."chat_rooms" add constraint "chat_rooms_direct_key_key" UNIQUE (direct_key);

alter table public."chat_rooms" add constraint "chat_rooms_pkey" PRIMARY KEY (id);

alter table public."chat_rooms" add constraint "chat_rooms_room_type_check" CHECK ((room_type = ANY (ARRAY['public'::text, 'direct'::text, 'group'::text])));

alter table public."chat_rooms" add constraint "chat_rooms_shape_check" CHECK ((((room_type = 'public'::text) AND (title IS NOT NULL) AND (slug IS NOT NULL) AND (direct_key IS NULL)) OR ((room_type = 'direct'::text) AND (direct_key IS NOT NULL) AND (slug IS NULL)) OR ((room_type = 'group'::text) AND (title IS NOT NULL) AND (slug IS NULL) AND (direct_key IS NULL))));

alter table public."chat_rooms" add constraint "chat_rooms_slug_key" UNIQUE (slug);

alter table public."posts" add constraint "posts_body_length_check" CHECK (((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 5000)));

alter table public."posts" add constraint "posts_category_check" CHECK ((category = ANY (ARRAY['aviachipta'::text, 'tur_paket'::text, 'mehmonxona'::text, 'transfer'::text, 'viza'::text, 'umra'::text, 'hamkorlik'::text, 'boshqa'::text])));

alter table public."posts" add constraint "posts_currency_check" CHECK ((currency = ANY (ARRAY['USD'::text, 'UZS'::text, 'EUR'::text, 'RUB'::text])));

alter table public."posts" add constraint "posts_destination_length_check" CHECK (((destination IS NULL) OR (char_length(destination) <= 120)));

alter table public."posts" add constraint "posts_origin_length_check" CHECK (((origin IS NULL) OR (char_length(origin) <= 120)));

alter table public."posts" add constraint "posts_phone_length_check" CHECK (((contact_phone IS NULL) OR (char_length(contact_phone) <= 40)));

alter table public."posts" add constraint "posts_pkey" PRIMARY KEY (id);

alter table public."posts" add constraint "posts_post_type_check" CHECK ((post_type = ANY (ARRAY['post'::text, 'announcement'::text])));

alter table public."posts" add constraint "posts_price_check" CHECK (((price IS NULL) OR (price >= (0)::numeric)));

alter table public."posts" add constraint "posts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text, 'deleted'::text])));

alter table public."posts" add constraint "posts_title_length_check" CHECK (((title IS NULL) OR ((char_length(TRIM(BOTH FROM title)) >= 1) AND (char_length(TRIM(BOTH FROM title)) <= 180))));

alter table public."post_comments" add constraint "post_comments_body_length_check" CHECK (((char_length(TRIM(BOTH FROM body)) >= 1) AND (char_length(TRIM(BOTH FROM body)) <= 2000)));

alter table public."post_comments" add constraint "post_comments_pkey" PRIMARY KEY (id);

alter table public."post_reactions" add constraint "post_reactions_pkey" PRIMARY KEY (post_id, user_id);

alter table public."post_reactions" add constraint "post_reactions_reaction_check" CHECK ((reaction = ANY (ARRAY['like'::text, 'fire'::text, 'deal'::text])));

alter table public."push_subscriptions" add constraint "push_subscriptions_endpoint_key" UNIQUE (endpoint);

alter table public."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY (id);

alter table public."notification_preferences" add constraint "notification_preferences_pkey" PRIMARY KEY (user_id);

alter table public."vk_identities" add constraint "vk_identities_pkey" PRIMARY KEY (vk_user_id);

alter table public."vk_identities" add constraint "vk_identities_user_id_key" UNIQUE (user_id);

alter table public."requests" add constraint "requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."offers" add constraint "offers_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."offers" add constraint "offers_request_id_fkey" FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;

alter table public."deals" add constraint "deals_buyer_id_fkey" FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."deals" add constraint "deals_offer_id_fkey" FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE RESTRICT;

alter table public."deals" add constraint "deals_request_id_fkey" FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE RESTRICT;

alter table public."deals" add constraint "deals_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."messages" add constraint "messages_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;

alter table public."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."activity_log" add constraint "activity_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."activity_log" add constraint "activity_log_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE RESTRICT;

alter table public."activity_log" add constraint "activity_log_request_id_fkey" FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE RESTRICT;

alter table public."profiles" add constraint "profiles_id_auth_users_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."verification_requests" add constraint "verification_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."verification_requests" add constraint "verification_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."admin_audit_log" add constraint "admin_audit_log_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."admin_audit_log" add constraint "admin_audit_log_target_profile_id_fkey" FOREIGN KEY (target_profile_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."chat_room_members" add constraint "chat_room_members_room_id_fkey" FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;

alter table public."chat_room_members" add constraint "chat_room_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."chat_messages" add constraint "chat_messages_reply_to_id_fkey" FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL;

alter table public."chat_messages" add constraint "chat_messages_room_id_fkey" FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;

alter table public."chat_messages" add constraint "chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."chat_rooms" add constraint "chat_rooms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."posts" add constraint "posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."post_comments" add constraint "post_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."post_comments" add constraint "post_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

alter table public."post_reactions" add constraint "post_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

alter table public."post_reactions" add constraint "post_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."notification_preferences" add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."vk_identities" add constraint "vk_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_requests_created ON public.requests USING btree (created_at DESC);

CREATE INDEX idx_requests_status ON public.requests USING btree (status);

CREATE INDEX idx_requests_category ON public.requests USING btree (category);

CREATE INDEX idx_requests_route ON public.requests USING btree (origin, destination);

CREATE INDEX idx_requests_created_by ON public.requests USING btree (created_by);

CREATE INDEX idx_offers_agent_id ON public.offers USING btree (agent_id);

CREATE INDEX idx_offers_request ON public.offers USING btree (request_id);

CREATE UNIQUE INDEX deals_one_per_request_idx ON public.deals USING btree (request_id);

CREATE INDEX idx_deals_seller_id ON public.deals USING btree (seller_id);

CREATE INDEX idx_deals_offer_id ON public.deals USING btree (offer_id);

CREATE UNIQUE INDEX deals_one_per_offer_idx ON public.deals USING btree (offer_id);

CREATE INDEX idx_deals_buyer_id ON public.deals USING btree (buyer_id);

CREATE INDEX idx_deals_request_id ON public.deals USING btree (request_id);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_messages_unread_by_deal ON public.messages USING btree (deal_id, created_at) WHERE (read_at IS NULL);

CREATE INDEX idx_messages_deal_created_at ON public.messages USING btree (deal_id, created_at DESC);

CREATE INDEX idx_messages_deal ON public.messages USING btree (deal_id, created_at);

CREATE INDEX idx_activity_actor_id ON public.activity_log USING btree (actor_id);

CREATE INDEX idx_activity_deal ON public.activity_log USING btree (deal_id, created_at);

CREATE INDEX idx_activity_request_id ON public.activity_log USING btree (request_id);

CREATE INDEX idx_profiles_agent_type ON public.profiles USING btree (agent_type);

CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);

CREATE INDEX idx_profiles_city ON public.profiles USING btree (city);

CREATE INDEX idx_profiles_created_at ON public.profiles USING btree (created_at DESC);

CREATE INDEX idx_verification_requests_reviewed_by ON public.verification_requests USING btree (reviewed_by);

CREATE UNIQUE INDEX verification_requests_one_pending_per_user ON public.verification_requests USING btree (user_id) WHERE (status = 'pending'::text);

CREATE INDEX idx_verification_requests_user_id ON public.verification_requests USING btree (user_id);

CREATE INDEX idx_verification_requests_status_created_at ON public.verification_requests USING btree (status, created_at DESC);

CREATE INDEX idx_admin_audit_log_admin_id ON public.admin_audit_log USING btree (admin_id);

CREATE INDEX idx_admin_audit_log_target_profile_id ON public.admin_audit_log USING btree (target_profile_id);

CREATE INDEX idx_chat_room_members_user ON public.chat_room_members USING btree (user_id, room_id);

CREATE INDEX idx_chat_messages_sender ON public.chat_messages USING btree (sender_id);

CREATE INDEX idx_chat_messages_room_created ON public.chat_messages USING btree (room_id, created_at);

CREATE INDEX idx_chat_messages_reply_to ON public.chat_messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);

CREATE INDEX idx_chat_rooms_type_active ON public.chat_rooms USING btree (room_type, is_active);

CREATE INDEX idx_posts_author ON public.posts USING btree (author_id, created_at DESC);

CREATE INDEX idx_posts_category ON public.posts USING btree (category, created_at DESC);

CREATE INDEX idx_posts_route ON public.posts USING btree (origin, destination);

CREATE INDEX idx_posts_feed ON public.posts USING btree (status, created_at DESC);

CREATE INDEX idx_post_comments_author ON public.post_comments USING btree (author_id);

CREATE INDEX idx_post_comments_post ON public.post_comments USING btree (post_id, created_at);

CREATE INDEX idx_post_reactions_user ON public.post_reactions USING btree (user_id);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (
    id,
    full_name,
    company_name,
    city,
    phone,
    agent_type
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'agent'), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    nullif(new.raw_user_meta_data ->> 'city', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'agent_type', ''), 'agent')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_deal_messages_read(p_deal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.deals d
    where d.id = p_deal_id
      and (d.buyer_id = v_uid or d.seller_id = v_uid)
  ) then
    raise exception 'not_deal_participant' using errcode = '42501';
  end if;

  update public.messages
     set read_at = now()
   where deal_id = p_deal_id
     and sender_id <> v_uid
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers%rowtype;
  v_request public.requests%rowtype;
  v_deal_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select *
    into v_offer
    from public.offers
   where id = p_offer_id
   for update;

  if not found then
    raise exception 'offer_not_found' using errcode = 'P0002';
  end if;

  select *
    into v_request
    from public.requests
   where id = v_offer.request_id
   for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.created_by <> v_uid then
    raise exception 'not_request_owner' using errcode = '42501';
  end if;

  if v_request.status <> 'open' then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;

  if v_offer.agent_id = v_uid then
    raise exception 'cannot_accept_own_offer' using errcode = 'P0001';
  end if;

  if v_offer.price is null then
    raise exception 'offer_price_required' using errcode = 'P0001';
  end if;

  update public.offers
     set status = case when id = p_offer_id then 'accepted' else 'rejected' end
   where request_id = v_request.id
     and status = 'pending';

  update public.requests
     set status = 'accepted'
   where id = v_request.id;

  insert into public.deals (
    request_id,
    offer_id,
    buyer_id,
    seller_id,
    agreed_price,
    currency,
    status
  ) values (
    v_request.id,
    v_offer.id,
    v_request.created_by,
    v_offer.agent_id,
    v_offer.price,
    coalesce(v_offer.currency, 'USD'),
    'accepted'
  )
  returning id into v_deal_id;

  insert into public.activity_log (deal_id, request_id, actor_id, event_type, event_data)
  values (
    v_deal_id,
    v_request.id,
    v_uid,
    'offer_accepted',
    jsonb_build_object('offer_id', v_offer.id, 'seller_id', v_offer.agent_id, 'price', v_offer.price, 'currency', coalesce(v_offer.currency, 'USD'))
  );

  return v_deal_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_deal_status(p_deal_id uuid, p_status text)
 RETURNS deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_old_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'deal_not_found' using errcode = 'P0002';
  end if;

  if v_uid <> v_deal.buyer_id and v_uid <> v_deal.seller_id then
    raise exception 'not_deal_participant' using errcode = '42501';
  end if;

  if p_status not in ('processing','issued','completed','cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  v_old_status := v_deal.status;

  if not (
    (v_old_status = 'accepted' and p_status in ('processing','cancelled')) or
    (v_old_status = 'processing' and p_status in ('issued','cancelled')) or
    (v_old_status = 'issued' and p_status = 'completed')
  ) then
    raise exception 'invalid_status_transition' using errcode = 'P0001';
  end if;

  update public.deals
  set status = p_status
  where id = p_deal_id
  returning * into v_deal;

  insert into public.activity_log (deal_id, request_id, actor_id, event_type, event_data)
  values (
    v_deal.id,
    v_deal.request_id,
    v_uid,
    'deal_status_changed',
    jsonb_build_object('from', v_old_status, 'to', p_status, 'status', p_status)
  );

  return v_deal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_conversation_summaries()
 RETURNS TABLE(deal_id uuid, last_message text, last_message_type text, last_message_at timestamp with time zone, last_sender_id uuid, unread_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    d.id as deal_id,
    lm.message as last_message,
    lm.message_type as last_message_type,
    lm.created_at as last_message_at,
    lm.sender_id as last_sender_id,
    coalesce(uc.unread_count, 0)::bigint as unread_count
  from public.deals d
  left join lateral (
    select m.message, m.message_type, m.created_at, m.sender_id
    from public.messages m
    where m.deal_id = d.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as unread_count
    from public.messages m
    where m.deal_id = d.id
      and m.sender_id <> auth.uid()
      and m.read_at is null
  ) uc on true
  where auth.uid() is not null
    and (d.buyer_id = auth.uid() or d.seller_id = auth.uid())
  order by coalesce(lm.created_at, d.updated_at, d.created_at) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.review_verification_request(p_request_id uuid, p_status text, p_review_note text DEFAULT NULL::text)
 RETURNS verification_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_request public.verification_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'admin'
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_request
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'verification_request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'verification_request_already_reviewed' using errcode = 'P0001';
  end if;

  update public.verification_requests
  set status = p_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = v_uid
  where id = p_request_id
  returning * into v_request;

  if p_status = 'approved' then
    update public.profiles
    set is_verified = true
    where id = v_request.user_id;
  end if;

  return v_request;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_agent_active(p_user_id uuid, p_is_active boolean)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_old boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if not found or v_admin.role <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_profile.role <> 'agent' then
    raise exception 'target_must_be_agent' using errcode = '42501';
  end if;

  v_old := coalesce(v_profile.is_active, true);

  update public.profiles
  set is_active = p_is_active, updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_audit_log(admin_id, target_profile_id, action, old_value, new_value)
  values (v_uid, p_user_id, 'set_active', v_old, p_is_active);

  return v_profile;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_agent_verified(p_user_id uuid, p_is_verified boolean)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin public.profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_old boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = v_uid;
  if not found or v_admin.role <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_profile.role <> 'agent' then
    raise exception 'target_must_be_agent' using errcode = '42501';
  end if;

  v_old := coalesce(v_profile.is_verified, false);

  update public.profiles
  set is_verified = p_is_verified, updated_at = now()
  where id = p_user_id
  returning * into v_profile;

  insert into public.admin_audit_log(admin_id, target_profile_id, action, old_value, new_value)
  values (v_uid, p_user_id, 'set_verified', v_old, p_is_verified);

  return v_profile;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(p_other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_room_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'invalid_other_user' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_active, true) = true) then
    raise exception 'current_user_inactive' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_other_user_id and coalesce(p.is_active, true) = true) then
    raise exception 'other_user_not_available' using errcode = 'P0002';
  end if;

  v_key := least(v_uid::text, p_other_user_id::text) || ':' || greatest(v_uid::text, p_other_user_id::text);

  insert into public.chat_rooms (room_type, direct_key, created_by, is_active)
  values ('direct', v_key, v_uid, true)
  on conflict (direct_key) do update set updated_at = public.chat_rooms.updated_at
  returning id into v_room_id;

  insert into public.chat_room_members(room_id, user_id, member_role)
  values (v_room_id, v_uid, 'member'), (v_room_id, p_other_user_id, 'member')
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_chat_room_read(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_type text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and coalesce(p.is_active, true) = true) then
    raise exception 'user_inactive' using errcode = '42501';
  end if;

  select r.room_type into v_type
  from public.chat_rooms r
  where r.id = p_room_id and r.is_active = true;

  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  if v_type = 'public' then
    insert into public.chat_room_members(room_id, user_id, member_role, last_read_at)
    values (p_room_id, v_uid, 'member', now())
    on conflict (room_id, user_id) do update set last_read_at = excluded.last_read_at;
  else
    update public.chat_room_members
    set last_read_at = now()
    where room_id = p_room_id and user_id = v_uid;
    if not found then
      raise exception 'not_room_member' using errcode = '42501';
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_messenger_conversations()
 RETURNS TABLE(room_id uuid, room_type text, title text, slug text, counterpart_id uuid, counterpart_full_name text, counterpart_company_name text, counterpart_city text, counterpart_is_verified boolean, last_message text, last_message_type text, last_message_at timestamp with time zone, last_sender_id uuid, unread_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select auth.uid() as uid),
  accessible as (
    select r.*, m.last_read_at, m.joined_at
    from public.chat_rooms r
    cross join me
    left join public.chat_room_members m on m.room_id=r.id and m.user_id=me.uid
    where me.uid is not null
      and r.is_active=true
      and exists (select 1 from public.profiles p where p.id=me.uid and coalesce(p.is_active,true)=true)
      and (r.room_type='public' or m.user_id is not null)
  )
  select
    r.id,r.room_type,r.title,r.slug,
    cp.id,cp.full_name,cp.company_name,cp.city,cp.is_verified,
    lm.message,lm.message_type,lm.created_at,lm.sender_id,
    coalesce(uc.unread_count,0)::bigint
  from accessible r
  cross join me
  left join lateral (
    select p.id,p.full_name,p.company_name,p.city,p.is_verified
    from public.chat_room_members om join public.profiles p on p.id=om.user_id
    where r.room_type='direct' and om.room_id=r.id and om.user_id<>me.uid
    limit 1
  ) cp on true
  left join lateral (
    select cm.message,cm.message_type,cm.created_at,cm.sender_id
    from public.chat_messages cm
    where cm.room_id=r.id and cm.deleted_at is null
    order by cm.created_at desc limit 1
  ) lm on true
  left join lateral (
    select count(*) as unread_count
    from public.chat_messages cm
    where cm.room_id=r.id and cm.deleted_at is null and cm.sender_id<>me.uid
      and cm.created_at > coalesce(r.last_read_at,r.joined_at,now())
  ) uc on true
  order by
    case when r.room_type='public' and r.slug='umumiy' then 0 else 1 end,
    coalesce(lm.created_at,r.updated_at,r.created_at) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_comment_edited_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_push_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private_push'
AS $function$
declare
  edge_url constant text := 'https://fsemjqlreuzvpyvbmxzt.functions.supabase.co/push-dispatch';
  webhook_secret text;
  event_type text;
begin
  select c.webhook_secret
    into webhook_secret
  from private_push.config c
  where c.singleton = true;

  if coalesce(webhook_secret, '') = '' then
    return new;
  end if;

  event_type := case TG_TABLE_NAME
    when 'chat_messages' then 'chat_message'
    when 'messages' then 'deal_message'
    when 'offers' then 'offer'
    when 'requests' then 'new_request'
    else null
  end;

  if event_type is null then
    return new;
  end if;

  perform net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('type', event_type, 'id', new.id)
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_group_members(p_room_id uuid, p_user_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ids uuid[];
  v_requested integer;
  v_valid integer;
  v_current integer;
  v_new_count integer;
  v_added integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  select m.member_role into v_role
  from public.chat_room_members m
  join public.chat_rooms r on r.id=m.room_id
  where m.room_id=p_room_id and m.user_id=v_uid
    and r.room_type='group' and r.is_active=true;
  if v_role not in ('owner','admin') then
    raise exception 'group_admin_required' using errcode='42501';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_user_ids, '{}'::uuid[])) x
  where x is not null;

  v_requested := coalesce(cardinality(v_ids),0);
  if v_requested = 0 then return 0; end if;

  select count(*) into v_valid
  from public.profiles p
  where p.id=any(v_ids) and coalesce(p.is_active,true)=true;
  if v_valid <> v_requested then
    raise exception 'group_member_not_available' using errcode='P0002';
  end if;

  select count(*) into v_current
  from public.chat_room_members where room_id=p_room_id;

  select count(*) into v_new_count
  from unnest(v_ids) x
  where not exists (
    select 1 from public.chat_room_members m
    where m.room_id=p_room_id and m.user_id=x
  );

  if v_current + v_new_count > 100 then
    raise exception 'group_member_limit_reached' using errcode='22023';
  end if;

  with ins as (
    insert into public.chat_room_members(room_id,user_id,member_role)
    select p_room_id,x,'member' from unnest(v_ids) x
    on conflict (room_id,user_id) do nothing
    returning 1
  ) select count(*) into v_added from ins;

  if v_added > 0 then
    insert into public.chat_messages(room_id,sender_id,message,message_type)
    values (p_room_id,v_uid,v_added::text || ' ta yangi a’zo qo‘shildi','system');
  end if;

  return v_added;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_post_reaction(p_post_id uuid, p_reaction text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_reaction is null or trim(p_reaction)='' then
    delete from public.post_reactions where post_id=p_post_id and user_id=v_uid;
    return;
  end if;
  if p_reaction not in ('like','fire','deal') then raise exception 'invalid_reaction' using errcode='22023'; end if;
  insert into public.post_reactions(post_id,user_id,reaction)
  values (p_post_id,v_uid,p_reaction)
  on conflict (post_id,user_id) do update set reaction=excluded.reaction, created_at=now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_group_chat(p_title text, p_description text DEFAULT NULL::text, p_member_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_member_ids uuid[];
  v_requested_count integer;
  v_valid_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid and coalesce(p.is_active, true) = true
  ) then
    raise exception 'current_user_inactive' using errcode = '42501';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 100 then
    raise exception 'invalid_group_title' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'group_description_too_long' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_member_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) x
  where x is not null and x <> v_uid;

  v_requested_count := coalesce(cardinality(v_member_ids), 0);
  if v_requested_count > 99 then
    raise exception 'too_many_group_members' using errcode = '22023';
  end if;

  select count(*) into v_valid_count
  from public.profiles p
  where p.id = any(v_member_ids)
    and coalesce(p.is_active, true) = true;

  if v_valid_count <> v_requested_count then
    raise exception 'group_member_not_available' using errcode = 'P0002';
  end if;

  insert into public.chat_rooms(room_type, title, description, created_by, is_active)
  values ('group', v_title, v_description, v_uid, true)
  returning id into v_room_id;

  insert into public.chat_room_members(room_id, user_id, member_role, last_read_at)
  values (v_room_id, v_uid, 'owner', now());

  if v_requested_count > 0 then
    insert into public.chat_room_members(room_id, user_id, member_role)
    select v_room_id, x, 'member'
    from unnest(v_member_ids) x
    on conflict (room_id, user_id) do nothing;
  end if;

  insert into public.chat_messages(room_id, sender_id, message, message_type)
  values (v_room_id, v_uid, 'Guruh yaratildi', 'system');

  return v_room_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_group_members(p_room_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, company_name text, city text, avatar_url text, is_verified boolean, member_role text, joined_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.id,
    p.full_name,
    p.company_name,
    p.city,
    p.avatar_url,
    p.is_verified,
    m.member_role,
    m.joined_at
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  join public.profiles p on p.id = m.user_id
  where r.id = p_room_id
    and r.room_type = 'group'
    and r.is_active = true
    and exists (
      select 1 from public.chat_room_members me
      where me.room_id = r.id and me.user_id = auth.uid()
    )
  order by
    case m.member_role when 'owner' then 0 when 'admin' then 1 else 2 end,
    lower(coalesce(p.full_name, p.company_name, '')),
    m.joined_at;
$function$
;

CREATE OR REPLACE FUNCTION public.update_group_chat(p_room_id uuid, p_title text, p_description text DEFAULT NULL::text)
 RETURNS chat_rooms
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_room public.chat_rooms%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 100 then
    raise exception 'invalid_group_title' using errcode='22023';
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'group_description_too_long' using errcode='22023';
  end if;

  select m.member_role into v_role
  from public.chat_room_members m
  join public.chat_rooms r on r.id=m.room_id
  where m.room_id=p_room_id and m.user_id=v_uid
    and r.room_type='group' and r.is_active=true;

  if v_role not in ('owner','admin') then
    raise exception 'group_admin_required' using errcode='42501';
  end if;

  update public.chat_rooms
  set title=v_title, description=v_description, updated_at=now()
  where id=p_room_id and room_type='group' and is_active=true
  returning * into v_room;

  insert into public.chat_messages(room_id,sender_id,message,message_type)
  values (p_room_id,v_uid,'Guruh ma’lumotlari yangilandi','system');

  return v_room;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_group_member(p_room_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_target_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_user_id = v_uid then raise exception 'use_leave_group' using errcode='22023'; end if;

  select m.member_role into v_actor_role
  from public.chat_room_members m
  join public.chat_rooms r on r.id=m.room_id
  where m.room_id=p_room_id and m.user_id=v_uid
    and r.room_type='group' and r.is_active=true;
  if v_actor_role not in ('owner','admin') then raise exception 'group_admin_required' using errcode='42501'; end if;

  select m.member_role, coalesce(p.full_name,p.company_name,'A’zo')
  into v_target_role, v_target_name
  from public.chat_room_members m join public.profiles p on p.id=m.user_id
  where m.room_id=p_room_id and m.user_id=p_user_id;
  if not found then raise exception 'group_member_not_found' using errcode='P0002'; end if;
  if v_target_role='owner' then raise exception 'cannot_remove_group_owner' using errcode='42501'; end if;
  if v_actor_role='admin' and v_target_role <> 'member' then raise exception 'owner_required' using errcode='42501'; end if;

  delete from public.chat_room_members where room_id=p_room_id and user_id=p_user_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type)
  values (p_room_id,v_uid,v_target_name || ' guruhdan chiqarildi','system');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_group_member_role(p_room_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target_role text;
  v_target_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_role not in ('admin','member') then raise exception 'invalid_member_role' using errcode='22023'; end if;
  if not exists (
    select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id
    where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner'
      and r.room_type='group' and r.is_active=true
  ) then raise exception 'group_owner_required' using errcode='42501'; end if;

  select m.member_role, coalesce(p.full_name,p.company_name,'A’zo')
  into v_target_role,v_target_name
  from public.chat_room_members m join public.profiles p on p.id=m.user_id
  where m.room_id=p_room_id and m.user_id=p_user_id;
  if not found then raise exception 'group_member_not_found' using errcode='P0002'; end if;
  if v_target_role='owner' then raise exception 'cannot_change_owner_role' using errcode='42501'; end if;

  update public.chat_room_members set member_role=p_role
  where room_id=p_room_id and user_id=p_user_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type)
  values (p_room_id,v_uid,
    case when p_role='admin' then v_target_name || ' administrator qilindi' else v_target_name || ' oddiy a’zo qilindi' end,
    'system');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(p_room_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_new_owner_id=v_uid then return; end if;
  if not exists (
    select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id
    where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner'
      and r.room_type='group' and r.is_active=true
  ) then raise exception 'group_owner_required' using errcode='42501'; end if;
  if not exists (
    select 1 from public.chat_room_members m join public.profiles p on p.id=m.user_id
    where m.room_id=p_room_id and m.user_id=p_new_owner_id and coalesce(p.is_active,true)=true
  ) then raise exception 'new_owner_must_be_active_member' using errcode='P0002'; end if;

  select coalesce(p.full_name,p.company_name,'A’zo') into v_name from public.profiles p where p.id=p_new_owner_id;
  update public.chat_room_members set member_role='admin' where room_id=p_room_id and user_id=v_uid;
  update public.chat_room_members set member_role='owner' where room_id=p_room_id and user_id=p_new_owner_id;
  update public.chat_rooms set created_by=p_new_owner_id, updated_at=now() where id=p_room_id;
  insert into public.chat_messages(room_id,sender_id,message,message_type)
  values (p_room_id,v_uid,v_name || ' guruh egasi qilindi','system');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leave_group_chat(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select m.member_role, coalesce(p.full_name,p.company_name,'A’zo') into v_role,v_name
  from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id join public.profiles p on p.id=m.user_id
  where m.room_id=p_room_id and m.user_id=v_uid and r.room_type='group' and r.is_active=true;
  if not found then raise exception 'not_group_member' using errcode='42501'; end if;
  if v_role='owner' then raise exception 'owner_must_transfer_first' using errcode='P0001'; end if;
  delete from public.chat_room_members where room_id=p_room_id and user_id=v_uid;
  insert into public.chat_messages(room_id,sender_id,message,message_type)
  values (p_room_id,v_uid,v_name || ' guruhni tark etdi','system');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_group_chat(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not exists (
    select 1 from public.chat_room_members m join public.chat_rooms r on r.id=m.room_id
    where m.room_id=p_room_id and m.user_id=v_uid and m.member_role='owner'
      and r.room_type='group' and r.is_active=true
  ) then raise exception 'group_owner_required' using errcode='42501'; end if;
  update public.chat_rooms set is_active=false, updated_at=now() where id=p_room_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_post_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  if row(new.title,new.body,new.origin,new.destination,new.price,new.currency,new.contact_phone,new.category,new.post_type,new.status,new.expires_at)
     is distinct from
     row(old.title,old.body,old.origin,old.destination,old.price,old.currency,old.contact_phone,old.category,old.post_type,old.status,old.expires_at) then
    new.edited_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_feed_posts(p_category text DEFAULT NULL::text, p_post_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, author_id uuid, post_type text, category text, title text, body text, origin text, destination text, price numeric, currency text, contact_phone text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, edited_at timestamp with time zone, author_full_name text, author_company_name text, author_city text, author_avatar_url text, author_is_verified boolean, comment_count bigint, like_count bigint, fire_count bigint, deal_count bigint, my_reaction text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select p.id,p.author_id,p.post_type,p.category,p.title,p.body,p.origin,p.destination,p.price,p.currency,p.contact_phone,
         p.status,p.expires_at,p.created_at,p.updated_at,p.edited_at,
         a.full_name,a.company_name,a.city,a.avatar_url,a.is_verified,
         (select count(*) from public.post_comments c where c.post_id=p.id and c.deleted_at is null),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='like'),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='fire'),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='deal'),
         (select r.reaction from public.post_reactions r where r.post_id=p.id and r.user_id=auth.uid())
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
  offset greatest(coalesce(p_offset,0),0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_feed_post(p_post_id uuid)
 RETURNS TABLE(id uuid, author_id uuid, post_type text, category text, title text, body text, origin text, destination text, price numeric, currency text, contact_phone text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, edited_at timestamp with time zone, author_full_name text, author_company_name text, author_city text, author_avatar_url text, author_is_verified boolean, comment_count bigint, like_count bigint, fire_count bigint, deal_count bigint, my_reaction text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select p.id,p.author_id,p.post_type,p.category,p.title,p.body,p.origin,p.destination,p.price,p.currency,p.contact_phone,
         p.status,p.expires_at,p.created_at,p.updated_at,p.edited_at,
         a.full_name,a.company_name,a.city,a.avatar_url,a.is_verified,
         (select count(*) from public.post_comments c where c.post_id=p.id and c.deleted_at is null),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='like'),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='fire'),
         (select count(*) from public.post_reactions r where r.post_id=p.id and r.reaction='deal'),
         (select r.reaction from public.post_reactions r where r.post_id=p.id and r.user_id=auth.uid())
  from public.posts p join public.profiles a on a.id=p.author_id
  where p.id=p_post_id and p.status <> 'deleted';
$function$
;

alter table public."requests" enable row level security;

alter table public."offers" enable row level security;

alter table public."deals" enable row level security;

alter table public."messages" enable row level security;

alter table public."activity_log" enable row level security;

alter table public."profiles" enable row level security;

alter table public."verification_requests" enable row level security;

alter table public."admin_audit_log" enable row level security;

alter table public."chat_room_members" enable row level security;

alter table public."chat_messages" enable row level security;

alter table public."chat_rooms" enable row level security;

alter table public."posts" enable row level security;

alter table public."post_comments" enable row level security;

alter table public."post_reactions" enable row level security;

alter table public."push_subscriptions" enable row level security;

alter table public."notification_preferences" enable row level security;

alter table public."vk_identities" enable row level security;

create policy "Authenticated users can view profiles" on public."profiles" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) IS NOT NULL));

create policy "Users can update own profile" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

create policy "Signed in agents can view requests" on public."requests" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) IS NOT NULL));

create policy "Relevant users can view offers" on public."offers" as PERMISSIVE for SELECT to "authenticated" using (((agent_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = offers.request_id) AND (r.created_by = ( SELECT auth.uid() AS uid)))))));

create policy "Users can delete own requests" on public."requests" as PERMISSIVE for DELETE to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))));

create policy "Agents can delete own offers" on public."offers" as PERMISSIVE for DELETE to "authenticated" using ((agent_id = ( SELECT auth.uid() AS uid)));

create policy "Deal participants can view deals" on public."deals" as PERMISSIVE for SELECT to "authenticated" using (((buyer_id = ( SELECT auth.uid() AS uid)) OR (seller_id = ( SELECT auth.uid() AS uid))));

create policy "Deal participants can view messages" on public."messages" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = messages.deal_id) AND ((( SELECT auth.uid() AS uid) = d.buyer_id) OR (( SELECT auth.uid() AS uid) = d.seller_id))))));

create policy "Deal participants can send messages" on public."messages" as PERMISSIVE for INSERT to "authenticated" with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = messages.deal_id) AND ((( SELECT auth.uid() AS uid) = d.buyer_id) OR (( SELECT auth.uid() AS uid) = d.seller_id)))))));

create policy "Users can view related activity" on public."activity_log" as PERMISSIVE for SELECT to "authenticated" using (((actor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = activity_log.request_id) AND (r.created_by = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM deals d
  WHERE ((d.id = activity_log.deal_id) AND ((( SELECT auth.uid() AS uid) = d.buyer_id) OR (( SELECT auth.uid() AS uid) = d.seller_id)))))));

create policy "Users can append own activity" on public."activity_log" as PERMISSIVE for INSERT to "authenticated" with check ((actor_id = ( SELECT auth.uid() AS uid)));

create policy "Users can create own verification requests" on public."verification_requests" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_at IS NULL) AND (reviewed_by IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.is_verified, false) = false))))));

create policy "Users can create own requests" on public."requests" as PERMISSIVE for INSERT to "authenticated" with check (((created_by = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text)));

create policy "Users can update own requests" on public."requests" as PERMISSIVE for UPDATE to "authenticated" using (((created_by = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text))) with check (((created_by = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))));

create policy "Agents can create own offers" on public."offers" as PERMISSIVE for INSERT to "authenticated" with check (((agent_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = offers.request_id) AND (r.status = 'open'::text) AND (r.created_by <> ( SELECT auth.uid() AS uid)))))));

create policy "Agents can update own pending offers" on public."offers" as PERMISSIVE for UPDATE to "authenticated" using (((agent_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text))) with check (((agent_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['pending'::text, 'withdrawn'::text]))));

create policy "Admins can view admin audit log" on public."admin_audit_log" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));

create policy "Users or admins can view verification requests" on public."verification_requests" as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))));

create policy "Active users can view accessible chat rooms" on public."chat_rooms" as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.is_active, true) = true)))) AND (is_active = true) AND ((room_type = 'public'::text) OR (EXISTS ( SELECT 1
   FROM chat_room_members m
  WHERE ((m.room_id = chat_rooms.id) AND (m.user_id = ( SELECT auth.uid() AS uid))))))));

create policy "Users can view own chat memberships" on public."chat_room_members" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "Users can view accessible chat messages" on public."chat_messages" as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.is_active = true) AND ((r.room_type = 'public'::text) OR (EXISTS ( SELECT 1
           FROM chat_room_members m
          WHERE ((m.room_id = r.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))))))));

create policy "Users can send accessible chat messages" on public."chat_messages" as PERMISSIVE for INSERT to "authenticated" with check (((sender_id = ( SELECT auth.uid() AS uid)) AND (message_type = 'text'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(p.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM chat_rooms r
  WHERE ((r.id = chat_messages.room_id) AND (r.is_active = true) AND ((r.room_type = 'public'::text) OR (EXISTS ( SELECT 1
           FROM chat_room_members m
          WHERE ((m.room_id = r.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))))))));

create policy "Active agents can view feed posts" on public."posts" as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true)))) AND (status <> 'deleted'::text) AND (EXISTS ( SELECT 1
   FROM profiles a
  WHERE ((a.id = posts.author_id) AND (COALESCE(a.is_active, true) = true))))));

create policy "Active agents can create own feed posts" on public."posts" as PERMISSIVE for INSERT to "authenticated" with check (((author_id = ( SELECT auth.uid() AS uid)) AND (status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true))))));

create policy "Authors can update own feed posts" on public."posts" as PERMISSIVE for UPDATE to "authenticated" using ((author_id = ( SELECT auth.uid() AS uid))) with check (((author_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['active'::text, 'closed'::text, 'deleted'::text]))));

create policy "Active agents can view feed comments" on public."post_comments" as PERMISSIVE for SELECT to "authenticated" using (((deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_comments.post_id) AND (p.status <> 'deleted'::text))))));

create policy "Active agents can create own comments" on public."post_comments" as PERMISSIVE for INSERT to "authenticated" with check (((author_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_comments.post_id) AND (p.status = 'active'::text))))));

create policy "Authors can update own comments" on public."post_comments" as PERMISSIVE for UPDATE to "authenticated" using ((author_id = ( SELECT auth.uid() AS uid))) with check ((author_id = ( SELECT auth.uid() AS uid)));

create policy "Active agents can view post reactions" on public."post_reactions" as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_reactions.post_id) AND (p.status <> 'deleted'::text))))));

create policy "Active agents can react" on public."post_reactions" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(me.is_active, true) = true)))) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = post_reactions.post_id) AND (p.status = 'active'::text))))));

create policy "Users can update own reactions" on public."post_reactions" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "Users can delete own reactions" on public."post_reactions" as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "push_subscriptions_select_own" on public."push_subscriptions" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));

create policy "push_subscriptions_insert_own" on public."push_subscriptions" as PERMISSIVE for INSERT to PUBLIC with check ((auth.uid() = user_id));

create policy "push_subscriptions_update_own" on public."push_subscriptions" as PERMISSIVE for UPDATE to PUBLIC using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create policy "push_subscriptions_delete_own" on public."push_subscriptions" as PERMISSIVE for DELETE to PUBLIC using ((auth.uid() = user_id));

create policy "notification_preferences_select_own" on public."notification_preferences" as PERMISSIVE for SELECT to PUBLIC using ((auth.uid() = user_id));

create policy "notification_preferences_insert_own" on public."notification_preferences" as PERMISSIVE for INSERT to PUBLIC with check ((auth.uid() = user_id));

create policy "notification_preferences_update_own" on public."notification_preferences" as PERMISSIVE for UPDATE to PUBLIC using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

revoke all on public."requests" from public, anon, authenticated, service_role;

revoke all on public."offers" from public, anon, authenticated, service_role;

revoke all on public."deals" from public, anon, authenticated, service_role;

revoke all on public."messages" from public, anon, authenticated, service_role;

revoke all on public."activity_log" from public, anon, authenticated, service_role;

revoke all on public."profiles" from public, anon, authenticated, service_role;

revoke all on public."verification_requests" from public, anon, authenticated, service_role;

revoke all on public."admin_audit_log" from public, anon, authenticated, service_role;

revoke all on public."chat_room_members" from public, anon, authenticated, service_role;

revoke all on public."chat_messages" from public, anon, authenticated, service_role;

revoke all on public."chat_rooms" from public, anon, authenticated, service_role;

revoke all on public."posts" from public, anon, authenticated, service_role;

revoke all on public."post_comments" from public, anon, authenticated, service_role;

revoke all on public."post_reactions" from public, anon, authenticated, service_role;

revoke all on public."push_subscriptions" from public, anon, authenticated, service_role;

revoke all on public."notification_preferences" from public, anon, authenticated, service_role;

revoke all on public."vk_identities" from public, anon, authenticated, service_role;

grant INSERT on public."requests" to "service_role";

grant SELECT on public."requests" to "service_role";

grant UPDATE on public."requests" to "service_role";

grant DELETE on public."requests" to "service_role";

grant TRUNCATE on public."requests" to "service_role";

grant REFERENCES on public."requests" to "service_role";

grant TRIGGER on public."requests" to "service_role";

grant INSERT on public."requests" to "authenticated";

grant SELECT on public."requests" to "authenticated";

grant DELETE on public."requests" to "authenticated";

grant INSERT on public."offers" to "service_role";

grant SELECT on public."offers" to "service_role";

grant UPDATE on public."offers" to "service_role";

grant DELETE on public."offers" to "service_role";

grant TRUNCATE on public."offers" to "service_role";

grant REFERENCES on public."offers" to "service_role";

grant TRIGGER on public."offers" to "service_role";

grant INSERT on public."offers" to "authenticated";

grant SELECT on public."offers" to "authenticated";

grant DELETE on public."offers" to "authenticated";

grant INSERT on public."deals" to "service_role";

grant SELECT on public."deals" to "service_role";

grant UPDATE on public."deals" to "service_role";

grant DELETE on public."deals" to "service_role";

grant TRUNCATE on public."deals" to "service_role";

grant REFERENCES on public."deals" to "service_role";

grant TRIGGER on public."deals" to "service_role";

grant INSERT on public."deals" to "authenticated";

grant SELECT on public."deals" to "authenticated";

grant INSERT on public."messages" to "service_role";

grant SELECT on public."messages" to "service_role";

grant UPDATE on public."messages" to "service_role";

grant DELETE on public."messages" to "service_role";

grant TRUNCATE on public."messages" to "service_role";

grant REFERENCES on public."messages" to "service_role";

grant TRIGGER on public."messages" to "service_role";

grant INSERT on public."messages" to "authenticated";

grant SELECT on public."messages" to "authenticated";

grant INSERT on public."activity_log" to "service_role";

grant SELECT on public."activity_log" to "service_role";

grant UPDATE on public."activity_log" to "service_role";

grant DELETE on public."activity_log" to "service_role";

grant TRUNCATE on public."activity_log" to "service_role";

grant REFERENCES on public."activity_log" to "service_role";

grant TRIGGER on public."activity_log" to "service_role";

grant INSERT on public."activity_log" to "authenticated";

grant SELECT on public."activity_log" to "authenticated";

grant INSERT on public."profiles" to "service_role";

grant SELECT on public."profiles" to "service_role";

grant UPDATE on public."profiles" to "service_role";

grant DELETE on public."profiles" to "service_role";

grant TRUNCATE on public."profiles" to "service_role";

grant REFERENCES on public."profiles" to "service_role";

grant TRIGGER on public."profiles" to "service_role";

grant SELECT on public."profiles" to "authenticated";

grant INSERT on public."verification_requests" to "service_role";

grant SELECT on public."verification_requests" to "service_role";

grant UPDATE on public."verification_requests" to "service_role";

grant DELETE on public."verification_requests" to "service_role";

grant TRUNCATE on public."verification_requests" to "service_role";

grant REFERENCES on public."verification_requests" to "service_role";

grant TRIGGER on public."verification_requests" to "service_role";

grant SELECT on public."verification_requests" to "authenticated";

grant INSERT on public."admin_audit_log" to "service_role";

grant SELECT on public."admin_audit_log" to "service_role";

grant UPDATE on public."admin_audit_log" to "service_role";

grant DELETE on public."admin_audit_log" to "service_role";

grant TRUNCATE on public."admin_audit_log" to "service_role";

grant REFERENCES on public."admin_audit_log" to "service_role";

grant TRIGGER on public."admin_audit_log" to "service_role";

grant SELECT on public."admin_audit_log" to "authenticated";

grant INSERT on public."chat_room_members" to "authenticated";

grant SELECT on public."chat_room_members" to "authenticated";

grant UPDATE on public."chat_room_members" to "authenticated";

grant DELETE on public."chat_room_members" to "authenticated";

grant TRUNCATE on public."chat_room_members" to "authenticated";

grant REFERENCES on public."chat_room_members" to "authenticated";

grant TRIGGER on public."chat_room_members" to "authenticated";

grant INSERT on public."chat_room_members" to "service_role";

grant SELECT on public."chat_room_members" to "service_role";

grant UPDATE on public."chat_room_members" to "service_role";

grant DELETE on public."chat_room_members" to "service_role";

grant TRUNCATE on public."chat_room_members" to "service_role";

grant REFERENCES on public."chat_room_members" to "service_role";

grant TRIGGER on public."chat_room_members" to "service_role";

grant INSERT on public."chat_messages" to "authenticated";

grant SELECT on public."chat_messages" to "authenticated";

grant UPDATE on public."chat_messages" to "authenticated";

grant DELETE on public."chat_messages" to "authenticated";

grant TRUNCATE on public."chat_messages" to "authenticated";

grant REFERENCES on public."chat_messages" to "authenticated";

grant TRIGGER on public."chat_messages" to "authenticated";

grant INSERT on public."chat_messages" to "service_role";

grant SELECT on public."chat_messages" to "service_role";

grant UPDATE on public."chat_messages" to "service_role";

grant DELETE on public."chat_messages" to "service_role";

grant TRUNCATE on public."chat_messages" to "service_role";

grant REFERENCES on public."chat_messages" to "service_role";

grant TRIGGER on public."chat_messages" to "service_role";

grant INSERT on public."chat_rooms" to "authenticated";

grant SELECT on public."chat_rooms" to "authenticated";

grant UPDATE on public."chat_rooms" to "authenticated";

grant DELETE on public."chat_rooms" to "authenticated";

grant TRUNCATE on public."chat_rooms" to "authenticated";

grant REFERENCES on public."chat_rooms" to "authenticated";

grant TRIGGER on public."chat_rooms" to "authenticated";

grant INSERT on public."chat_rooms" to "service_role";

grant SELECT on public."chat_rooms" to "service_role";

grant UPDATE on public."chat_rooms" to "service_role";

grant DELETE on public."chat_rooms" to "service_role";

grant TRUNCATE on public."chat_rooms" to "service_role";

grant REFERENCES on public."chat_rooms" to "service_role";

grant TRIGGER on public."chat_rooms" to "service_role";

grant INSERT on public."posts" to "authenticated";

grant SELECT on public."posts" to "authenticated";

grant UPDATE on public."posts" to "authenticated";

grant DELETE on public."posts" to "authenticated";

grant TRUNCATE on public."posts" to "authenticated";

grant REFERENCES on public."posts" to "authenticated";

grant TRIGGER on public."posts" to "authenticated";

grant INSERT on public."posts" to "service_role";

grant SELECT on public."posts" to "service_role";

grant UPDATE on public."posts" to "service_role";

grant DELETE on public."posts" to "service_role";

grant TRUNCATE on public."posts" to "service_role";

grant REFERENCES on public."posts" to "service_role";

grant TRIGGER on public."posts" to "service_role";

grant INSERT on public."post_comments" to "authenticated";

grant SELECT on public."post_comments" to "authenticated";

grant UPDATE on public."post_comments" to "authenticated";

grant DELETE on public."post_comments" to "authenticated";

grant TRUNCATE on public."post_comments" to "authenticated";

grant REFERENCES on public."post_comments" to "authenticated";

grant TRIGGER on public."post_comments" to "authenticated";

grant INSERT on public."post_comments" to "service_role";

grant SELECT on public."post_comments" to "service_role";

grant UPDATE on public."post_comments" to "service_role";

grant DELETE on public."post_comments" to "service_role";

grant TRUNCATE on public."post_comments" to "service_role";

grant REFERENCES on public."post_comments" to "service_role";

grant TRIGGER on public."post_comments" to "service_role";

grant INSERT on public."post_reactions" to "authenticated";

grant SELECT on public."post_reactions" to "authenticated";

grant UPDATE on public."post_reactions" to "authenticated";

grant DELETE on public."post_reactions" to "authenticated";

grant TRUNCATE on public."post_reactions" to "authenticated";

grant REFERENCES on public."post_reactions" to "authenticated";

grant TRIGGER on public."post_reactions" to "authenticated";

grant INSERT on public."post_reactions" to "service_role";

grant SELECT on public."post_reactions" to "service_role";

grant UPDATE on public."post_reactions" to "service_role";

grant DELETE on public."post_reactions" to "service_role";

grant TRUNCATE on public."post_reactions" to "service_role";

grant REFERENCES on public."post_reactions" to "service_role";

grant TRIGGER on public."post_reactions" to "service_role";

grant INSERT on public."push_subscriptions" to "anon";

grant SELECT on public."push_subscriptions" to "anon";

grant UPDATE on public."push_subscriptions" to "anon";

grant DELETE on public."push_subscriptions" to "anon";

grant TRUNCATE on public."push_subscriptions" to "anon";

grant REFERENCES on public."push_subscriptions" to "anon";

grant TRIGGER on public."push_subscriptions" to "anon";

grant INSERT on public."push_subscriptions" to "authenticated";

grant SELECT on public."push_subscriptions" to "authenticated";

grant UPDATE on public."push_subscriptions" to "authenticated";

grant DELETE on public."push_subscriptions" to "authenticated";

grant TRUNCATE on public."push_subscriptions" to "authenticated";

grant REFERENCES on public."push_subscriptions" to "authenticated";

grant TRIGGER on public."push_subscriptions" to "authenticated";

grant INSERT on public."push_subscriptions" to "service_role";

grant SELECT on public."push_subscriptions" to "service_role";

grant UPDATE on public."push_subscriptions" to "service_role";

grant DELETE on public."push_subscriptions" to "service_role";

grant TRUNCATE on public."push_subscriptions" to "service_role";

grant REFERENCES on public."push_subscriptions" to "service_role";

grant TRIGGER on public."push_subscriptions" to "service_role";

grant INSERT on public."notification_preferences" to "anon";

grant SELECT on public."notification_preferences" to "anon";

grant UPDATE on public."notification_preferences" to "anon";

grant DELETE on public."notification_preferences" to "anon";

grant TRUNCATE on public."notification_preferences" to "anon";

grant REFERENCES on public."notification_preferences" to "anon";

grant TRIGGER on public."notification_preferences" to "anon";

grant INSERT on public."notification_preferences" to "authenticated";

grant SELECT on public."notification_preferences" to "authenticated";

grant UPDATE on public."notification_preferences" to "authenticated";

grant DELETE on public."notification_preferences" to "authenticated";

grant TRUNCATE on public."notification_preferences" to "authenticated";

grant REFERENCES on public."notification_preferences" to "authenticated";

grant TRIGGER on public."notification_preferences" to "authenticated";

grant INSERT on public."notification_preferences" to "service_role";

grant SELECT on public."notification_preferences" to "service_role";

grant UPDATE on public."notification_preferences" to "service_role";

grant DELETE on public."notification_preferences" to "service_role";

grant TRUNCATE on public."notification_preferences" to "service_role";

grant REFERENCES on public."notification_preferences" to "service_role";

grant TRIGGER on public."notification_preferences" to "service_role";

grant INSERT on public."vk_identities" to "service_role";

grant SELECT on public."vk_identities" to "service_role";

grant UPDATE on public."vk_identities" to "service_role";

grant DELETE on public."vk_identities" to "service_role";

grant TRUNCATE on public."vk_identities" to "service_role";

grant REFERENCES on public."vk_identities" to "service_role";

grant TRIGGER on public."vk_identities" to "service_role";

grant UPDATE ("adults") on public."requests" to "authenticated";

grant UPDATE ("agent_type") on public."profiles" to "authenticated";

grant UPDATE ("airline") on public."offers" to "authenticated";

grant UPDATE ("avatar_url") on public."profiles" to "authenticated";

grant UPDATE ("baggage") on public."offers" to "authenticated";

grant UPDATE ("baggage") on public."requests" to "authenticated";

grant UPDATE ("budget") on public."requests" to "authenticated";

grant UPDATE ("category") on public."requests" to "authenticated";

grant UPDATE ("children") on public."requests" to "authenticated";

grant UPDATE ("city") on public."profiles" to "authenticated";

grant UPDATE ("comment") on public."offers" to "authenticated";

grant UPDATE ("company_name") on public."profiles" to "authenticated";

grant UPDATE ("currency") on public."offers" to "authenticated";

grant UPDATE ("currency") on public."requests" to "authenticated";

grant UPDATE ("description") on public."requests" to "authenticated";

grant UPDATE ("destination") on public."requests" to "authenticated";

grant UPDATE ("full_name") on public."profiles" to "authenticated";

grant UPDATE ("infants") on public."requests" to "authenticated";

grant UPDATE ("origin") on public."requests" to "authenticated";

grant UPDATE ("phone") on public."profiles" to "authenticated";

grant UPDATE ("price") on public."offers" to "authenticated";

grant INSERT ("request_note") on public."verification_requests" to "authenticated";

grant UPDATE ("services") on public."profiles" to "authenticated";

grant UPDATE ("status") on public."deals" to "authenticated";

grant UPDATE ("status") on public."offers" to "authenticated";

grant UPDATE ("status") on public."requests" to "authenticated";

grant UPDATE ("travel_date") on public."requests" to "authenticated";

grant INSERT ("user_id") on public."verification_requests" to "authenticated";

revoke all on function public."handle_new_user"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."handle_new_user"() to "service_role";

revoke all on function public."mark_deal_messages_read"(p_deal_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."mark_deal_messages_read"(p_deal_id uuid) to "authenticated";

grant EXECUTE on function public."mark_deal_messages_read"(p_deal_id uuid) to "service_role";

revoke all on function public."set_updated_at"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."set_updated_at"() to "service_role";

revoke all on function public."accept_offer"(p_offer_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."accept_offer"(p_offer_id uuid) to "authenticated";

grant EXECUTE on function public."accept_offer"(p_offer_id uuid) to "service_role";

revoke all on function public."update_deal_status"(p_deal_id uuid, p_status text) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."update_deal_status"(p_deal_id uuid, p_status text) to "authenticated";

grant EXECUTE on function public."update_deal_status"(p_deal_id uuid, p_status text) to "service_role";

revoke all on function public."list_conversation_summaries"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."list_conversation_summaries"() to "authenticated";

grant EXECUTE on function public."list_conversation_summaries"() to "service_role";

revoke all on function public."review_verification_request"(p_request_id uuid, p_status text, p_review_note text) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."review_verification_request"(p_request_id uuid, p_status text, p_review_note text) to "authenticated";

grant EXECUTE on function public."review_verification_request"(p_request_id uuid, p_status text, p_review_note text) to "service_role";

revoke all on function public."admin_set_agent_active"(p_user_id uuid, p_is_active boolean) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."admin_set_agent_active"(p_user_id uuid, p_is_active boolean) to "authenticated";

grant EXECUTE on function public."admin_set_agent_active"(p_user_id uuid, p_is_active boolean) to "service_role";

revoke all on function public."admin_set_agent_verified"(p_user_id uuid, p_is_verified boolean) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."admin_set_agent_verified"(p_user_id uuid, p_is_verified boolean) to "authenticated";

grant EXECUTE on function public."admin_set_agent_verified"(p_user_id uuid, p_is_verified boolean) to "service_role";

revoke all on function public."get_or_create_direct_chat"(p_other_user_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."get_or_create_direct_chat"(p_other_user_id uuid) to "authenticated";

grant EXECUTE on function public."get_or_create_direct_chat"(p_other_user_id uuid) to "service_role";

revoke all on function public."mark_chat_room_read"(p_room_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."mark_chat_room_read"(p_room_id uuid) to "authenticated";

grant EXECUTE on function public."mark_chat_room_read"(p_room_id uuid) to "service_role";

revoke all on function public."list_messenger_conversations"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."list_messenger_conversations"() to "authenticated";

grant EXECUTE on function public."list_messenger_conversations"() to "service_role";

revoke all on function public."touch_comment_edited_at"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."touch_comment_edited_at"() to PUBLIC;

grant EXECUTE on function public."touch_comment_edited_at"() to "anon";

grant EXECUTE on function public."touch_comment_edited_at"() to "authenticated";

grant EXECUTE on function public."touch_comment_edited_at"() to "service_role";

revoke all on function public."notify_push_event"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."notify_push_event"() to "anon";

grant EXECUTE on function public."notify_push_event"() to "authenticated";

grant EXECUTE on function public."notify_push_event"() to "service_role";

revoke all on function public."add_group_members"(p_room_id uuid, p_user_ids uuid[]) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."add_group_members"(p_room_id uuid, p_user_ids uuid[]) to "authenticated";

grant EXECUTE on function public."add_group_members"(p_room_id uuid, p_user_ids uuid[]) to "service_role";

revoke all on function public."set_post_reaction"(p_post_id uuid, p_reaction text) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."set_post_reaction"(p_post_id uuid, p_reaction text) to "authenticated";

grant EXECUTE on function public."set_post_reaction"(p_post_id uuid, p_reaction text) to "service_role";

revoke all on function public."create_group_chat"(p_title text, p_description text, p_member_ids uuid[]) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."create_group_chat"(p_title text, p_description text, p_member_ids uuid[]) to "authenticated";

grant EXECUTE on function public."create_group_chat"(p_title text, p_description text, p_member_ids uuid[]) to "service_role";

revoke all on function public."list_group_members"(p_room_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."list_group_members"(p_room_id uuid) to "authenticated";

grant EXECUTE on function public."list_group_members"(p_room_id uuid) to "service_role";

revoke all on function public."update_group_chat"(p_room_id uuid, p_title text, p_description text) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."update_group_chat"(p_room_id uuid, p_title text, p_description text) to "authenticated";

grant EXECUTE on function public."update_group_chat"(p_room_id uuid, p_title text, p_description text) to "service_role";

revoke all on function public."remove_group_member"(p_room_id uuid, p_user_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."remove_group_member"(p_room_id uuid, p_user_id uuid) to "authenticated";

grant EXECUTE on function public."remove_group_member"(p_room_id uuid, p_user_id uuid) to "service_role";

revoke all on function public."set_group_member_role"(p_room_id uuid, p_user_id uuid, p_role text) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."set_group_member_role"(p_room_id uuid, p_user_id uuid, p_role text) to "authenticated";

grant EXECUTE on function public."set_group_member_role"(p_room_id uuid, p_user_id uuid, p_role text) to "service_role";

revoke all on function public."transfer_group_ownership"(p_room_id uuid, p_new_owner_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."transfer_group_ownership"(p_room_id uuid, p_new_owner_id uuid) to "authenticated";

grant EXECUTE on function public."transfer_group_ownership"(p_room_id uuid, p_new_owner_id uuid) to "service_role";

revoke all on function public."leave_group_chat"(p_room_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."leave_group_chat"(p_room_id uuid) to "authenticated";

grant EXECUTE on function public."leave_group_chat"(p_room_id uuid) to "service_role";

revoke all on function public."close_group_chat"(p_room_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."close_group_chat"(p_room_id uuid) to "authenticated";

grant EXECUTE on function public."close_group_chat"(p_room_id uuid) to "service_role";

revoke all on function public."touch_post_updated_at"() from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."touch_post_updated_at"() to PUBLIC;

grant EXECUTE on function public."touch_post_updated_at"() to "anon";

grant EXECUTE on function public."touch_post_updated_at"() to "authenticated";

grant EXECUTE on function public."touch_post_updated_at"() to "service_role";

revoke all on function public."list_feed_posts"(p_category text, p_post_type text, p_search text, p_limit integer, p_offset integer) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."list_feed_posts"(p_category text, p_post_type text, p_search text, p_limit integer, p_offset integer) to "authenticated";

grant EXECUTE on function public."list_feed_posts"(p_category text, p_post_type text, p_search text, p_limit integer, p_offset integer) to "service_role";

revoke all on function public."get_feed_post"(p_post_id uuid) from PUBLIC, anon, authenticated, service_role;

grant EXECUTE on function public."get_feed_post"(p_post_id uuid) to "authenticated";

grant EXECUTE on function public."get_feed_post"(p_post_id uuid) to "service_role";

grant usage, select on all sequences in schema public to authenticated, service_role;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER requests_updated_at BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_posts_touch BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION touch_post_updated_at();

CREATE TRIGGER trg_post_comments_touch BEFORE UPDATE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION touch_comment_edited_at();

CREATE TRIGGER trg_push_chat_messages AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION notify_push_event();

CREATE TRIGGER trg_push_deal_messages AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_push_event();

CREATE TRIGGER trg_push_offers AFTER INSERT ON public.offers FOR EACH ROW EXECUTE FUNCTION notify_push_event();

CREATE TRIGGER trg_push_requests AFTER INSERT ON public.requests FOR EACH ROW WHEN ((new.status = 'open'::text)) EXECUTE FUNCTION notify_push_event();

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter publication supabase_realtime add table public."messages";

alter publication supabase_realtime add table public."chat_messages";

alter publication supabase_realtime add table public."posts";

alter publication supabase_realtime add table public."post_comments";

alter publication supabase_realtime add table public."post_reactions";

-- The general room is required by list_messenger_conversations; UUID is generated in this database.

insert into public.chat_rooms(room_type,title,slug,is_active) values('public','Umumiy chat','umumiy',true);

commit;
