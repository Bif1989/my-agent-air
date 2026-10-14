import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const PLAN_CODE = "monthly_unlimited";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.length > 4096) return "";
  return authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}

function buildPaymentUrl(request: NextRequest, orderRef: string, amount: number) {
  const serviceId = process.env.CLICK_SERVICE_ID?.trim();
  const merchantId = process.env.CLICK_MERCHANT_ID?.trim();
  if (!serviceId || !merchantId) return null;

  const url = new URL(process.env.CLICK_PAYMENT_URL?.trim() || "https://my.click.uz/services/pay");
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("merchant_id", merchantId);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("transaction_param", orderRef);
  url.searchParams.set(
    "return_url",
    process.env.CLICK_RETURN_URL?.trim() || `${request.nextUrl.origin}/billing/subscription?payment=click`,
  );
  return url.toString();
}

export async function POST(request: NextRequest) {
  if (process.env.CLICK_ENABLED !== "true") {
    return reply({ code: "CLICK_NOT_ENABLED", message: "CLICK to‘lovi hali yoqilmagan." }, 503);
  }

  const accessToken = bearerToken(request);
  if (!accessToken) return reply({ code: "UNAUTHORIZED", message: "Avtorizatsiya talab qilinadi." }, 401);

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return reply({ code: "PAYMENT_UNAVAILABLE", message: "To‘lov xizmati vaqtincha ishlamayapti." }, 503);

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user?.id) return reply({ code: "UNAUTHORIZED", message: "Sessiya yaroqsiz." }, 401);

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: plan, error: planError } = await admin
    .from("billing_subscription_plans")
    .select("code,price_amount,currency,duration_days,is_active")
    .eq("code", PLAN_CODE)
    .maybeSingle();

  if (planError || !plan || plan.is_active !== true || !Number.isInteger(plan.price_amount) || plan.price_amount <= 0) {
    return reply({ code: "PLAN_UNAVAILABLE", message: "Oylik Unlimited tarifi hozir mavjud emas." }, 409);
  }

  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("billing_payment_orders")
    .select("order_ref,amount,currency,expires_at")
    .eq("user_id", user.id)
    .eq("provider", "click")
    .eq("plan_code", PLAN_CODE)
    .in("status", ["pending", "prepared"])
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Click order lookup failed", existingError.code || "unknown");
    return reply({ code: "PAYMENT_UNAVAILABLE", message: "To‘lov xizmati vaqtincha ishlamayapti." }, 503);
  }

  let order = existing;
  if (!order) {
    const { data: created, error: createError } = await admin
      .from("billing_payment_orders")
      .insert({
        user_id: user.id,
        provider: "click",
        purpose: "subscription",
        plan_code: PLAN_CODE,
        amount: plan.price_amount,
        currency: plan.currency,
      })
      .select("order_ref,amount,currency,expires_at")
      .single();

    if (createError || !created) {
      console.error("Click order creation failed", createError?.code || "unknown");
      return reply({ code: "PAYMENT_UNAVAILABLE", message: "To‘lov buyurtmasini yaratib bo‘lmadi." }, 503);
    }
    order = created;
  }

  const paymentUrl = buildPaymentUrl(request, order.order_ref, Number(order.amount));
  if (!paymentUrl) return reply({ code: "CLICK_NOT_CONFIGURED", message: "CLICK merchant sozlamalari tugallanmagan." }, 503);

  return reply({
    ok: true,
    provider: "click",
    order_ref: order.order_ref,
    amount: Number(order.amount),
    currency: order.currency,
    expires_at: order.expires_at,
    payment_url: paymentUrl,
  });
}
