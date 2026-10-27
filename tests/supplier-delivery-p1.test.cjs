const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { NextRequest } = require('next/server');
const { POST } = require('../app/api/supplier-outreach/[action]/route.ts');
const originalFetch = global.fetch;
const originals = Object.fromEntries(['SUPABASE_SECRET_KEY','ESKIZ_EMAIL','ESKIZ_PASSWORD'].map(k => [k,process.env[k]]));
after(() => {
  global.fetch = originalFetch;
  for (const [key,value] of Object.entries(originals)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const id='00000000-0000-4000-8000-000000000001';
const token='a'.repeat(48);
function request() {
  return new NextRequest('https://example.invalid/api/supplier-outreach/send-sms', {
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'},
    body:JSON.stringify({invite_id:id,token}),
  });
}
function fixture(options={}) {
  for (const [key,value] of Object.entries({SUPABASE_SECRET_KEY:'test-only',ESKIZ_EMAIL:'test@example.com',ESKIZ_PASSWORD:'test-only'})) process.env[key]=value;
  const state={pending:false,sends:0,status:'queued',begins:0,releases:0};
  global.fetch=async(input,init={}) => {
    const url=new URL(String(input));
    const body=init.body && typeof init.body==='string' ? JSON.parse(init.body) : {};
    if (url.pathname.endsWith('/auth/v1/user')) return Response.json({id:'actor'});
    if (url.pathname.endsWith('/rpc/claim_supplier_invite_delivery')) {
      if (state.pending) return Response.json({claimed:false,status:'delivery_unknown'});
      if (state.status==='sent') return Response.json({claimed:false,status:'sent'});
      return Response.json({claimed:true,claim_id:id,status:'queued'});
    }
    if (url.pathname.endsWith('/rpc/release_supplier_invite_delivery')) {state.releases++;return Response.json(true);}
    if (url.pathname.endsWith('/rpc/begin_supplier_sms_delivery')) {
      state.begins++;
      if (options.beginError) return Response.json({code:'XX000',message:'unavailable'},{status:500});
      if (options.denied) return Response.json(false);
      assert.equal(state.pending,false);
      assert.equal(body.p_token,token);
      assert.equal(body.p_recipient,'998901234567');
      state.pending=true;
      return Response.json(true);
    }
    if (url.pathname.endsWith('/rpc/finish_supplier_sms_delivery')) {
      if (options.finishError) return Response.json({code:'XX000',message:'write unavailable'},{status:500});
      if (body.p_outcome==='accepted') state.status='sent'; else state.status='failed';
      state.pending=false;
      return Response.json(true);
    }
    if (url.pathname.endsWith('/profiles')) return Response.json({id:'actor',role:'agent',is_active:true,registration_status:'active'});
    if (url.pathname.endsWith('/supplier_invites')) return Response.json({id,request_id:'r',supplier_id:'s',created_by:'actor',channel:'sms',recipient:'998901234567',token_hash:createHash('sha256').update(token).digest('hex'),status:state.status,expires_at:'2099-01-01T00:00:00Z'});
    if (url.pathname.endsWith('/requests')) return Response.json({id:'r',status:'open',origin:'Chust',destination:'Toshkent',travel_date:'2026-11-01'});
    if (url.pathname.endsWith('/external_suppliers')) return Response.json({id:'s',contact_count:0});
    if (url.pathname.endsWith('/api/auth/login')) return Response.json({data:{token:'test-provider-token'}});
    if (url.pathname.endsWith('/api/message/sms/send')) {
      assert.equal(state.pending,true,'durable attempt must precede provider call');
      state.sends++;
      if (options.transportError) throw new Error('connection reset after possible acceptance');
      return Response.json(options.noProviderId ? {} : {id:'provider-123'}, {status:options.providerStatus||200});
    }
    throw new Error(`Unexpected mock URL ${url}`);
  };
  return state;
}
for (const [label,options] of [
  ['status persistence fails',{finishError:true}],
  ['provider transport fails',{transportError:true}],
  ['provider returns a server error',{providerStatus:500}],
  ['provider returns a timeout',{providerStatus:408}],
  ['provider returns an ambiguous conflict',{providerStatus:409}],
  ['provider success has no receipt',{noProviderId:true}],
]) test(`SMS retry cannot duplicate an uncertain delivery when ${label}`,async()=>{
  const state=fixture(options);
  const first=await POST(request());
  assert.equal(first.status,503);
  assert.equal((await first.json()).code,'DELIVERY_RECONCILIATION_REQUIRED');
  assert.equal(state.pending,true);
  const second=await POST(request());
  assert.equal(second.status,409);
  assert.equal((await second.json()).code,'DELIVERY_RECONCILIATION_REQUIRED');
  assert.equal(state.sends,1);
  assert.equal(state.begins,1);
  assert.equal(state.releases,1,'claim release must not clear persistent pending state');
});
test('SMS current-state denial and unavailable begin guard never reach provider',async()=>{
  for (const options of [{denied:true},{beginError:true}]) {
    const state=fixture(options);
    assert.equal((await POST(request())).status,options.beginError ? 503 : 409);
    assert.equal(state.sends,0);
    assert.equal(state.pending,false);
  }
});
test('SMS accepted delivery is persisted and terminal retries do not resend',async()=>{
  const state=fixture();
  assert.equal((await POST(request())).status,200);
  assert.equal(state.status,'sent');
  assert.equal(state.pending,false);
  assert.equal((await POST(request())).status,200);
  assert.equal(state.sends,1);
});
test('SMS explicit provider rejection permits a later retry',async()=>{
  const state=fixture({providerStatus:422});
  assert.equal((await POST(request())).status,502);
  assert.equal(state.pending,false);
  assert.equal(state.status,'failed');
  assert.equal((await POST(request())).status,502);
  assert.equal(state.sends,2);
});
