-- P10 base hardening: browser roles only need application DML, not structural table privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_chat_conversations FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_chat_messages FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.billing_payment_orders FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_messages FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_room_members FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_rooms FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notification_preferences FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.post_comments FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.post_reactions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.posts FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.push_subscriptions FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.supplier_capabilities FROM anon, authenticated;
