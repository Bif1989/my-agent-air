// Isolated Postgres regression check. Requires @electric-sql/pglite on NODE_PATH.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const root=require('node:path').resolve(__dirname,'../..')+'/';
const read=p=>fs.readFileSync(root+p,'utf8');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema app_private;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.profiles(id uuid primary key, city text, role text default 'agent',is_active boolean default true,registration_status text default 'active');
 insert into profiles(id,city,role) values('00000000-0000-0000-0000-000000000001','Buxoro','admin'),('00000000-0000-0000-0000-000000000002','Unmapped town','agent'),('00000000-0000-0000-0000-000000000003','Chust','agent');`);
 await db.exec(read('supabase/migrations/20261019081409_standardize_profile_locations.sql'));
 assert.deepEqual((await db.query(`select city,region from profiles order by id`)).rows,[{city:'Buxoro shahri',region:'Buxoro viloyati'},{city:null,region:null},{city:'Chust tumani',region:'Namangan viloyati'}]);
 assert.equal((await db.query('select city from app_private.profile_legacy_locations')).rows[0].city,'Unmapped town');
 await db.exec(read('supabase/migrations/20261006123500_external_supplier_network.sql').split('create index')[0]);
 await db.exec(read('supabase/migrations/20261019154500_supplier_location_price_filters.sql'));
 await db.exec(read('supabase/migrations/20261023062132_harden_supplier_filters_and_locations.sql'));
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
 await db.query(`select public.admin_import_external_suppliers($1::jsonb)`,[JSON.stringify([
  {name:'USD NIGHT',source_type:'manual',source_record_id:'test-1',region:'Toshkent viloyati',city:'Yuqori Chirchiq tumani',price_from:100,price_to:200,currency:'USD',price_unit:'1 kecha'},
  {name:'UZS NIGHT',source_type:'manual',source_record_id:'test-2',region:'Toshkent viloyati',city:'Yuqori Chirchiq tumani',price_from:100,price_to:200,currency:'UZS',price_unit:'1 kecha'},
  {name:'USD DAY',source_type:'manual',source_record_id:'test-3',region:'Toshkent viloyati',city:'Yuqori Chirchiq tumani',price_from:100,price_to:200,currency:'USD',price_unit:'1 kun'},
  {name:'FROM ONLY',source_type:'manual',source_record_id:'test-4',region:'Toshkent viloyati',city:'Yuqori Chirchiq tumani',price_from:100,currency:'USD',price_unit:'1 kecha'},
  {name:'RAW',source_type:'manual',source_record_id:'test-5',region:'Toshkent viloyati',city:'Unknown locality'},
 ])]);
 const rows=await db.query(`select name from admin_list_external_suppliers_v2(p_region=>'Toshkent viloyati',p_locality=>'Yuqorichirchiq tumani',p_min_price=>150,p_max_price=>150,p_currency=>'USD',p_price_unit=>'1 kecha',p_sort=>'price_asc')`);
 assert.deepEqual(rows.rows.map(x=>x.name).sort(),['FROM ONLY','USD NIGHT']);
 const opts=(await db.query('select admin_external_supplier_filter_options() as options')).rows[0].options;
 assert(opts.localities.some(x=>x.locality==='Unknown locality'));
 assert(opts.localities.some(x=>x.locality==='Yuqorichirchiq tumani'));
 assert.deepEqual(opts.currencies,['USD','UZS']);
 await assert.rejects(db.query(`select * from admin_list_external_suppliers_v2(p_min_price=>100)`),/price_currency_and_unit_required/);
 await assert.rejects(db.query(`select * from admin_list_external_suppliers_v2(p_min_price=>500,p_max_price=>100)`),/invalid_price_range/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);`);
 await assert.rejects(db.query(`select * from admin_list_external_suppliers_v2()`),/admin_required/);
 await db.close(); console.log('SQL PASS: legacy migration, archival, normalized import, raw filter options, currency/unit isolation, open price ranges, validation and admin gate');
})().catch(e=>{console.error(e);process.exit(1)});
