import { readRequestDraft, type AssistantDraft } from "@/lib/request-assistant";
import { addCalendarDays, hydrateServiceRequest, SERVICE_CATEGORIES, serviceDefinition, serviceFields } from "@/lib/service-request";

// Both the AI schema and the form use the same field keys, choices and labels.
export const AI_SERVICE_DETAILS_SCHEMA = {
  anyOf: SERVICE_CATEGORIES.map((category) => {
    const properties = Object.fromEntries(serviceFields(category).map((field) => [field.key, {
      type: "string", description: `${field.label[0]} / ${field.label[1]}${field.required ? "; required before publishing" : ""}${field.when ? `; only when ${field.when.join("=")}` : ""}${field.type === "number" ? `; numeric string ${field.min ?? 0} to ${field.max ?? 500}` : ""}${field.type === "date" ? "; YYYY-MM-DD" : ""}${field.type === "time" ? "; HH:mm, local time at service location" : ""}. Empty string if unknown.`,
      ...(field.options ? { enum: ["", ...field.options.map(([value]) => value)] } : {}),
    }]));
    return { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: [category] }, ...properties }, required: ["kind", ...Object.keys(properties)] };
  }),
};

export const AI_SERVICE_FIELDS_CONTEXT = SERVICE_CATEGORIES.map((category) => {
  const definition = serviceDefinition(category)!;
  return `${category}: origin=${definition.origin?.[0] || "unused; empty string"}; destination=${definition.destination[0]}; travel_date=${definition.date[0]}. ${definition.fields.filter((field) => field.required).map((field) => `${field.key}${field.when ? ` when ${field.when.join("=")}` : ""}`).join(", ")} are required for publication.`;
}).join("\n");

export function aiRequestToDraft(value: unknown): AssistantDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!SERVICE_CATEGORIES.includes(item.category as typeof SERVICE_CATEGORIES[number])) return null;
  const category = item.category as string;
  const extra = item.service_details && typeof item.service_details === "object" && !Array.isArray(item.service_details) ? item.service_details as Record<string, unknown> : {};
  if (extra.kind !== undefined && extra.kind !== category) return null;
  const legacy = Object.fromEntries(["rooms", "nights", "vehicle", "language"].filter((key) => typeof item[key] === "string" && item[key]).map((key) => [key, item[key]]));
  const serviceDetails = { ...legacy, ...extra };
  // Old AI history and local itinerary drafts used nights. Preserve them on upgrade.
  if (category === "Mehmonxona" && !serviceDetails.check_out && serviceDetails.nights && /^\d+$/.test(String(serviceDetails.nights))) {
    serviceDetails.check_out = addCalendarDays(String(item.travel_date || ""), Number(serviceDetails.nights));
  }
  const draft = readRequestDraft(JSON.stringify({ ...item, service_details: serviceDetails, budget: typeof item.budget === "number" && item.budget > 0 ? item.budget : null }));
  return draft ? hydrateServiceRequest(draft) : null;
}
