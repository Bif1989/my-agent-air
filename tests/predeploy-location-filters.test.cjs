const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/supabase-auth.ts');
const original = auth.authenticatedSupabaseFetch;
const { listUzLocations } = require('../app/profile/profile-api.ts');
const { loadSuppliers } = require('../app/admin/suppliers/supplier-api.ts');
after(() => { auth.authenticatedSupabaseFetch = original; });

test('location loading rejects HTTP errors, error objects and empty lists; a retry succeeds', async () => {
  for (const [body, status] of [[{ message: 'denied' }, 403], [{ message: 'bad' }, 200], [[], 200], [[{ region: 'x' }], 200]]) {
    auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify(body), { status });
    await assert.rejects(listUzLocations());
  }
  const locations = [{ region: 'Namangan viloyati', locality: 'Chust tumani', kind: 'district', sort_order: 1 }];
  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify(locations));
  assert.deepEqual(await listUzLocations(), locations);
});

test('invalid or ambiguous price queries never reach the database', async () => {
  auth.authenticatedSupabaseFetch = async () => { throw new Error('unexpected network request'); };
  for (const query of [{minPrice:'-1'}, {minPrice:'NaN'}, {minPrice:'500',maxPrice:'100'}, {sort:'price_asc'}, {minPrice:'0',currency:'USD'}]) {
    await assert.rejects(loadSuppliers(query), /Narx|valyuta/);
  }
});

test('price and location selections reach the v2 RPC without losing zero bounds', async () => {
  let sent;
  auth.authenticatedSupabaseFetch = async (path, options) => {
    sent = { path, body: JSON.parse(options.body) };
    return new Response('[]');
  };
  await loadSuppliers({region:'Toshkent viloyati',locality:'Yuqorichirchiq tumani',minPrice:'0',maxPrice:'500',currency:'USD',priceUnit:'1 kecha',sort:'price_asc'});
  assert.equal(sent.path,'rpc/admin_list_external_suppliers_v2');
  assert.equal(sent.body.p_min_price,0);
  assert.equal(sent.body.p_currency,'USD');
  assert.equal(sent.body.p_price_unit,'1 kecha');
  assert.equal(sent.body.p_locality,'Yuqorichirchiq tumani');
});
