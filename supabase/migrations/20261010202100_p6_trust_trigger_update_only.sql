-- Deals are created before completion. Refresh trust only on a status transition,
-- so the trigger never depends on OLD during an INSERT operation.

create or replace function app_private.refresh_deal_participant_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform app_private.refresh_profile_trust_stats(new.buyer_id);
    perform app_private.refresh_profile_trust_stats(new.seller_id);
  end if;
  return new;
end;
$$;

revoke all on function app_private.refresh_deal_participant_trust() from public, anon, authenticated;

drop trigger if exists trg_deals_refresh_trust on public.deals;
create trigger trg_deals_refresh_trust
  after update of status on public.deals
  for each row execute function app_private.refresh_deal_participant_trust();
