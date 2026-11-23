const test = require("node:test");
const assert = require("node:assert/strict");
const { TERMS_VERSION } = require("../lib/terms-version.ts");
const { makeSignupTermsReceipt, verifiedSignupTerms, persistVerifiedEmailSignupTerms } = require("../lib/server/signup-terms.ts");

const secret = "example-test-secret";
const email = "signup@example.invalid";
const id = "123e4567-e89b-42d3-a456-426614174001";
const origin = "https://example.supabase.co";
const now = new Date();

test("acceptance receipt is stamped by the server, versioned and bound to the signup flow and identity", () => {
  assert.equal(makeSignupTermsReceipt(secret, "email", email, undefined, now), null);
  assert.equal(makeSignupTermsReceipt(secret, "email", email, true, now), null);
  assert.equal(makeSignupTermsReceipt(secret, "email", email, "2000-01-01", now), null);
  const receipt = makeSignupTermsReceipt(secret, "sms", "998000000001:challenge-a", TERMS_VERSION, now);
  const { mac, ...evidence } = receipt;
  assert.deepEqual(evidence, { version: TERMS_VERSION, accepted_at: now.toISOString(), flow: "sms" });
  assert.match(mac, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifiedSignupTerms(secret, "sms", "998000000001:challenge-a", receipt, 10, +now), evidence);
  assert.equal(verifiedSignupTerms(secret, "sms", "998000000001:challenge-b", receipt, 10, +now), null);
  assert.equal(verifiedSignupTerms(secret, "sms", "998000000002:challenge-a", receipt, 10, +now), null);
  assert.equal(verifiedSignupTerms(secret, "email", "998000000001:challenge-a", receipt, 10, +now), null);
  assert.equal(verifiedSignupTerms(secret, "sms", "998000000001:challenge-a", { ...receipt, version: "2000-01-01" }, 10, +now), null);
  assert.equal(verifiedSignupTerms(secret, "sms", "998000000001:challenge-a", receipt, 10, +now + 11), null);
});

test("email promotion writes only verified evidence to app metadata, without touching existing/legacy users", async (t) => {
  const receipt = makeSignupTermsReceipt(secret, "email", email, TERMS_VERSION, now);
  const user = { id, email, created_at: now.toISOString(), user_metadata: { signup_terms_receipt: receipt } };
  const f = t.mock.method(global, "fetch", async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  await persistVerifiedEmailSignupTerms(secret, origin, email, { ...user, user_metadata: {} });
  await persistVerifiedEmailSignupTerms(secret, origin, "someone-else@example.invalid", user);
  await persistVerifiedEmailSignupTerms(secret, origin, email, { ...user, created_at: new Date(+now - 120_000).toISOString() });
  await persistVerifiedEmailSignupTerms(secret, origin, email, { ...user, app_metadata: { signup_terms: {} } });
  assert.equal(f.mock.callCount(), 0);
  await persistVerifiedEmailSignupTerms(secret, origin, email, user);
  assert.equal(f.mock.callCount(), 1);
  const [url, options] = f.mock.calls[0].arguments;
  assert.equal(url, `${origin}/auth/v1/admin/users/${id}`);
  assert.equal(options.method, "PUT");
  assert.deepEqual(JSON.parse(options.body), { app_metadata: { signup_terms: {
    version: TERMS_VERSION, accepted_at: now.toISOString(), flow: "email",
  } } });
});
