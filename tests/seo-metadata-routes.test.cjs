const assert = require("node:assert/strict");
const { test } = require("node:test");
const { isIndexableBuild } = require("../app/seo-config.ts");
const robots = require("../app/robots.ts").default;
const sitemap = require("../app/sitemap.ts").default;

const envKeys = ["VERCEL_ENV", "VERCEL_TARGET_ENV", "MY_AGENT_AIR_INDEXABLE"];
function withDeployEnv(values, callback) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("only production targets or an explicit non-Vercel build marker enable indexing", () => {
  assert.equal(isIndexableBuild({ NODE_ENV: "production" }), false);
  assert.equal(isIndexableBuild({ VERCEL_ENV: "production" }), true);
  assert.equal(isIndexableBuild({ VERCEL_TARGET_ENV: "production" }), true);
  assert.equal(isIndexableBuild({ MY_AGENT_AIR_INDEXABLE: "1" }), true);
  for (const target of ["preview", "development", "staging"]) {
    assert.equal(isIndexableBuild({ VERCEL_ENV: target, MY_AGENT_AIR_INDEXABLE: "1" }), false);
    assert.equal(isIndexableBuild({ VERCEL_ENV: "production", VERCEL_TARGET_ENV: target }), false);
  }
});

test("production robots advertises only the canonical sitemap; sitemap contains only public pages", () => {
  withDeployEnv({ VERCEL_ENV: "production" }, () => {
    assert.deepEqual(robots(), {
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://agent.bifavia.uz/sitemap.xml",
    });
    assert.deepEqual(sitemap(), ["/", "/help", "/privacy", "/terms", "/cookies"].map(
      (path) => ({ url: `https://agent.bifavia.uz${path}` }),
    ));
  });
});

test("preview or unmarked builds do not advertise or serve index targets", () => {
  for (const env of [{ VERCEL_ENV: "preview", MY_AGENT_AIR_INDEXABLE: "1" }, {}]) {
    withDeployEnv(env, () => {
      assert.deepEqual(robots(), { rules: { userAgent: "*", disallow: "/" } });
      assert.deepEqual(sitemap(), []);
    });
  }
});
