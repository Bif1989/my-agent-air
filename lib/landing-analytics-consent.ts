// This host-only preference contains only an explicit choice, never an account ID.
export const ANALYTICS_COOKIE_NAME = "__Host-maa-analytics";
export const ANALYTICS_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 180;
export const ANALYTICS_SETTINGS_EVENT = "maa:open-analytics-settings";
export const ANALYTICS_PREFERENCE_EVENT = "maa:analytics-preference";
export const LANDING_ORIGIN = "https://agent.bifavia.uz";
export type AnalyticsChoice = "granted" | "denied";

const VERSION = "v1";

export function readAnalyticsChoice(cookieHeader: string): AnalyticsChoice | null {
  const values = cookieHeader.split(";").map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(ANALYTICS_COOKIE_NAME + "="));
  if (values.length !== 1) return null;
  const value = values[0].slice(ANALYTICS_COOKIE_NAME.length + 1);
  if (value === `${VERSION}.granted`) return "granted";
  if (value === `${VERSION}.denied`) return "denied";
  return null;
}

export function serializeAnalyticsChoice(choice: AnalyticsChoice) {
  return `${ANALYTICS_COOKIE_NAME}=${VERSION}.${choice}; Path=/; Max-Age=${ANALYTICS_COOKIE_AGE_SECONDS}; SameSite=Strict; Secure`;
}

export function isAnalyticsLandingPage(origin: string, pathname: string | null, search: string, hash: string) {
  return origin === LANDING_ORIGIN && pathname === "/" && !search && !hash;
}
