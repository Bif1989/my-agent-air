-- Existing column-scoped UPDATE grants do not automatically include new columns.
-- Ownership, status and active-account checks remain enforced by RLS/triggers.
grant update (service_details, form_version) on public.requests to authenticated;
