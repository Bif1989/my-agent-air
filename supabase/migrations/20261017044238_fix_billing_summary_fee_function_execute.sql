-- Allow the authenticated billing summary RPC to call the pure role-fee mapper.
-- The mapper is immutable/read-only and exposes no user data.
grant execute on function app_private.billing_fee_amount(text) to authenticated;
