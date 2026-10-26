-- Retain suppression provenance so adding a verified replacement can recover an
-- existing failed invite. Recovery never queues or sends a message automatically.
alter table public.supplier_invites add column if not exists suppressed_recipient text;

create or replace function app_private.enforce_supplier_invite_email_suppression()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_replacement text;
  v_seen text[] := '{}';
begin
  if new.channel <> 'email' or nullif(trim(coalesce(new.recipient,'')), '') is null then return new; end if;
  v_email := lower(trim(new.recipient));
  loop
    if v_email = any(v_seen) then
      new.recipient := null;
      new.status := 'failed';
      new.failure_reason := 'supplier_email_suppressed';
      return new;
    end if;
    v_seen := array_append(v_seen, v_email);
    select nullif(lower(trim(s.replacement_email)), '') into v_replacement
    from public.outreach_email_suppressions s where s.email=v_email and s.active;
    if not found then
      new.recipient := v_email;
      if new.failure_reason='supplier_email_suppressed' then new.failure_reason:=null; end if;
      return new;
    end if;
    new.suppressed_recipient := coalesce(new.suppressed_recipient, v_email);
    if v_replacement is null then
      new.recipient := null;
      new.status := 'failed';
      new.failure_reason := 'supplier_email_suppressed';
      return new;
    end if;
    v_email := v_replacement;
  end loop;
end;
$$;
revoke all on function app_private.enforce_supplier_invite_email_suppression() from public, anon, authenticated;

-- Older guards discarded the original recipient. Recover it only when its
-- supplier still has an explicitly suppressed email, without guessing an address.
update public.supplier_invites i
set suppressed_recipient=lower(trim(s.email))
from public.external_suppliers s
where s.id=i.supplier_id and i.channel='email' and i.status='failed'
  and i.recipient is null and i.failure_reason='supplier_email_suppressed'
  and exists(select 1 from public.outreach_email_suppressions e where e.email=lower(trim(s.email)));

create or replace function app_private.reconcile_supplier_invites_for_suppression()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.supplier_invites i
  set recipient = coalesce(i.suppressed_recipient, i.recipient)
  where i.channel='email' and i.status in ('queued','failed')
    and (i.suppressed_recipient=new.email or lower(trim(i.recipient))=new.email
      or (tg_op='UPDATE' and (i.suppressed_recipient=old.email
        or lower(trim(i.recipient))=old.email
        or lower(trim(i.recipient))=nullif(lower(trim(old.replacement_email)),''))));
  return new;
end;
$$;
revoke all on function app_private.reconcile_supplier_invites_for_suppression() from public, anon, authenticated;

-- Re-evaluate known outstanding recipients after installing the new guard.
update public.supplier_invites i
set recipient=coalesce(i.suppressed_recipient,i.recipient)
where i.channel='email' and i.status in ('queued','failed')
  and coalesce(i.suppressed_recipient,i.recipient) is not null;
