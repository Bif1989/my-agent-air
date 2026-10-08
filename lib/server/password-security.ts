import { createHash } from "node:crypto";

export const MIN_NEW_PASSWORD_LENGTH = 10;
export const MAX_NEW_PASSWORD_LENGTH = 1024;
const HIBP_TIMEOUT_MS = 5_000;

export type PasswordExposureResult =
  | { status: "safe" }
  | { status: "leaked" }
  | { status: "unavailable"; reason: "timeout" | "network" | "upstream" };

export function newPasswordValidationMessage(password: string) {
  if (password.length < MIN_NEW_PASSWORD_LENGTH) {
    return `Parol kamida ${MIN_NEW_PASSWORD_LENGTH} belgidan iborat bo‘lsin.`;
  }
  if (password.length > MAX_NEW_PASSWORD_LENGTH) {
    return "Parol juda uzun. Boshqa parol tanlang.";
  }
  return "";
}

/**
 * Checks the Have I Been Pwned Pwned Passwords range API using k-anonymity.
 * Only the first five SHA-1 hex characters leave our server; the password and
 * full password hash are never sent to the provider.
 */
export async function checkPasswordExposure(password: string): Promise<PasswordExposureResult> {
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
        "User-Agent": "My-Agent-Air password security",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable", reason: "upstream" };
    const body = await response.text();
    const leaked = body.split(/\r?\n/).some((line) => line.slice(0, 35).toUpperCase() === suffix);
    return leaked ? { status: "leaked" } : { status: "safe" };
  } catch {
    return { status: "unavailable", reason: controller.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timeout);
  }
}
