"use client";

import { useEffect, useState } from "react";

type PlatformStatsData = {
  supplier_records: number;
  hotels: number;
  tour_operators: number;
  travel_agents: number;
  total_active: number;
  agent_profiles: number;
  updated_at: string;
};

type StatKey = keyof Pick<
  PlatformStatsData,
  "supplier_records" | "hotels" | "tour_operators" | "travel_agents" | "total_active" | "agent_profiles"
>;

type StatCard = {
  key: StatKey;
  uz: string;
  ru: string;
  icon: string;
};

const CARDS: StatCard[] = [
  { key: "supplier_records", uz: "Supplier bazasi", ru: "База поставщиков", icon: "🗂️" },
  { key: "hotels", uz: "Mehmonxonalar", ru: "Отели", icon: "🏨" },
  { key: "tour_operators", uz: "Turoperatorlar", ru: "Туроператоры", icon: "🌍" },
  { key: "travel_agents", uz: "Turagentlar", ru: "Турагенты", icon: "✈️" },
  { key: "total_active", uz: "Faol hamkorlar", ru: "Активные партнёры", icon: "🤝" },
  { key: "agent_profiles", uz: "Jami agent profillari", ru: "Всего профилей агентов", icon: "👤" },
];

export default function PlatformStats({ isRu }: { isRu: boolean }) {
  const [stats, setStats] = useState<PlatformStatsData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const response = await fetch("/api/public/platform-stats", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as PlatformStatsData;
        if (!cancelled) setStats(data);
      } catch {
        // Keep placeholders visible if the public endpoint is temporarily unavailable.
      }
    }

    void loadStats();
    const timer = window.setInterval(loadStats, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="mt-7 w-full max-w-3xl" aria-label={isRu ? "Статистика платформы" : "Platforma statistikasi"}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
          {isRu ? "База платформы сейчас" : "Platforma bazasida hozir"}
        </p>
        <p className="hidden text-[11px] text-blue-200 sm:block">
          {isRu ? "Обновляется автоматически" : "Avtomatik yangilanadi"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card) => (
          <div
            key={card.key}
            className="rounded-2xl border border-white/15 bg-white/10 px-3 py-3 shadow-lg shadow-blue-950/10 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg" aria-hidden="true">{card.icon}</span>
              <span className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {stats ? stats[card.key].toLocaleString(isRu ? "ru-RU" : "uz-UZ") : "—"}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-medium leading-4 text-blue-100 sm:text-xs">
              {isRu ? card.ru : card.uz}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
