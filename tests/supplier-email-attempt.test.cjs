const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { NextRequest } = require('next/server');
const { POST } = require('../app/api/supplier-outreach/[action]/route.ts');
const originalFetch=global.fetch;
const envKeys=['SUPABASE_SECRET_KEY','RESEND_API_KEY'];
const originals=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
after(()=>{global.fetch=originalFetch;for(const [k,v] of Object.entries(originals))if(v===undefined)delete process.env[k];else process.env[k]=v;});
const id='00000000-0000-4000-8000-000000000001',token='a'.repeat(48);
const request=()=>new NextRequest('https://example.invalid/api/supplier-outreach/send',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture'},body:JSON.stringify({invite_id:id,token}),
});
function fixture(options={}){
  process.env.SUPABASE_SECRET_KEY='fixture';process.env.RESEND_API_KEY='fixture';
  const state={pending:false,status:'queued',sends:0,begins:0,releases:0};
  global.fetch=async(input,init={})=>{
    const url=new URL(String(input));const body=typeof init.body==='string'?JSON.parse(init.body):{};
    if(url.pathname.endsWith('/auth/v1/user'))return Response.json({id:'actor'});
    if(url.pathname.endsWith('/rpc/claim_supplier_invite_delivery'))return Response.json(state.pending?{claimed:false,status:'delivery_unknown'}:state.status==='sent'?{claimed:false,status:'sent'}:{claimed:true,claim_id:id});
    if(url.pathname.endsWith('/rpc/release_supplier_invite_delivery')){state.releases++;return Response.json(true);}
    if(url.pathname.endsWith('/rpc/begin_supplier_email_delivery')){
      state.begins++;
      assert.equal(body.p_claim_id,id);assert.equal(body.p_token,token);assert.equal(body.p_recipient,'fixture@example.invalid');
      if(options.beginError)return Response.json({code:'XX000'},{status:500});
      if(options.denied)return Response.json(false);
      assert.equal(state.pending,false);state.pending=true;return Response.json(true);
    }
    if(url.pathname.endsWith('/rpc/finish_supplier_email_delivery')){
      assert.equal(body.p_attempt_id,id);assert.equal(body.p_outcome,'accepted');assert.equal(body.p_provider_id,'provider-123');
      if(options.finishError)return Response.json({code:'XX000'},{status:500});
      if(options.finishFalse)return Response.json(false);
      state.pending=false;state.status='sent';return Response.json(true);
    }
    if(url.pathname.endsWith('/profiles'))return Response.json({id:'actor',role:'agent',is_active:true,registration_status:'active'});
    if(url.pathname.endsWith('/supplier_invites'))return Response.json({id,request_id:'r',supplier_id:'s',created_by:'actor',channel:'email',recipient:'fixture@example.invalid',token_hash:createHash('sha256').update(token).digest('hex'),status:state.status,expires_at:'2099-01-01'});
    if(url.pathname.endsWith('/requests'))return Response.json({id:'r',status:'open',category:'Transfer'});
    if(url.pathname.endsWith('/external_suppliers'))return Response.json({id:'s',name:'Fixture',contact_count:0,opt_out:false,status:'registry'});
    if(url.pathname.endsWith('/outreach_email_suppressions'))return Response.json(null);
    if(url.hostname==='api.resend.com'){
      assert.equal(state.pending,true,'DB attempt must precede provider request');state.sends++;
      assert.equal(init.headers['Idempotency-Key'],`supplier-email-${id}-${id}`);
      if(options.transportError)throw Error('fixture accepted but response lost');
      return Response.json(options.noReceipt?{}:{id:'provider-123'},{status:options.status||200});
    }
    throw Error(`Unexpected fixture URL ${url}`);
  };
  return state;
}
for(const [label,options] of [
 ['lost response',{transportError:true}],['timeout',{status:408}],['conflict',{status:409}],['server failure',{status:500}],
 ['provider rejection without verified reconciliation',{status:422}],['missing receipt',{noReceipt:true}],
 ['finish unavailable',{finishError:true}],['finish rejected attempt',{finishFalse:true}],
])test(`uncertain email ${label} leaves pending and blocks a second send`,async()=>{
  const state=fixture(options);const first=await POST(request());assert.equal(first.status,503);
  assert.equal((await first.json()).code,'DELIVERY_RECONCILIATION_REQUIRED');assert.equal(state.pending,true);
  assert.equal((await POST(request())).status,409);assert.equal(state.sends,1);assert.equal(state.begins,1);assert.equal(state.releases,1);
});
test('email begin denial or missing migration never reaches provider',async()=>{
  for(const options of [{denied:true},{beginError:true}]){
    const state=fixture(options);assert.equal((await POST(request())).status,options.beginError?503:409);assert.equal(state.sends,0);assert.equal(state.pending,false);
  }
});
test('accepted email persists its receipt and terminal retry does not resend',async()=>{
  const state=fixture();assert.equal((await POST(request())).status,200);assert.equal(state.pending,false);assert.equal(state.status,'sent');
  assert.equal((await POST(request())).status,200);assert.equal(state.sends,1);
});
