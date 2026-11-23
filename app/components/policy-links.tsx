"use client";

import Link from "next/link";
import { useUiSettings } from "@/lib/ui-settings";

export default function PolicyLinks() {
  const { isRu } = useUiSettings();
  return (
    <nav aria-label={isRu ? "Правила и настройки" : "Qoidalar va sozlamalar"} className="flex flex-wrap gap-x-4 gap-y-2">
      <Link className="underline-offset-4 hover:underline focus-visible:underline" href="/privacy">{isRu ? "Конфиденциальность" : "Maxfiylik"}</Link>
      <Link className="underline-offset-4 hover:underline focus-visible:underline" href="/terms">{isRu ? "Условия использования" : "Foydalanish shartlari"}</Link>
      <Link className="underline-offset-4 hover:underline focus-visible:underline" href="/cookies">{isRu ? "Файлы cookie" : "Cookie sozlamalari"}</Link>
    </nav>
  );
}
