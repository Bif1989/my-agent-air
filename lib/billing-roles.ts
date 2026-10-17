export const BILLING_ROLE_DEFINITIONS = {
  travel_agent: { uz: "Turagent", ru: "Турагент", fee: 5000 },
  aviation: { uz: "Aviakassa", ru: "Авиакасса", fee: 5000 },
  tour_operator: { uz: "Turoperator", ru: "Туроператор", fee: 7000 },
  hotel: { uz: "Mehmonxona", ru: "Отель", fee: 10000 },
  transport: { uz: "Transport", ru: "Транспорт", fee: 7000 },
  guide: { uz: "Gid", ru: "Гид", fee: 3000 },
  restaurant: { uz: "Restoran", ru: "Ресторан", fee: 5000 },
  visa: { uz: "Viza", ru: "Виза", fee: 5000 },
  other: { uz: "Boshqa", ru: "Другое", fee: 5000 },
} as const;

export type BillingRole = keyof typeof BILLING_ROLE_DEFINITIONS;
export type BillingRoleOption = { role: BillingRole; fee: number; uz: string; ru: string; isPrimary?: boolean };

export function normalizeBillingRole(value: string | null | undefined): BillingRole {
  const key = String(value || "").trim().toLowerCase();
  if (["turoperator", "tour_operator", "tour operator"].includes(key)) return "tour_operator";
  if (["mehmonxona", "hotel"].includes(key)) return "hotel";
  if (["transport", "transfer"].includes(key)) return "transport";
  if (["gid", "guide"].includes(key)) return "guide";
  if (["restoran", "restaurant"].includes(key)) return "restaurant";
  if (["turagent", "travel_agent", "travel agent", "agent"].includes(key)) return "travel_agent";
  if (["aviakassa", "aviation", "aviachipta", "avia"].includes(key)) return "aviation";
  if (["viza", "visa"].includes(key)) return "visa";
  return "other";
}

export function billingRoleForCategory(category: string | null | undefined): BillingRole {
  switch (String(category || "").trim().toLowerCase()) {
    case "aviachipta": return "aviation";
    case "mehmonxona": return "hotel";
    case "transfer": return "transport";
    case "tur paket": return "tour_operator";
    case "gid": return "guide";
    case "restoran": return "restaurant";
    case "viza": return "visa";
    default: return "other";
  }
}

export function billingRoleOption(role: BillingRole, isPrimary = false): BillingRoleOption {
  const item = BILLING_ROLE_DEFINITIONS[role];
  return { role, fee: item.fee, uz: item.uz, ru: item.ru, isPrimary };
}

export function rolesFromServiceText(value: string | null | undefined) {
  const text = String(value || "").toLowerCase();
  const roles = new Set<BillingRole>();
  if (/avia|chipta/.test(text)) roles.add("aviation");
  if (/viza|visa/.test(text)) roles.add("visa");
  if (/turoperator|tour operator/.test(text)) roles.add("tour_operator");
  if (/mehmon|hotel/.test(text)) roles.add("hotel");
  if (/transport|transfer/.test(text)) roles.add("transport");
  if (/\bgid\b|guide/.test(text)) roles.add("guide");
  if (/restoran|restaurant/.test(text)) roles.add("restaurant");
  if (/turagent|travel agent/.test(text)) roles.add("travel_agent");
  return [...roles];
}
