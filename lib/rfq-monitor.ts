import type { OfferRecord } from "@/app/offers/offers-api";
import type { RequestRecord } from "@/app/requests/requests-api";
import type { SupplierInviteRow, SupplierMatch, SupplierType } from "@/app/requests/supplier-matching-api";

export type RfqDetail = {
  request: RequestRecord;
  offers: OfferRecord[];
  invites: SupplierInviteRow[];
  matches: SupplierMatch[];
};

export type RfqRow = {
  key: string;
  requestId: string;
  service: string;
  company: string;
  location: string;
  channel: "supplier" | "agent";
  state: "matched" | "waiting" | "responded" | "accepted" | "unavailable" | "failed";
  price: number | null;
  currency: string;
  score: number | null;
  createdAt: string | null;
  respondedAt: string | null;
  responseHours: number | null;
  note: string;
};

export type RfqSort = "match" | "price" | "location" | "service" | "reply" | "newest";

export function sourceText(request: RequestRecord): string {
  const value = request.service_details?.source_text;
  return typeof value === "string" ? value.trim() : "";
}

export function relatedRequests(all: RequestRecord[], selected: RequestRecord): RequestRecord[] {
  const text = sourceText(selected).replace(/\s+/g, " ").toLocaleLowerCase();
  if (!text) return [selected];
  const baseTime = Date.parse(selected.created_at);
  if (!Number.isFinite(baseTime)) return [selected];
  const matched = all.filter((item) =>
    item.created_by === selected.created_by &&
    sourceText(item).replace(/\s+/g, " ").toLocaleLowerCase() === text &&
    Number.isFinite(Date.parse(item.created_at)) &&
    Math.abs(Date.parse(item.created_at) - baseTime) <= 30 * 60 * 1000
  ).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return matched.slice(0, 8).some((item) => item.id === selected.id) ? matched.slice(0, 8) : [selected];
}

export function supplierTypes(category: string): SupplierType[] {
  if (category === "Mehmonxona") return ["hotel"];
  if (category === "Transfer") return ["transport"];
  if (category === "Gid") return ["guide"];
  if (category === "Tur paket" || category === "Boshqa") return ["hotel", "transport", "guide", "restaurant"];
  return [];
}

export function serviceLabel(type: SupplierType): string {
  return { hotel: "Mehmonxona", transport: "Transport", guide: "Gid", restaurant: "Restoran" }[type];
}

function replyDuration(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const hours = (Date.parse(end) - Date.parse(start)) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 10) / 10 : null;
}

export function buildRfqRows(details: RfqDetail[]): RfqRow[] {
  const map = new Map<string, RfqRow>();
  for (const { request, offers, invites, matches } of details) {
    for (const match of matches) {
      const key = "supplier:" + request.id + ":" + match.id;
      const old = map.get(key);
      if (!old || (match.match_score || 0) > (old.score || 0)) {
        map.set(key, {
          key, requestId: request.id, service: serviceLabel(match.supplier_type),
          company: match.name, location: [match.city, match.region].filter(Boolean).join(", "),
          channel: "supplier", state: "matched", price: null, currency: "",
          score: Number.isFinite(match.match_score) ? match.match_score : null,
          createdAt: null, respondedAt: null, responseHours: null, note: "",
        });
      }
    }
    for (const invite of invites) {
      const key = "supplier:" + request.id + ":" + invite.supplier_id;
      const old = map.get(key);
      const reply = invite.response || {};
      const respondedAt = invite.responded_at || reply.submitted_at || null;
      let state: RfqRow["state"] = "waiting";
      if (invite.status === "responded") state = reply.available === false ? "unavailable" : "responded";
      if (["failed", "expired", "opted_out"].includes(invite.status)) state = "failed";
      const date = invite.created_at || null;
      const newRow: RfqRow = {
        key, requestId: request.id, service: old?.service || request.category,
        company: invite.supplier_name || old?.company || "Hamkor",
        location: old?.location || "", channel: "supplier", state,
        price: state === "responded" && typeof reply.price === "number" && Number.isFinite(reply.price) ? reply.price : null,
        currency: reply.currency || "UZS", score: old?.score ?? null,
        createdAt: date, respondedAt, responseHours: replyDuration(date, respondedAt),
        note: reply.comment || (invite.channel ? invite.channel.toUpperCase() : ""),
      };
      // Keep the newest invitation for the same supplier and same service request.
      if (!old?.createdAt || !date || Date.parse(date) >= Date.parse(old.createdAt)) map.set(key, newRow);
    }
    for (const offer of offers) {
      if (offer.request_id !== request.id || offer.status === "withdrawn") continue;
      const key = "offer:" + offer.id;
      const state: RfqRow["state"] =
        offer.status === "accepted" ? "accepted" :
        offer.status === "rejected" ? "unavailable" : "responded";
      map.set(key, {
        key, requestId: request.id, service: request.category,
        company: offer.agent?.company_name || offer.agent?.full_name || "Agent",
        location: offer.agent?.city || "", channel: "agent", state,
        price: typeof offer.price === "number" && Number.isFinite(offer.price) ? offer.price : null,
        currency: offer.currency || "", score: null, createdAt: offer.created_at,
        respondedAt: offer.created_at, responseHours: null, note: offer.comment || "",
      });
    }
  }
  return [...map.values()];
}

export function sortRfqRows(rows: RfqRow[], sort: RfqSort): RfqRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "match") return (b.score ?? -1) - (a.score ?? -1) || a.company.localeCompare(b.company);
    if (sort === "price") {
      if (a.price === null || b.price === null) return Number(a.price === null) - Number(b.price === null);
      // Different currencies are never numerically compared as if they were equivalent.
      return a.currency.localeCompare(b.currency) || a.price - b.price;
    }
    if (sort === "location") return a.location.localeCompare(b.location) || a.company.localeCompare(b.company);
    if (sort === "service") return a.service.localeCompare(b.service) || a.company.localeCompare(b.company);
    if (sort === "reply") return (a.responseHours ?? Infinity) - (b.responseHours ?? Infinity);
    return (Date.parse(b.respondedAt || b.createdAt || "") || 0) - (Date.parse(a.respondedAt || a.createdAt || "") || 0);
  });
}
