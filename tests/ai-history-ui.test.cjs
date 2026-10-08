const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/components/ai-command-center.tsx'), 'utf8');

test('AI command center never truncates the visible conversation to 80 messages', () => {
  assert.doesNotMatch(source, /slice\(-80\)/);
  assert.match(source, /setEntries\(\(current\) => \[\.\.\.current\.filter/);
});

test('AI history load failures keep a dedicated error state with retry instead of pretending the chat is empty', () => {
  assert.match(source, /const \[historyError, setHistoryError\]/);
  assert.match(source, /historyReloadKey/);
  assert.match(source, /Tarix o‘chirilmagan/);
  assert.match(source, /Qayta yuklash/);
  assert.doesNotMatch(source, /catch\(\(\) => \{\s*if \(active\) setEntries\(\[greeting\]\)/);
});

test('queued AI history is retried automatically when the browser comes back online', () => {
  assert.match(source, /flushAiChatOutbox/);
  assert.match(source, /addEventListener\("online", flush\)/);
  assert.match(source, /removeEventListener\("online", flush\)/);
});
