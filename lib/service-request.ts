import * as base from "./service-request-base";

export * from "./service-request-base";

const SOURCE_TEXT_KEY = "source_text";
const SOURCE_TEXT_MAX = 2000;

function sourceTextFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const raw = (value as Record<string, unknown>)[SOURCE_TEXT_KEY];
  return typeof raw === "string" ? raw.trim().slice(0, SOURCE_TEXT_MAX) : "";
}

// Publishing should stay fast: detailed service preferences are optional and can be
// clarified in offers/chat. Core route/date/passenger validation remains intact.
export function serviceDefinition(category?: string | null) {
  const definition = base.serviceDefinition(category);
  if (!definition) return undefined;
  return {
    ...definition,
    fields: definition.fields.map((item) => item.required ? { ...item, required: false } : item),
  };
}

// Keep the fields needed for useful quotes visible without making them mandatory.
const QUICK_DETAIL_KEYS: Record<base.ServiceCategory, ReadonlySet<string>> = {
  Aviachipta: new Set(["trip_type", "return_date", "route_details"]),
  "Tur paket": new Set(["transport", "duration_days", "nights"]),
  Mehmonxona: new Set(["check_out", "rooms", "room_type", "meal_plan"]),
  Transfer: new Set(["transfer_type", "pickup_time", "vehicle", "return_date", "return_time", "duration_hours"]),
  Gid: new Set(["language", "duration_hours"]),
  Viza: new Set(["nationality", "visa_purpose", "visa_service"]),
  Boshqa: new Set(["service_name", "quantity", "unit"]),
};

export function splitRequestFormFields(category: string | null | undefined, details: base.ServiceData) {
  if (!category || !Object.hasOwn(QUICK_DETAIL_KEYS, category)) return { quick: [], extra: [] };
  const primary = QUICK_DETAIL_KEYS[category as base.ServiceCategory];
  const visible = (serviceDefinition(category)?.fields || []).filter((item) => base.fieldVisible(item, details));
  return {
    quick: visible.filter((item) => item.required || primary.has(item.key)),
    extra: visible.filter((item) => !item.required && !primary.has(item.key)),
  };
}

export function serviceFields(category?: string | null) {
  const definition = serviceDefinition(category);
  return definition ? [...definition.fields, ...base.COMMON_SERVICE_FIELDS] : [];
}

export function sanitizeServiceData(category: string | undefined | null, value: unknown): base.ServiceData {
  const details = base.sanitizeServiceData(category, value);
  const sourceText = sourceTextFrom(value);
  if (sourceText) details[SOURCE_TEXT_KEY] = sourceText;
  return details;
}

export function hydrateServiceRequest<T extends base.ServiceRequestInput>(input: T): T & { service_details: base.ServiceData; description: string } {
  const hydrated = base.hydrateServiceRequest(input);
  const sourceText = sourceTextFrom(input.service_details);
  if (!sourceText) return hydrated;
  return { ...hydrated, service_details: { ...hydrated.service_details, [SOURCE_TEXT_KEY]: sourceText } };
}

function syntheticRequiredValue(item: base.ServiceField, input: base.ServiceRequestInput) {
  if (item.type === "select") return item.options?.[0]?.[0] || "";
  if (item.type === "number") return String(Math.max(item.min ?? 1, 1));
  if (item.type === "date") {
    if (item.key === "check_out" && input.travel_date) return base.addCalendarDays(input.travel_date, 1) || input.travel_date;
    return input.travel_date || "2099-01-01";
  }
  return "Aniqlashtiriladi";
}

// Keep validation for values the user actually supplied, but do not block publishing
// because a detailed questionnaire preference is unknown. Those details can be clarified
// by the supplier after the request is distributed.
export function requestIssues(input: base.ServiceRequestInput, isRu = false, now = new Date()): base.RequestIssue[] {
  const rawDefinition = base.serviceDefinition(input.category);
  if (!rawDefinition) return base.requestIssues(input, isRu, now);

  const details: base.ServiceData = { ...(input.service_details || {}) };
  const syntheticFields = new Set<string>();

  for (const item of rawDefinition.fields) {
    if (!base.fieldVisible(item, details) || !item.required || details[item.key]) continue;
    // Missing optional times must not participate in same-day transfer ordering.
    if (item.type === "time") {
      delete details[item.key];
      syntheticFields.add(`service_details.${item.key}`);
      continue;
    }
    let value = syntheticRequiredValue(item, input);
    if (item.key === "duration_days" && details.nights && /^\d+$/.test(details.nights)) value = String(Number(details.nights) + 1);
    details[item.key] = value;
    syntheticFields.add(`service_details.${item.key}`);
  }

  const category = input.category || "";
  if ((input.children || 0) > 0 && ["Aviachipta", "Mehmonxona", "Tur paket"].includes(category) && !details.child_ages) {
    details.child_ages = Array.from({ length: input.children || 0 }, () => "2").join(", ");
    syntheticFields.add("service_details.child_ages");
  }
  if ((input.infants || 0) > 0 && ["Aviachipta", "Mehmonxona", "Tur paket"].includes(category) && !details.infant_ages_months) {
    details.infant_ages_months = Array.from({ length: input.infants || 0 }, () => "0").join(", ");
    syntheticFields.add("service_details.infant_ages_months");
  }
  if (input.budget != null && !details.budget_basis) {
    details.budget_basis = "total";
    syntheticFields.add("service_details.budget_basis");
  }

  const originOptional = category === "Tur paket" && !input.origin?.trim();
  const prepared: base.ServiceRequestInput = {
    ...input,
    origin: originOptional ? "O‘zbekiston" : input.origin,
    service_details: details,
  };
  const issues = base.requestIssues(prepared, isRu, now);
  return issues.filter((issue) => !syntheticFields.has(issue.field) && !(originOptional && issue.field === "origin"));
}

export function cleanServiceData(input: base.ServiceRequestInput): base.ServiceData {
  const sourceText = sourceTextFrom(input.service_details);
  const preparedDetails = { ...(input.service_details || {}) };
  if (input.budget != null && !preparedDetails.budget_basis) preparedDetails.budget_basis = "total";
  const details = base.cleanServiceData({ ...input, service_details: preparedDetails });
  if (sourceText) details[SOURCE_TEXT_KEY] = sourceText;
  return details;
}

export function requestTitle(input: Pick<base.ServiceRequestInput, "category" | "origin" | "destination" | "service_details">) {
  const sourceText = sourceTextFrom(input.service_details);
  return sourceText || base.requestTitle(input);
}
