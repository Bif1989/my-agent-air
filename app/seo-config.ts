// Never derive canonical URLs from request hosts or preview deployment URLs.
export const CANONICAL_ORIGIN = "https://agent.bifavia.uz";
export const PUBLIC_INDEX_PATHS = ["/", "/help", "/privacy", "/terms", "/cookies"] as const;

export function isIndexableBuild(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  // Vercel targets are authoritative, even if the manual build flag was set.
  const targets = [env.VERCEL_ENV, env.VERCEL_TARGET_ENV].filter(Boolean);
  if (targets.length) return targets.every((target) => target === "production");
  // Prebuilt production artifacts can opt in explicitly. A generic local/CI
  // production-mode compilation (NODE_ENV=production) must not opt in.
  return env.MY_AGENT_AIR_INDEXABLE === "1";
}
