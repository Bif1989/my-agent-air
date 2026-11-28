const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("public stats fetch permits the existing CDN cache policy", () => {
  const client = readFileSync(join(__dirname, "../app/components/platform-stats.tsx"), "utf8");
  const route = readFileSync(join(__dirname, "../app/api/public/platform-stats/route.ts"), "utf8");

  assert.match(client, /fetch\(["']\/api\/public\/platform-stats["']\)/);
  assert.doesNotMatch(client, /fetch\(["']\/api\/public\/platform-stats["'],\s*\{\s*cache:\s*["']no-store["']/);
  assert.match(route, /public, s-maxage=60, stale-while-revalidate=300/);
  assert.match(client, /document\.visibilityState !== "visible" \|\| !navigator\.onLine/);
});
