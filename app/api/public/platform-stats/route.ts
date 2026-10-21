import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

const PUBLIC_TYPES = ["Mehmonxona", "Turoperator", "Turagent"] as const;

type PublicType = (typeof PUBLIC_TYPES)[number];

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

  const [activeResult, supplierResult, agentProfilesResult, ...typeResults] = await Promise.all([
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
  ]);

  const errors = [activeResult, supplierResult, agentProfilesResult, ...typeResults]
    .map((result) => result.error)
    .filter(Boolean);

  if (errors.length) {
    console.error("Public platform stats load failed", errors.map((error) => error?.message));
    return NextResponse.json(
      { message: "Platforma statistikasi vaqtincha mavjud emas." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const byType = Object.fromEntries(
    PUBLIC_TYPES.map((agentType, index) => [agentType, typeResults[index]?.count ?? 0]),
  ) as Record<PublicType, number>;

  return NextResponse.json(
    {
      supplier_records: supplierResult.count ?? 0,
      hotels: byType.Mehmonxona,
      tour_operators: byType.Turoperator,
      travel_agents: byType.Turagent,
      total_active: activeResult.count ?? 0,
      agent_profiles: agentProfilesResult.count ?? 0,
      updated_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
