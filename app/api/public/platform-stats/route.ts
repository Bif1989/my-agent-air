import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    { message: "Platforma statistikasi vaqtincha mavjud emas." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return unavailable();

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const exact = { count: "exact", head: true } as const;
  const agents = () => admin.from("profiles").select("id", exact).eq("role", "agent");
  const activeAgents = () => agents().eq("is_active", true).eq("registration_status", "active");
  const queries = {
    supplier_records: () => admin.from("external_suppliers").select("id", exact),
    hotels: () => activeAgents().eq("agent_type", "Mehmonxona"),
    tour_operators: () => activeAgents().eq("agent_type", "Turoperator"),
    travel_agents: () => activeAgents().eq("agent_type", "Turagent"),
    total_active: activeAgents,
    agent_profiles: agents,
  };
  const readings = await Promise.all(Object.entries(queries).map(async ([metric, read]) => ({
    metric, read, result: await read(),
  })));

  // The gateway can reject one HEAD while accepting the other five with the same key.
  const failures = readings.filter(({ result }) => result.error);
  if (failures.length === 1 && failures[0].result.status === 401) {
    const [failed] = failures;
    failed.result = await failed.read();
  }

  const counts: Record<string, number> = {};
  for (const { metric, result } of readings) {
    const { count, error, status } = result;
    if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
      console.error("Public platform stats load failed", { metric, status, code: error?.code || undefined });
      return unavailable();
    }
    counts[metric] = count;
  }

  return NextResponse.json(
    { ...counts, updated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
