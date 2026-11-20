import { LANDING_ORIGIN } from "@/lib/landing-analytics-consent";

export type LandingAnalyticsConfig =
  | { kind: "gtm"; id: string }
  | { kind: "ga4"; id: string };

const DESTINATION = LANDING_ORIGIN + "/";
const TITLE = "My Agent Air";
const ID = { gtm: /^GTM-[A-Z0-9]{4,16}$/, ga4: /^G-[A-Z0-9]{4,16}$/ };

export function getLandingAnalyticsConfig(env: NodeJS.ProcessEnv = process.env): LandingAnalyticsConfig | null {
  const gtm = env.LANDING_ANALYTICS_GTM_ID?.trim();
  const ga4 = env.LANDING_ANALYTICS_GA4_ID?.trim();
  if (Boolean(gtm) === Boolean(ga4)) return null;
  if (gtm && ID.gtm.test(gtm)) return { kind: "gtm", id: gtm };
  if (ga4 && ID.ga4.test(ga4)) return { kind: "ga4", id: ga4 };
  return null;
}

export function renderAnalyticsFrame(config: LandingAnalyticsConfig, nonce: string) {
  const scriptUrl = config.kind === "gtm"
    ? "https://www.googletagmanager.com/gtm.js?id=" + config.id
    : "https://www.googletagmanager.com/gtag/js?id=" + config.id;
  // The frame never reads location, referrer, parent DOM, or user/account values.
  const baseSettings = `
    window.dataLayer = [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('set','ads_data_redaction',true);
    gtag('set','url_passthrough',false);
    gtag('set','allow_google_signals',false);
    gtag('set','allow_ad_personalization_signals',false);
    gtag('set','page_location',${JSON.stringify(DESTINATION)});
    gtag('set','page_referrer','');
    gtag('set','page_title',${JSON.stringify(TITLE)});
    gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  `;
  const providerSettings = config.kind === "gtm"
    ? `dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});dataLayer.push({event:'maa_landing_view',page_location:${JSON.stringify(DESTINATION)},page_referrer:'',page_title:${JSON.stringify(TITLE)}});`
    : `gtag('js',new Date());gtag('config',${JSON.stringify(config.id)},{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:${JSON.stringify(DESTINATION)},page_referrer:'',page_title:${JSON.stringify(TITLE)}});gtag('event','page_view',{send_to:${JSON.stringify(config.id)},page_location:${JSON.stringify(DESTINATION)},page_referrer:'',page_title:${JSON.stringify(TITLE)}});`;
  const analyticsEndpoints = "https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";
  const csp = `default-src 'none'; object-src 'none'; base-uri 'none'; script-src 'nonce-${nonce}' https://www.googletagmanager.com; connect-src ${analyticsEndpoints}; img-src ${analyticsEndpoints}; form-action 'none'`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><title>${TITLE}</title><script nonce="${nonce}">${baseSettings}${providerSettings}</script><script async src="${scriptUrl}" referrerpolicy="no-referrer"></script></head><body></body></html>`;
}
