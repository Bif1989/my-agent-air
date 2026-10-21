"use client";

import { useEffect, useState } from "react";

type PlatformStatsData = {
  total_active: number;
  hotels: number;
  tour_operators: number;
  travel_agents: number;
  updated_at: string;
};

type StatCard = {
  key: keyof Pick<PlatformStatsData, "hotels" | "tour_operators" | "travel_agents" | "total_active">;
  uz: string;
  ru: string;
  icon: string;
};

const CARDS: StatCard[] = [
  { key: "hotels", uz: "Mehmonxonalar", ru: "Отели", icon: "🏨" },
  { key: "tour_operators", uz: "Turoperatorlar", ru: "Туроператоры", icon: "🌍" },
  { key: "travel_agents", uz: "Turagentlar", ru: "Турагенты", icon: "✈️" },
  { key: "total_active", uz: "Faol hamkorlar", ru: "Активные партнёры", icon: "🤝" },
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
        // Keep the section visible with placeholders when the public stats endpoint is unavailable.
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
    <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:px-6 lg:px-10">
      <div className="rounded-3xl border border-blue-100 bg-white p-4 shadow-xl shadow-blue-950/10 sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
              {isRu ? "Участники платформы" : "Platforma ishtirokchilari"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#0b1f3a] sm:text-xl">
              {isRu ? "Сколько партнёров уже в My Agent Air" : "My Agent Air bazasida hozir"}
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            {isRu ? "Данные обновляются автоматически" : "Ma’lumotlar avtomatik yangilanadi"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CARDS.map((card) => (
            <div key={card.key} className="rounded-2xl bg-[#f7fbff] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xl" aria-hidden="true">{card.icon}</span>
                <span className="text-3xl font-bold tracking-tight text-[#0f4c81] sm:text-4xl">
                  {stats ? stats[card.key].toLocaleString(isRu ? "ru-RU" : "uz-UZ") : "—"}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700 sm:text-base">
                {isRu ? card.ru : card.uz}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
