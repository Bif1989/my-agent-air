const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/supabase-auth.ts');
const { listMessengerConversations } = require('../app/messenger/messenger-api.ts');
const { getSupportContact, getOrCreateSupportChat, setAdminSupportThreadStatus } = require('../lib/support-api.ts');
const { dedupeInFlight } = require('../lib/inflight-dedupe.ts');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; });
function session(id, exp = Math.floor(Date.now()/1000)+3600) {
  return { user:{id}, refresh_token:`refresh-${id}`, access_token:`e30.${Buffer.from(JSON.stringify({sub:id,exp})).toString('base64url')}.fixture` };
}
beforeEach(() => {
  const values = new Map();
  global.window = new EventTarget();
  global.localStorage = { getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v), removeItem:k=>values.delete(k) };
  Object.defineProperty(global, 'navigator', {configurable:true,value:{}});
  auth.clearSession();
  auth.saveSession(session('A'));
});
for (const status of [200,401]) test(`account switch rejects a delayed ${status} without replaying as another user`, async () => {
  let finish, calls=0;
  global.fetch=async()=>{calls++;return new Promise(resolve=>{finish=resolve});};
  const old=listMessengerConversations();
  // Model a cross-tab storage write rather than calling the local save helper.
  localStorage.setItem(auth.SESSION_STORAGE_KEY,JSON.stringify(session('B')));
  finish(Response.json([{last_message:'A-private'}],{status}));
  await assert.rejects(old,/AUTH_SESSION_CHANGED/);
  assert.equal(calls,1);
});
test('a mutation waiting for refresh cannot run under the replacement account', async () => {
  auth.saveSession(session('A',0));
  let finish, calls=0;
  global.fetch=async()=>{calls++;return new Promise(resolve=>{finish=resolve});};
  const mutation=auth.authenticatedSupabaseFetch('rpc/get_or_create_support_chat',{method:'POST',body:'{}'});
  auth.saveSession(session('B'));
  finish(Response.json(session('A')));
  await assert.rejects(mutation,/AUTH_SESSION_CHANGED/);
  assert.equal(calls,1,'only the original refresh ran, never the mutation');
  assert.equal(auth.getStoredSession().user.id,'B');
});
test('account A to B to A still invalidates the old A request', async () => {
  let finish;
  global.fetch=async()=>new Promise(resolve=>{finish=resolve});
  const request=auth.authenticatedSupabaseFetch('requests');
  auth.saveSession(session('B'));auth.saveSession(session('A'));
  finish(Response.json([]));
  await assert.rejects(request,/AUTH_SESSION_CHANGED/);
});
test('same-account 401 refresh preserves request body and completes normally', async () => {
  let dataCalls=0;
  global.fetch=async(url,init)=>{
    if(String(url).includes('/auth/v1/')) return Response.json({...session('A'),refresh_token:'rotated'});
    assert.equal(init.body,'{"fixture":true}');
    return Response.json({}, {status:++dataCalls===1?401:200});
  };
  assert.equal((await auth.authenticatedSupabaseFetch('requests',{method:'POST',body:'{"fixture":true}'})).status,200);
  assert.equal(dataCalls,2);
});
test('in-flight dedupe separates users and clears both success and rejection', async () => {
  let calls=0,finish;
  const read=()=>{calls++;return new Promise(r=>{finish=r});};
  const a=dedupeInFlight('fixture','A',read);
  assert.equal(dedupeInFlight('fixture','A',read),a);
  const b=dedupeInFlight('fixture','B',async()=>{calls++;return 'B'});
  finish('A');await Promise.all([a,b]);assert.equal(calls,2);
  await dedupeInFlight('fixture','A',async()=>{calls++;});assert.equal(calls,3);
  await assert.rejects(dedupeInFlight('fixture','A',async()=>{throw Error('offline')}),/offline/);
  assert.equal(await dedupeInFlight('fixture','A',async()=>'recovered'),'recovered');
});
test('support reads share only inside one user; create/status mutations all execute', async () => {
  let reads=0,writes=0;const finishes=[];
  global.fetch=async(url)=>{
    if(String(url).endsWith('/rpc/get_support_contact')) {
      reads++;return new Promise(resolve=>finishes.push(()=>resolve(Response.json({ok:true}))));
    }
    writes++;return Response.json('fixture-room');
  };
  const a=getSupportContact();assert.equal(getSupportContact(),a);
  auth.saveSession(session('B'));const b=getSupportContact();assert.notEqual(a,b);
  finishes.forEach(f=>f());
  const results=await Promise.allSettled([a,b]);
  assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');assert.equal(reads,2);
  await Promise.all([getOrCreateSupportChat(),getOrCreateSupportChat(),setAdminSupportThreadStatus('u','open'),setAdminSupportThreadStatus('u','open')]);
  assert.equal(writes,4);
});
