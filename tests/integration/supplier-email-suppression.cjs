const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema app_private;
      create table public.external_suppliers(id int primary key,email text);
      create table public.outreach_email_suppressions(email text primary key,replacement_email text,active boolean default true);
      create table public.supplier_invites(id int primary key,supplier_id int,channel text,recipient text,status text,failure_reason text);
      insert into external_suppliers values(1,'blocked@example.com');
      insert into supplier_invites values(1,1,'email','blocked@example.com','queued',null);`);
    await db.exec(fs.readFileSync('supabase/migrations/20261025235613_supplier_invite_email_suppression_guard.sql','utf8'));
    // Simulate a previously suppressed row with no provenance.
    await db.exec(`insert into outreach_email_suppressions(email) values('blocked@example.com');`);
    assert.equal((await db.query('select recipient from supplier_invites')).rows[0].recipient, null);
    await db.exec(fs.readFileSync('supabase/migrations/20261026144139_recover_suppressed_supplier_invites.sql','utf8'));
    await db.exec(`update outreach_email_suppressions set replacement_email='valid@example.com' where email='blocked@example.com';`);
    assert.deepEqual((await db.query('select recipient,status,failure_reason from supplier_invites')).rows[0],
      {recipient:'valid@example.com',status:'failed',failure_reason:null});
    await db.exec(`insert into outreach_email_suppressions(email) values('valid@example.com');`);
    assert.equal((await db.query('select recipient from supplier_invites')).rows[0].recipient,null);
    await db.exec(`update outreach_email_suppressions set replacement_email='blocked@example.com' where email='valid@example.com';`);
    await db.exec(`update supplier_invites set recipient='blocked@example.com' where id=1;`);
    assert.equal((await db.query('select recipient from supplier_invites')).rows[0].recipient,null,'cycles must fail closed');
    await db.exec(`update outreach_email_suppressions set active=false where email='blocked@example.com';`);
    assert.deepEqual((await db.query('select recipient,status from supplier_invites')).rows[0],
      {recipient:'blocked@example.com',status:'failed'});
    console.log('SQL PASS: legacy recovery, replacement, nested suppression, cycle and deactivation; never auto-queues');
  } finally { await db.close(); }
})().catch(error => {console.error(error);process.exit(1)});
