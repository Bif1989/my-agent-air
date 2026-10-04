export type ServiceDetails = { rooms: string; nights: string; vehicle: string; language: string };
const heading = "\n\nXizmat tafsilotlari:\n";
export function splitServiceDetails(description: string | null | undefined) {
  const details: ServiceDetails = { rooms: "", nights: "", vehicle: "", language: "" };
  const text = description || "";
  const index = text.lastIndexOf(heading);
  if (index < 0) return { text, details };
  const lines = text.slice(index + heading.length).split("\n");
  const fields: Record<string, keyof ServiceDetails> = { "Xonalar": "rooms", "Tunlar": "nights", "Transport": "vehicle", "Til": "language" };
  for (const line of lines) {
    const separator = line.indexOf(": ");
    const field = fields[line.slice(0, separator)];
    if (!field) return { text, details: { rooms: "", nights: "", vehicle: "", language: "" } };
    details[field] = line.slice(separator + 2);
  }
  return { text: text.slice(0, index), details };
}
export function joinServiceDetails(text: string, category: string, details: ServiceDetails) {
  const pairs = category === "Mehmonxona" ? [["Xonalar", details.rooms], ["Tunlar", details.nights]] : category === "Transfer" ? [["Transport", details.vehicle]] : category === "Gid" ? [["Til", details.language]] : [];
  const lines = pairs.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`);
  return text.trim() + (lines.length ? heading + lines.join("\n") : "");
}
