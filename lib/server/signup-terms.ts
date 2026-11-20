import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TERMS_VERSION } from "@/lib/terms-version";

export type SignupTermsFlow = "email" | "sms";
type TermsEvidence = { version: string; accepted_at: string; flow: SignupTermsFlow };
type TermsReceipt = TermsEvidence & { mac: string };

function signature(secret: string, evidence: TermsEvidence, subject: string) {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["my-agent-air:signup-terms:v1", evidence.version, evidence.accepted_at, evidence.flow, subject]))
    .digest("hex");
}

export function makeSignupTermsReceipt(secret: string, flow: SignupTermsFlow, subject: string, version: unknown, now = new Date()): TermsReceipt | null {
  if (version !== TERMS_VERSION) return null;
  const evidence = { version, accepted_at: now.toISOString(), flow };
  return { ...evidence, mac: signature(secret, evidence, subject) };
}

export function verifiedSignupTerms(
  secret: string, flow: SignupTermsFlow, subject: string, receipt: unknown, maxAgeMs: number, now = Date.now(),
): TermsEvidence | null {
  if (!receipt || typeof receipt !== "object") return null;
  const { version, accepted_at, flow: issuedFlow, mac } = receipt as Partial<TermsReceipt>;
  if (typeof version !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(version)
      || typeof accepted_at !== "string" || issuedFlow !== flow
      || typeof mac !== "string" || !/^[0-9a-f]{64}$/.test(mac)) return null;
  const age = now - Date.parse(accepted_at);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
  const evidence = { version, accepted_at, flow };
  const expected = signature(secret, evidence, subject);
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(mac, "hex")) ? evidence : null;
}

type EmailUser = { id?: unknown; email?: unknown; created_at?: unknown; app_metadata?: unknown; user_metadata?: unknown };

// Public GoTrue signup can write user_metadata but not app_metadata. Only move a
// verifiable receipt into the admin-only field after successful email signup/OTP.
export async function persistVerifiedEmailSignupTerms(
  secret: string, supabaseUrl: string, email: string, user: EmailUser | undefined,
) {
  if (!user || typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)
      || typeof user.email !== "string" || user.email.toLowerCase() !== email
      || typeof user.created_at !== "string"
      || !user.user_metadata || typeof user.user_metadata !== "object") return;
  if (user.app_metadata && typeof user.app_metadata === "object" && "signup_terms" in user.app_metadata) return;

  const evidence = verifiedSignupTerms(secret, "email", email, (user.user_metadata as Record<string, unknown>).signup_terms_receipt, 7 * 24 * 3600_000);
  if (!evidence) return;
  const createdAt = Date.parse(user.created_at);
  const acceptedAt = Date.parse(evidence.accepted_at);
  if (!Number.isFinite(createdAt) || Math.abs(createdAt - acceptedAt) > 60_000) return;

  try {
    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(1_250), cache: "no-store" }) },
    });
    const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { signup_terms: evidence } });
    if (error) console.warn("Email signup terms receipt finalization failed", error.status);
  } catch {
    // The signed receipt remains in signup metadata; don't fail an already-completed signup.
    console.warn("Email signup terms receipt finalization unavailable");
  }
}
