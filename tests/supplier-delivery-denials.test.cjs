const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { POST } = require('../app/api/supplier-outreach/[action]/route.ts');
const originalFetch = global.fetch;
const originalSecret = process.env.SUPABASE_SECRET_KEY;
afterEach(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
});
function request(action) {
  return new NextRequest(`https://example.invalid/api/supplier-outreach/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify({ invite_id: '00000000-0000-4000-8000-000000000001', token: 'a'.repeat(48) }),
  });
}
test('denied delivery claims never reach email/SMS providers or downstream handlers', async () => {
  process.env.SUPABASE_SECRET_KEY = 'test-only-secret';
  for (const action of ['send', 'send-sms']) {
    for (const status of ['opted_out', 'forbidden', 'expired', 'request_not_open', 'invalid', 'in_flight', 'unexpected']) {
      const calls = [];
      global.fetch = async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'actor' });
        if (url.endsWith('/rpc/claim_supplier_invite_delivery')) return Response.json({ claimed: false, status });
        throw new Error(`Unexpected downstream request: ${url}`);
      };
      const response = await POST(request(action));
      assert.equal(response.status, 409, `${action}: ${status}`);
      assert.equal(calls.length, 2);
    }
  }
});
test('unavailable delivery guard fails closed', async () => {
  process.env.SUPABASE_SECRET_KEY = 'test-only-secret';
  let calls = 0;
  global.fetch = async (input) => {
    calls++;
    if (String(input).endsWith('/auth/v1/user')) return Response.json({ id: 'actor' });
    return Response.json({ message: 'database unavailable', code: 'XX000' }, { status: 500 });
  };
  assert.equal((await POST(request('send'))).status, 503);
  assert.equal(calls, 2);
});
