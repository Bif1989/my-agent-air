const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteAiConversations } = require('../lib/ai-chat-history.ts');
const session = { access_token: 'test-token', user: { id: 'owner-id' } };

test('AI history deletion scopes single and bulk deletion to the current owner', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json([{ id: 'chat-id' }]);
  };
  try {
    await deleteAiConversations(session, 'chat-id');
    await deleteAiConversations(session);
    assert.equal(calls[0].url.searchParams.get('id'), 'eq.chat-id');
    assert.equal(calls[1].url.searchParams.has('id'), false);
    for (const call of calls) {
      assert.equal(call.url.searchParams.get('user_id'), 'eq.owner-id');
      assert.equal(call.options.method, 'DELETE');
      assert.equal(call.options.headers.Authorization, 'Bearer test-token');
    }
    await assert.rejects(deleteAiConversations(session, ''));
    assert.equal(calls.length, 2, 'Empty ID must not become bulk deletion');
    global.fetch = async () => Response.json([]);
    await assert.rejects(deleteAiConversations(session, 'other-chat'));
    global.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(deleteAiConversations(session));
  } finally { global.fetch = original; }
});
