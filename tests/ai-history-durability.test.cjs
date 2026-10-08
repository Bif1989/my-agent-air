const test = require('node:test');
const assert = require('node:assert/strict');

function storageMock() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    key(index) { return Array.from(data.keys())[index] || null; },
    get length() { return data.size; },
    snapshot() { return new Map(data); },
  };
}

function session() {
  return { access_token: 'test-token', refresh_token: 'refresh', user: { id: '11111111-1111-4111-8111-111111111111' } };
}

test('AI history queues a message locally after transient network failure and flushes it idempotently later', async () => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const localStorage = storageMock();
  global.window = { localStorage };
  const history = require('../lib/ai-chat-history.ts');
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new Error('offline');
  };

  try {
    const id = await history.saveAiChatMessage(
      session(),
      '22222222-2222-4222-8222-222222222222',
      'user',
      'offline message',
      [],
      '33333333-3333-4333-8333-333333333333',
    );
    assert.equal(id, '33333333-3333-4333-8333-333333333333');
    assert.equal(calls, 3, 'transient save should retry before queueing');
    const queued = Array.from(localStorage.snapshot().values()).join('');
    assert.match(queued, /offline message/);
    assert.match(queued, /33333333-3333-4333-8333-333333333333/);
    assert.match(queued, /clientCreatedAt/);

    global.fetch = async (url, init) => {
      assert.match(String(url), /ai_chat_messages\?on_conflict=id/);
      assert.equal(init.method, 'POST');
      assert.match(init.headers.Prefer, /ignore-duplicates/);
      const replay = JSON.parse(init.body);
      assert.equal(replay.id, '33333333-3333-4333-8333-333333333333');
      assert.equal(replay.content, 'offline message');
      assert.ok(replay.client_created_at, 'replayed message must preserve its original client timestamp');
      return new Response(null, { status: 201 });
    };
    await history.flushAiChatOutbox(session());
    assert.equal(localStorage.length, 0, 'successful replay should clear the durable outbox');
  } finally {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});

test('AI history source paginates conversations, messages and orders by original client time', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/ai-chat-history.ts'), 'utf8');
  assert.match(source, /CONVERSATION_PAGE_SIZE = 100/);
  assert.match(source, /MESSAGE_PAGE_SIZE = 200/);
  assert.match(source, /offset: String\(offset\)/);
  assert.match(source, /fetchWithRetry/);
  assert.match(source, /flushAiChatOutbox/);
  assert.match(source, /OUTBOX_LIMIT = 100/);
  assert.match(source, /client_created_at: row\.clientCreatedAt/);
  assert.match(source, /order: "client_created_at\.asc,id\.asc"/);
});
