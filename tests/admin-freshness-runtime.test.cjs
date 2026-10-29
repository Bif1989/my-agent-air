const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/supabase-auth.ts');
const { loadAdminStats } = require('../app/admin/admin-api.ts');
const { requestFreshnessFilter } = require('../lib/request-freshness.ts');
const originalFetch = global.fetch;
after(()=>{global.fetch=originalFetch;});
test('Admin sends valid nested PostgREST filters and keeps current/expired/total counts separate',async()=>{
  const values=new Map();global.window=new EventTarget();
  global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  auth.saveSession({user:{id:'admin'},refresh_token:'fixture',access_token:`e30.${Buffer.from(JSON.stringify({sub:'admin',exp:4102444800})).toString('base64url')}.fixture`});
  const filters=[];
  global.fetch=async(url,init)=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/rpc/count_agents_directory'))return Response.json(0);
    assert.equal(init.method,'HEAD');
    let count=0;
    if(u.pathname.endsWith('/requests')){
      assert.equal(u.searchParams.get('status'),'eq.open');
      const filter=u.searchParams.get('and');filters.push(filter);
      if(filter===null){assert.equal([...u.searchParams.keys()].length,2);count=19;}
      else {assert.match(filter,/^\(or\(travel_date\.(gte|lt)\./);count=filter.includes('travel_date.gte.')?5:14;}
    }
    return new Response(null,{headers:{'content-range':`*/${count}`}});
  };
  const stats=await loadAdminStats();
  assert.deepEqual([stats.openRequests,stats.expiredOpenRequests,stats.totalOpenRequests],[5,14,19]);
  assert.equal(filters.filter(Boolean).length,2);
  assert.equal(stats.openRequests+stats.expiredOpenRequests,stats.totalOpenRequests);
  // The helper is still an expression for listRequests' existing nested and filter.
  assert.match(requestFreshnessFilter('current',new Date('2026-10-28T20:00:00Z')),/^or\(travel_date.gte.2026-10-29,/);
});
