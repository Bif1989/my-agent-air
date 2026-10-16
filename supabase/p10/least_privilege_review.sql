-- P10 staged SQL. Do not apply directly from this file to production.
-- At the database rollout, apply this through the Supabase migration workflow,
-- then record the generated production migration version back in supabase/migrations/.
--
-- Rationale:
-- TRUNCATE is table-wide DDL-like data removal and is not governed by row RLS.
-- TRIGGER is only needed to create/alter triggers, not to fire existing triggers.
-- REFERENCES is only needed to create foreign-key constraints.
-- Browser roles do not need any of these privileges for normal Data API CRUD.

revoke truncate, trigger, references on table
  public.ai_chat_conversations,
  public.ai_chat_messages,
  public.notification_preferences,
  public.push_subscriptions,
  public.supplier_capabilities,
  public.chat_messages,
  public.chat_room_members,
  public.chat_rooms,
  public.post_comments,
  public.post_reactions,
  public.posts,
  public.billing_payment_orders
from anon, authenticated;

-- Post-migration verification query:
-- select grantee, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
-- order by grantee, table_name, privilege_type;
-- Expected result: zero rows.
