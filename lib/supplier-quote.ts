export function supplierQuoteCurrency(currency: string | null | undefined) {
  return currency && ["UZS", "USD", "EUR", "RUB"].includes(currency) ? currency : "UZS";
}

export function supplierQuoteComment(input: { available: boolean; tax: string; cancellation: string; comment: string; lang: "uz" | "ru" }) {
  const comment = input.comment.trim().slice(0, input.available ? 520 : 1000);
  if (!input.available) return comment || null;
  const tax = input.tax.trim().slice(0, 140);
  const cancellation = input.cancellation.trim().slice(0, 220);
  return [
    tax && (input.lang === "ru" ? "Налоги и сборы: " : "Soliqlar va yig‘imlar: ") + tax,
    cancellation && (input.lang === "ru" ? "Условия отмены: " : "Bekor qilish shartlari: ") + cancellation,
    comment,
  ].filter(Boolean).join("\n") || null;
}
