const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { VoiceCapture, VoiceError, transcribeVoice, MAX_VOICE_BYTES } = require('../lib/ai-voice.ts');
const auth = require('../lib/supabase-auth.ts');
const { POST } = require('../app/api/ai/transcribe/route.ts');
const { NextRequest } = require('next/server');
let states, errors, audios, stopped, recorders;
let session;
class Recorder extends EventTarget {
  static isTypeSupported(type) { return type.startsWith('audio/webm'); }
  constructor(stream, options) { super(); this.state = 'inactive'; this.mimeType = options?.mimeType || 'audio/webm'; recorders.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => this.dispatchEvent(new Event('stop'))); }
  chunk(size) { const event = new Event('dataavailable'); event.data = new Blob([new Uint8Array(size)]); this.dispatchEvent(event); }
}
function stream() { const track = new EventTarget(); track.stop = () => stopped++; return { getTracks: () => [track] }; }
function capture() { return new VoiceCapture({ state: s => states.push(s), error: e => errors.push(e), audio: a => audios.push(a) }); }
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  states = []; errors = []; audios = []; stopped = 0; recorders = [];
  global.MediaRecorder = Recorder;
  global.window = new EventTarget();
  const storage = new Map();
  global.localStorage = { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream() } } });
  session = { access_token: 'old-token', refresh_token: 'refresh', user: { id: 'actor' } };
  auth.saveSession(session);
  process.env.OPENAI_API_KEY = 'test-only-key';
});
test('double click while permission is pending opens only one recorder', async () => {
  let resolve, calls = 0;
  navigator.mediaDevices.getUserMedia = () => { calls++; return new Promise(r => resolve = r); };
  const c = capture(); const first = c.start(); await c.start();
  assert.equal(calls, 1); resolve(stream()); await first;
  assert.equal(recorders.length, 1); c.cancel();
});
test('navigation cancellation closes a late permission stream without recording', async () => {
  let resolve;
  navigator.mediaDevices.getUserMedia = () => new Promise(r => resolve = r);
  const c = capture(); const first = c.start(); c.cancel(); resolve(stream()); await first;
  assert.equal(stopped, 1); assert.equal(recorders.length, 0); assert.equal(audios.length, 0);
});
test('constructor failure closes microphone and allows retry', async () => {
  const c = capture(); global.MediaRecorder = class extends Recorder { constructor() { throw new Error('failure'); } };
  await c.start(); assert.equal(stopped, 1); assert.equal(errors.length, 1);
  global.MediaRecorder = Recorder; await c.start(); assert.equal(recorders.length, 1); c.cancel();
});
test('cancel discards audio; over-limit chunks close capture without transcription', async () => {
  const c = capture(); await c.start(); recorders[0].chunk(500); c.cancel(); await flush();
  assert.equal(audios.length, 0);
  await c.start(); recorders[1].chunk(MAX_VOICE_BYTES + 1); await flush();
  assert.equal(audios.length, 0); assert.equal(errors[0].code, 'AUDIO_TOO_LARGE'); assert.equal(stopped, 2);
});
test('normal stop creates one complete blob, including final chunk', async () => {
  const c = capture(); await c.start(); recorders[0].chunk(500); c.stop(); recorders[0].chunk(300); await flush();
  assert.equal(audios.length, 1); assert.equal(audios[0].size, 800); assert.equal(stopped, 1);
});
test('401 refresh retries same audio once with updated bearer token', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({url, options});
    if (url.includes('grant_type=refresh_token')) return Response.json({ ...session, access_token: 'fresh-token', refresh_token: 'new-refresh' });
    return options.headers.Authorization === 'Bearer old-token' ? Response.json({}, {status:401}) : Response.json({text:'Samarqand'});
  };
  assert.equal(await transcribeVoice(new Blob([new Uint8Array(500)], {type:'audio/mp4'}), new AbortController().signal), 'Samarqand');
  assert.equal(requests.length, 3);
  assert.equal(requests[2].options.headers.Authorization, 'Bearer fresh-token');
  assert.equal(requests[0].options.body, requests[2].options.body);
  assert.match(requests[0].options.body.get('audio').name, /\.m4a$/);
});
test('logout during refresh prevents retry with a different identity', async () => {
  let count = 0;
  global.fetch = async url => {
    count++;
    if (url.includes('grant_type=refresh_token')) { auth.clearSession(); return Response.json(session); }
    return Response.json({}, {status:401});
  };
  await assert.rejects(transcribeVoice(new Blob([new Uint8Array(500)], {type:'audio/webm'}), new AbortController().signal), e => e.code === 'UNAUTHORIZED');
  assert.equal(count, 2);
});
function request(size = 500, type = 'audio/webm', token = true) {
  const body = new FormData(); body.append('audio', new Blob([new Uint8Array(size)], {type}), 'untrusted.exe');
  return new NextRequest('https://example.invalid/api/ai/transcribe', {method:'POST', headers: token ? {Authorization:'Bearer token'} : {}, body});
}
function provider(allowance = {allowed:true}, upstream = Response.json({text:'Salom'})) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({url, options});
    if (url.endsWith('/auth/v1/user')) return Response.json({id:'actor', is_anonymous:false});
    if (url.endsWith('/rpc/consume_ai_voice_quota')) return Response.json(allowance);
    return upstream;
  }; return calls;
}
test('auth, key, invalid format and oversized bodies cannot make paid calls', async () => {
  const calls = provider();
  assert.equal((await POST(request(500,'audio/webm',false))).status,401);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request())).status,503);
  process.env.OPENAI_API_KEY='test';
  assert.equal((await POST(request(500,'audio/unsupported'))).status,415);
  assert.equal((await POST(request(MAX_VOICE_BYTES+1))).status,413);
  assert.ok(!calls.some(c => c.url.includes('api.openai.com')));
});
test('persistent quota denies before provider; missing quota fails closed', async () => {
  for (const [code, status] of [['TOO_FAST',429],['USER_LIMIT',429],['GLOBAL_LIMIT',429],['ACCOUNT_INACTIVE',403]]) {
    const calls = provider({allowed:false, code}); const res = await POST(request());
    assert.equal(res.status,status); assert.equal((await res.json()).code,code);
    assert.ok(!calls.some(c=>c.url.includes('api.openai.com')));
  }
  global.fetch = async url => url.endsWith('/auth/v1/user') ? Response.json({id:'actor'}) : Response.json({}, {status:404});
  assert.equal((await POST(request())).status,503);
});
test('successful formats are normalized and every response is no-store', async () => {
  for (const [mime, ext] of [['audio/webm;codecs=opus','webm'],['audio/mp4','m4a'],['audio/ogg','ogg']]) {
    const calls = provider(); const res = await POST(request(500,mime));
    assert.equal(res.status,200); assert.equal(res.headers.get('Cache-Control'),'no-store');
    assert.equal(calls.at(-1).options.body.get('file').name,`voice.${ext}`);
    assert.deepEqual(await res.json(), {text:'Salom'});
  }
});
test('upstream response-body timeout retains timeout code', async () => {
  const original = global.setTimeout;
  global.setTimeout = (fn, ms, ...args) => original(fn, ms === 25000 ? 5 : ms, ...args);
  try {
    provider({allowed:true}, {ok:true, json: () => new Promise(() => {})});
    const res = await POST(request());
    assert.equal(res.status,504); assert.equal((await res.json()).code,'TRANSCRIPTION_TIMEOUT');
  } finally { global.setTimeout = original; }
});
test('expired JWT refreshes before first transcription upload', async () => {
  auth.saveSession({...session, access_token: `x.${Buffer.from(JSON.stringify({exp:1})).toString('base64url')}.x`});
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.includes('grant_type=refresh_token')) return Response.json({...session, access_token:'fresh', refresh_token:'new'});
    assert.equal(options.headers.Authorization,'Bearer fresh'); return Response.json({text:'Salom'});
  };
  assert.equal(await transcribeVoice(new Blob([new Uint8Array(500)], {type:'audio/webm'}), new AbortController().signal),'Salom');
  assert.match(calls[0], /grant_type=refresh_token/); assert.equal(calls.length,2);
});
test('permission denial and recorder error allow a clean retry', async () => {
  const c = capture(); navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied','NotAllowedError'); };
  await c.start(); assert.equal(errors[0].name,'NotAllowedError');
  navigator.mediaDevices.getUserMedia = async () => stream(); await c.start();
  recorders[0].dispatchEvent(new Event('error')); await flush();
  assert.equal(stopped,1); assert.equal(audios.length,0); assert.equal(errors[1].code,'RECORDING_FAILED');
  await c.start(); c.cancel();
});
test('stalled multipart upload returns timeout and cannot consume quota', async () => {
  const calls = provider();
  const original = global.setTimeout;
  global.setTimeout = (fn, ms, ...args) => original(fn, ms === 25000 ? 5 : ms, ...args);
  try {
    const body = new ReadableStream({start() {}});
    const req = new NextRequest('https://example.invalid/api/ai/transcribe', {method:'POST',headers:{Authorization:'Bearer token','Content-Type':'multipart/form-data; boundary=voice'},body,duplex:'half'});
    const res = await POST(req); assert.equal(res.status,504);
    assert.equal(calls.length,1);
  } finally { global.setTimeout=original; }
});
test('abort after upload cannot update text; a non-JSON hosting 413 stays readable', async () => {
  const controller = new AbortController();
  global.fetch = async () => { controller.abort(); return Response.json({text:'late'}); };
  await assert.rejects(transcribeVoice(new Blob([new Uint8Array(500)],{type:'audio/webm'}),controller.signal), {name:'AbortError'});
  global.fetch = async () => new Response('FUNCTION_PAYLOAD_TOO_LARGE',{status:413});
  await assert.rejects(transcribeVoice(new Blob([new Uint8Array(500)],{type:'audio/webm'}),new AbortController().signal), e => e.code==='AUDIO_TOO_LARGE');
});
test('no speech and rejected OpenAI key preserve their error codes', async () => {
  provider({allowed:true},Response.json({text:' '}));
  let res = await POST(request()); assert.equal(res.status,422); assert.equal((await res.json()).code,'NO_SPEECH');
  provider({allowed:true},Response.json({error:{message:'private error'}},{status:401}));
  res = await POST(request()); assert.equal(res.status,503); assert.equal((await res.json()).code,'AI_NOT_CONFIGURED');
});
