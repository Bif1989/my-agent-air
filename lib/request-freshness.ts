export function tashkentDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isRequestCurrent(request: { travel_date: string | null; created_at: string }, now = new Date()) {
  return request.travel_date ? request.travel_date >= tashkentDate(now) : new Date(request.created_at).getTime() >= now.getTime() - 30 * 86400000;
}

export function requestFreshnessFilter(freshness: "current" | "expired", now = new Date()) {
  const today = tashkentDate(now);
  const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  return freshness === "current"
    ? `or(travel_date.gte.${today},and(travel_date.is.null,created_at.gte.${cutoff}))`
    : `or(travel_date.lt.${today},and(travel_date.is.null,created_at.lt.${cutoff}))`;
}

// PostgREST reserved punctuation is removed from free-text search, not interpreted as a filter.
export function searchFilterText(value: string) { return value.replace(/[,().*%_\\"\r\n]/g, " ").trim().slice(0, 100); }
