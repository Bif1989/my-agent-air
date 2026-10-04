type ContactProfile = { full_name: string | null; company_name: string | null; phone: string | null; city: string | null; agent_type: string | null };
export const AGENT_TYPES = ["Aviakassa", "Turagent", "Turoperator", "Mehmonxona", "Transport", "Gid", "Boshqa"];
export function missingProfileFields(profile: ContactProfile) {
  const fields = [[profile.full_name, "To‘liq ism"], [profile.company_name, "Kompaniya"], [profile.city, "Shahar"], [profile.phone, "Telefon"], [profile.agent_type === "agent" ? "" : profile.agent_type, "Agent turi"]];
  return fields.filter(([value]) => !value?.trim()).map(([, label]) => label!);
}
