import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import {
  buildClickPaymentUrl,
  clickError,
  clickResponseBase,
  isDecimalInteger,
  parseClickAmountUzs,
  parseClickForm,
  verifyClickSignature,
  type ClickCallbackFields,
} from "@/lib/server/click-shop";

export const runtime = "nodejs";
export const maxDuration = 15;

const ORDER_REF_RE = /^maa_[0-9a-f]{32}$/;
const START_BODY_LIMIT = 2_048;
type PaymentPurpose = "subscription" | "wallet_topup";

type ClickRpcResult = {
  ok?: boolean;
  reason?: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  subscription_id?: string;
  wallet_ledger_id?: string;
  balance?: number;
};

type PaymentOrder = {
  order_ref: string;
  amount: number;
  expires_at: string;
};

type BillingSettings = {
  wallet_mode_enabled: boolean;
  wallet_topup_min: number;
  wallet_topup_max: number;
};

function env(name: string) {
  return (process.env[name] || "").trim();
}

function clickConfig() {
  return {
    enabled: env("CLICK_ENABLED").toLowerCase() === "true",
    serviceId: env("CLICK_SERVICE_ID"),
    merchantId: env("CLICK_MERCHANT_ID"),
    merchantUserId: env("CLICK_MERCHANT_USER_ID"),
    secretKey: env("CLICK_SECRET_KEY"),
    paymentUrl: env("CLICK_PAYMENT_URL") || "https://my.click.uz/services/pay",
    subscriptionReturnUrl: env("CLICK_RETURN_URL") || "https://agent.bifavia.uz/billing/subscription?payment=click",
    walletReturnUrl: env("CLICK_WALLET_RETURN_URL") || "https://agent.bifavia.uz/billing?payment=click",
  };
}

function serviceClient() {
  const secretKey = env("SUPABASE_SECRET_KEY");
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY_MISSING");
  return createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function requestIsCrossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

async function verifyUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization) || authorization.length > 4096) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: authorization },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const user = (await response.json().catch(() => null)) as { id?: string; is_anonymous?: boolean } | null;
    return user?.id && !user.is_anonymous ? { id: user.id } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readSmallJson(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > START_BODY_LIMIT) return null;
  const text = await request.text();
  if (!text || text.length > START_BODY_LIMIT) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function pendingSubscriptionOrder(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  planCode: string,
  amount: number,
) {
  const { data, error } = await supabase
    .from("billing_payment_orders")
    .select("order_ref,amount,expires_at")
    .eq("user_id", userId)
    .eq("provider", "click")
    .eq("purpose", "subscription")
    .eq("plan_code", planCode)
    .eq("amount", amount)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentOrder | null;
}

async function pendingWalletOrder(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  amount: number,
) {
  const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
  const { data, error } = await supabase
    .from("billing_payment_orders")
    .select("order_ref,amount,expires_at")
    .eq("user_id", userId)
    .eq("provider", "click")
    .eq("purpose", "wallet_topup")
    .is("plan_code", null)
    .eq("amount", amount)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .gte("created_at", twoMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as PaymentOrder | null;
}

async function createPaymentOrder(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  purpose: PaymentPurpose,
  amount: number,
  planCode: string | null,
) {
  const { data, error } = await supabase
    .from("billing_payment_orders")
    .insert({
      user_id: userId,
      provider: "click",
      purpose,
      plan_code: planCode,
      amount,
      currency: "UZS",
      status: "pending",
    })
    .select("order_ref,amount,expires_at")
    .single();
  if (error || !data?.order_ref) throw error || new Error("ORDER_CREATE_FAILED");
  return data as PaymentOrder;
}

async function getBillingSettings(supabase: ReturnType<typeof serviceClient>) {
  const { data, error } = await supabase
    .from("billing_settings")
    .select("wallet_mode_enabled,wallet_topup_min,wallet_topup_max")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) throw error || new Error("BILLING_SETTINGS_MISSING");
  return data as BillingSettings;
}

