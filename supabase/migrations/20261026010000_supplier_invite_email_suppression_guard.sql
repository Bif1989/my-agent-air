-- Defense-in-depth: a suppressed supplier email must never remain sendable in an outstanding invite.
create or replace function app_private.enforce_supplier_invite_email_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replacement text;
begin
  if new.channel <> 'email' or nullif(trim(coalesce(new.recipient, '')), '') is null then
    return new;
  end if;

  select nullif(lower(trim(s.replacement_email)), '')
    into v_replacement
  from public.outreach_email_suppressions s
  where s.email = lower(trim(new.recipient))
    and s.active is true
  limit 1;

  if found then
    if v_replacement is null then
      new.recipient := null;
      new.status := 'failed';
      new.failure_reason := 'supplier_email_suppressed';
    else
      new.recipient := v_replacement;
      if new.failure_reason = 'supplier_email_suppressed' then
        new.failure_reason := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_supplier_invite_email_suppression() from public, anon, authenticated;

drop trigger if exists supplier_invites_email_suppression_guard on public.supplier_invites;
create trigger supplier_invites_email_suppression_guard
before insert or update of channel, recipient on public.supplier_invites
for each row execute function app_private.enforce_supplier_invite_email_suppression();

-- Repair outstanding invites created before suppression was introduced.
-- Updating recipient deliberately fires the guard above: no-replacement rows become failed/null,
-- replacement rows are rewritten to the verified replacement address.
update public.supplier_invites i
set recipient = case
  when nullif(trim(s.replacement_email), '') is null then i.recipient
  else lower(trim(s.replacement_email))
end
from public.outreach_email_suppressions s
where i.channel = 'email'
  and i.status in ('queued', 'failed')
  and s.active is true
  and i.recipient is not null
  and lower(trim(i.recipient)) = s.email;

-- When a suppression is added or its replacement changes later, reconcile any still-outstanding invite.
create or replace function app_private.reconcile_supplier_invites_for_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_email text;
  v_old_replacement text;
begin
  if new.active is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_email := lower(trim(old.email));
    v_old_replacement := nullif(lower(trim(old.replacement_email)), '');
  end if;

  update public.supplier_invites i
  set recipient = case
        when nullif(trim(new.replacement_email), '') is null then i.recipient
        else lower(trim(new.replacement_email))
      end,
      failure_reason = case
        when nullif(trim(new.replacement_email), '') is not null
          and i.failure_reason = 'supplier_email_suppressed' then null
        else i.failure_reason
      end
  where i.channel = 'email'
    and i.status in ('queued', 'failed')
    and i.recipient is not null
    and (
      lower(trim(i.recipient)) = new.email
      or (v_old_email is not null and lower(trim(i.recipient)) = v_old_email)
      or (v_old_replacement is not null and lower(trim(i.recipient)) = v_old_replacement)
    );

  return new;
end;
$$;

revoke all on function app_private.reconcile_supplier_invites_for_suppression() from public, anon, authenticated;

drop trigger if exists outreach_email_suppressions_reconcile_invites on public.outreach_email_suppressions;
create trigger outreach_email_suppressions_reconcile_invites
after insert or update of email, active, replacement_email on public.outreach_email_suppressions
for each row execute function app_private.reconcile_supplier_invites_for_suppression();
