import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

const PUBLIC_TYPES = ["Mehmonxona", "Turoperator", "Turagent"] as const;
const METRIC_KEYS = [
  "total_active",
  "supplier_records",
  "agent_profiles",
  "hotels",
  "tour_operators",
  "travel_agents",
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    return NextResponse.json(
      { message: "Platforma statistikasi vaqtincha mavjud emas." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // A temporary failure in one table must not hide valid counts from other tables.
  const queries = [
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "agent")
      .eq("is_active", true)
      .eq("registration_status", "active"),
    admin
      .from("external_suppliers")
      .select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "agent"),
    ...PUBLIC_TYPES.map((agentType) =>
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "agent")
        .eq("is_active", true)
        .eq("registration_status", "active")
        .eq("agent_type", agentType),
    ),
  ];

  const results = await Promise.allSettled(queries);
  const failures: Array<{ metric: MetricKey; status?: number; code?: string; reason: string }> = [];
  const counts = results.map((result, index): number | null => {
    const metric = METRIC_KEYS[index];
    if (result.status === "rejected") {
      failures.push({ metric, reason: "Request rejected before receiving a response" });
      return null;
    }
    const { count, error, status } = result.value;
    if (error || typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      failures.push({
        metric,
        status,
        code: error?.code,
        reason: error?.message?.slice(0, 160) || "Missing count or empty error message",
      });
      return null;
    }
    return count;
  });

  if (failures.length) {
    // Log diagnostic metadata on the server; do not expose upstream errors to visitors.
    console.error("Public platform stats load failed", failures);
  }

  if (counts.every((count) => count === null)) {
    return NextResponse.json(
      { message: "Platforma statistikasi vaqtincha mavjud emas." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const values = Object.fromEntries(
    METRIC_KEYS.map((key, index) => [key, counts[index]]),
  ) as Record<MetricKey, number | null>;

  return NextResponse.json(
    {
      supplier_records: values.supplier_records,
      hotels: values.hotels,
      tour_operators: values.tour_operators,
      travel_agents: values.travel_agents,
      total_active: values.total_active,
      agent_profiles: values.agent_profiles,
      degraded: failures.length > 0,
      updated_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": failures.length
          ? "no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