async function startSubscriptionPayment(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  body: Record<string, unknown>,
  config: ReturnType<typeof clickConfig>,
) {
  const planCode = typeof body.planCode === "string" ? body.planCode.trim() : "monthly_unlimited";
  if (!/^[a-z0-9_]{1,64}$/.test(planCode)) return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });

  const { data: plan, error: planError } = await supabase
    .from("billing_subscription_plans")
    .select("code,price_amount,currency,is_active")
    .eq("code", planCode)
    .maybeSingle();
  if (planError) return NextResponse.json({ error: "PAYMENT_TEMPORARILY_UNAVAILABLE" }, { status: 503 });
  const priceAmount = typeof plan?.price_amount === "number" ? plan.price_amount : NaN;
  if (!plan || !plan.is_active || !Number.isSafeInteger(priceAmount) || priceAmount <= 0 || plan.currency !== "UZS") {
    return NextResponse.json({ error: "PLAN_UNAVAILABLE" }, { status: 409 });
  }

  let order: PaymentOrder;
  try {
    order = await pendingSubscriptionOrder(supabase, userId, plan.code, priceAmount)
      || await createPaymentOrder(supabase, userId, "subscription", priceAmount, plan.code);
  } catch {
    return NextResponse.json({ error: "ORDER_CREATE_FAILED" }, { status: 503 });
  }

  const paymentUrl = buildClickPaymentUrl({
    paymentUrl: config.paymentUrl,
    serviceId: config.serviceId,
    merchantId: config.merchantId,
    merchantUserId: config.merchantUserId,
    orderRef: order.order_ref,
    amount: order.amount,
    returnUrl: config.subscriptionReturnUrl,
  });
  return NextResponse.json({ paymentUrl, orderRef: order.order_ref, expiresAt: order.expires_at, purpose: "subscription" }, { headers: { "Cache-Control": "no-store" } });
}

async function startWalletTopup(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  body: Record<string, unknown>,
  config: ReturnType<typeof clickConfig>,
) {
  let settings: BillingSettings;
  try {
    settings = await getBillingSettings(supabase);
  } catch {
    return NextResponse.json({ error: "PAYMENT_TEMPORARILY_UNAVAILABLE" }, { status: 503 });
  }
  if (!settings.wallet_mode_enabled) return NextResponse.json({ error: "WALLET_MODE_DISABLED" }, { status: 409 });

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < settings.wallet_topup_min || amount > settings.wallet_topup_max) {
    return NextResponse.json({
      error: "INVALID_TOPUP_AMOUNT",
      minAmount: settings.wallet_topup_min,
      maxAmount: settings.wallet_topup_max,
    }, { status: 400 });
  }

  let order: PaymentOrder;
  try {
    order = await pendingWalletOrder(supabase, userId, amount)
      || await createPaymentOrder(supabase, userId, "wallet_topup", amount, null);
  } catch {
    return NextResponse.json({ error: "ORDER_CREATE_FAILED" }, { status: 503 });
  }

  const paymentUrl = buildClickPaymentUrl({
    paymentUrl: config.paymentUrl,
    serviceId: config.serviceId,
    merchantId: config.merchantId,
    merchantUserId: config.merchantUserId,
    orderRef: order.order_ref,
    amount: order.amount,
    returnUrl: config.walletReturnUrl,
  });
  return NextResponse.json({ paymentUrl, orderRef: order.order_ref, expiresAt: order.expires_at, purpose: "wallet_topup", amount: order.amount }, { headers: { "Cache-Control": "no-store" } });
}

async function startPayment(request: NextRequest) {
  const config = clickConfig();
  if (requestIsCrossSite(request)) return NextResponse.json({ error: "CROSS_SITE_REQUEST" }, { status: 403 });
  if (!config.enabled) return NextResponse.json({ error: "CLICK_DISABLED" }, { status: 503 });
  if (!config.serviceId || !config.merchantId || !config.secretKey) return NextResponse.json({ error: "CLICK_NOT_CONFIGURED" }, { status: 503 });

  const user = await verifyUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await readSmallJson(request);
  if (!body) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const purpose: PaymentPurpose = body.purpose === "wallet_topup" ? "wallet_topup" : "subscription";
  const supabase = serviceClient();
  return purpose === "wallet_topup"
    ? startWalletTopup(supabase, user.id, body, config)
    : startSubscriptionPayment(supabase, user.id, body, config);
}

function rpcErrorCode(reason: string | undefined, stage: "prepare" | "complete") {
  switch (reason) {
    case "order_not_found": return -5;
    case "amount_mismatch": return -2;
    case "already_paid": return -4;
    case "prepare_mismatch":
    case "transaction_mismatch": return -6;
    case "cancelled":
    case "expired": return -9;
    case "plan_unavailable": return -7;
    default: return stage === "prepare" ? -7 : -6;
  }
}

function validCallbackBasics(fields: ClickCallbackFields, expectedAction: "0" | "1", serviceId: string) {
  return fields.action === expectedAction && fields.service_id === serviceId && ORDER_REF_RE.test(fields.merchant_trans_id) && isDecimalInteger(fields.click_trans_id) && isDecimalInteger(fields.click_paydoc_id) && /^-?\d{1,6}$/.test(fields.error);
}

async function cancelOrder(fields: ClickCallbackFields) {
  const supabase = serviceClient();
  await supabase.rpc("cancel_billing_click_order", {
    p_order_ref: fields.merchant_trans_id,
    p_click_trans_id: fields.click_trans_id,
    p_provider_error: Number(fields.error),
    p_provider_error_note: fields.error_note.slice(0, 500),
  });
}

async function prepare(fields: ClickCallbackFields) {
  const amount = parseClickAmountUzs(fields.amount);
  if (amount === null) return clickError(fields, -2);
  if (Number(fields.error) < 0) {
    await cancelOrder(fields).catch(() => undefined);
    return clickError(fields, -9);
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("prepare_billing_click_order", {
    p_order_ref: fields.merchant_trans_id,
    p_click_trans_id: fields.click_trans_id,
    p_click_paydoc_id: fields.click_paydoc_id,
    p_amount: amount,
  });
  if (error) return clickError(fields, -7);
  const result = data as ClickRpcResult | null;
  if (!result?.ok || !Number.isSafeInteger(result.merchant_prepare_id)) return clickError(fields, rpcErrorCode(result?.reason, "prepare"));
  return { ...clickResponseBase(fields), merchant_prepare_id: result.merchant_prepare_id, error: 0, error_note: "Success" };
}

async function complete(fields: ClickCallbackFields) {
  const amount = parseClickAmountUzs(fields.amount);
  const prepareId = Number(fields.merchant_prepare_id);
  if (amount === null) return clickError(fields, -2);
  if (!Number.isSafeInteger(prepareId) || prepareId <= 0 || prepareId > 2_147_483_647) return clickError(fields, -6);

  if (Number(fields.error) < 0) {
    await cancelOrder(fields).catch(() => undefined);
    return clickError(fields, -9);
  }

  const supabase = serviceClient();
  const { data: order, error: orderError } = await supabase
    .from("billing_payment_orders")
    .select("amount")
    .eq("order_ref", fields.merchant_trans_id)
    .eq("provider", "click")
    .maybeSingle();
  if (orderError) return clickError(fields, -7);
  if (!order) return clickError(fields, -5);
  if (order.amount !== amount) return clickError(fields, -2);

  const { data, error } = await supabase.rpc("complete_billing_click_order", {
    p_order_ref: fields.merchant_trans_id,
    p_click_trans_id: fields.click_trans_id,
    p_click_paydoc_id: fields.click_paydoc_id,
    p_merchant_prepare_id: prepareId,
  });
  if (error) return clickError(fields, -7);
  const result = data as ClickRpcResult | null;
  if (!result?.ok || !Number.isSafeInteger(result.merchant_confirm_id)) return clickError(fields, rpcErrorCode(result?.reason, "complete"));
  return { ...clickResponseBase(fields), merchant_confirm_id: result.merchant_confirm_id, error: 0, error_note: "Success" };
}

async function callback(request: NextRequest, stage: "prepare" | "complete") {
  const config = clickConfig();
  if (!config.serviceId || !config.secretKey) return NextResponse.json(clickError({}, -8));
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > 32_000) return NextResponse.json(clickError({}, -8));

  const body = await request.text();
  const fields = parseClickForm(body, stage === "complete");
  if (!fields) return NextResponse.json(clickError({}, -8));
  const expectedAction = stage === "prepare" ? "0" : "1";
  if (fields.action !== expectedAction) return NextResponse.json(clickError(fields, -3));
  if (!validCallbackBasics(fields, expectedAction, config.serviceId)) return NextResponse.json(clickError(fields, -8));
  if (!verifyClickSignature(fields, config.secretKey)) return NextResponse.json(clickError(fields, -1));

  try {
    const payload = stage === "prepare" ? await prepare(fields) : await complete(fields);
    return NextResponse.json(payload, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(clickError(fields, -7), { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ stage: string }> }) {
  const { stage } = await context.params;
  if (stage === "start") return startPayment(request);
  if (stage === "prepare" || stage === "complete") return callback(request, stage);
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
