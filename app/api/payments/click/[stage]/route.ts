import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const SUCCESS = "Success";

type ClickFields = {
  click_trans_id: string;
  service_id: string;
  click_paydoc_id: string;
  merchant_trans_id: string;
  merchant_prepare_id: string;
  amount: string;
  action: string;
  error: string;
  error_note: string;
  sign_time: string;
  sign_string: string;
};

function clickReply(body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}

function errorReply(fields: Partial<ClickFields>, error: number, note: string) {
  return clickReply({
    click_trans_id: fields.click_trans_id ? Number(fields.click_trans_id) : 0,
    merchant_trans_id: fields.merchant_trans_id || "",
    error,
    error_note: note,
  });
}

function parseFields(raw: string): ClickFields {
  const p = new URLSearchParams(raw);
  return {
    click_trans_id: p.get("click_trans_id") || "",
    service_id: p.get("service_id") || "",
    click_paydoc_id: p.get("click_paydoc_id") || "",
    merchant_trans_id: p.get("merchant_trans_id") || "",
    merchant_prepare_id: p.get("merchant_prepare_id") || "",
    amount: p.get("amount") || "",
    action: p.get("action") || "",
    error: p.get("error") || "",
    error_note: p.get("error_note") || "",
    sign_time: p.get("sign_time") || "",
    sign_string: p.get("sign_string") || "",
  };
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]{32}$/i.test(a) || !/^[0-9a-f]{32}$/i.test(b)) return false;
  const aa = Buffer.from(a.toLowerCase(), "ascii");
  const bb = Buffer.from(b.toLowerCase(), "ascii");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function validSignature(fields: ClickFields, secret: string, isComplete: boolean) {
  const source = isComplete
    ? `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.merchant_prepare_id}${fields.amount}${fields.action}${fields.sign_time}`
    : `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.amount}${fields.action}${fields.sign_time}`;
  const expected = createHash("md5").update(source, "utf8").digest("hex");
  return safeEqualHex(expected, fields.sign_string);
}

function integerAmount(value: string) {
  if (!/^\d+(?:\.0{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function bigintValue(value: string) {
  if (!/^\d+$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function reasonError(reason: string | undefined) {
  if (reason === "amount_mismatch") return [-2, "Incorrect parameter amount"] as const;
  if (reason === "already_paid") return [-4, "Already paid"] as const;
  if (reason === "order_not_found" || reason === "expired") return [-5, "Order not found"] as const;
  if (reason === "prepare_mismatch") return [-6, "Transaction not found"] as const;
  if (reason === "cancelled") return [-9, "Transaction cancelled"] as const;
  if (reason === "transaction_mismatch") return [-4, "Transaction already exists"] as const;
  return [-8, "Error in request"] as const;
}

export async function POST(request: NextRequest, context: { params: Promise<{ stage: string }> }) {
  const { stage } = await context.params;
  const isComplete = stage === "complete";
  if (stage !== "prepare" && stage !== "complete") return clickReply({ error: -3, error_note: "Action not found" });

  const fields = parseFields(await request.text());
  const required = [
    fields.click_trans_id, fields.service_id, fields.click_paydoc_id, fields.merchant_trans_id,
    fields.amount, fields.action, fields.error, fields.sign_time, fields.sign_string,
  ];
  if (isComplete) required.push(fields.merchant_prepare_id);
  if (required.some((v) => !v)) return errorReply(fields, -8, "Error in request");

  const serviceId = process.env.CLICK_SERVICE_ID?.trim() || "";
  const secret = process.env.CLICK_SECRET_KEY?.trim() || "";
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY?.trim() || "";
  if (!serviceId || !secret || !supabaseSecret || process.env.CLICK_ENABLED !== "true") {
    return errorReply(fields, -8, "Service unavailable");
  }
  if (fields.service_id !== serviceId) return errorReply(fields, -8, "Incorrect service_id");
  if (fields.action !== (isComplete ? "1" : "0")) return errorReply(fields, -3, "Action not found");
  if (!validSignature(fields, secret, isComplete)) return errorReply(fields, -1, "SIGN CHECK FAILED!");

  const amount = integerAmount(fields.amount);
  const clickTransId = bigintValue(fields.click_trans_id);
  const clickPaydocId = bigintValue(fields.click_paydoc_id);
  const merchantPrepareId = isComplete && /^\d+$/.test(fields.merchant_prepare_id) ? Number(fields.merchant_prepare_id) : null;
  if (amount === null || clickTransId === null || clickPaydocId === null || (isComplete && (!Number.isSafeInteger(merchantPrepareId) || merchantPrepareId! <= 0))) {
    return errorReply(fields, -8, "Incorrect parameters");
  }

  const admin = createClient(SUPABASE_URL, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (!isComplete) {
    const { data, error } = await admin.rpc("prepare_billing_click_order", {
      p_order_ref: fields.merchant_trans_id,
      p_click_trans_id: clickTransId.toString(),
      p_click_paydoc_id: clickPaydocId.toString(),
      p_amount: amount,
    });
    if (error) {
      console.error("Click prepare RPC failed", error.code || "unknown");
      return errorReply(fields, -8, "Service unavailable");
    }
    const result = (data || {}) as { ok?: boolean; reason?: string; merchant_prepare_id?: number };
    if (!result.ok || !Number.isInteger(result.merchant_prepare_id)) {
      const [code, note] = reasonError(result.reason);
      return errorReply(fields, code, note);
    }
    return clickReply({
      click_trans_id: Number(fields.click_trans_id),
      merchant_trans_id: fields.merchant_trans_id,
      merchant_prepare_id: result.merchant_prepare_id,
      error: 0,
      error_note: SUCCESS,
    });
  }

  const providerError = Number(fields.error);
  if (!Number.isInteger(providerError)) return errorReply(fields, -8, "Incorrect error parameter");
  if (providerError < 0) {
    const { error } = await admin.rpc("cancel_billing_click_order", {
      p_order_ref: fields.merchant_trans_id,
      p_click_trans_id: clickTransId.toString(),
      p_provider_error: providerError,
      p_provider_error_note: fields.error_note,
    });
    if (error) console.error("Click cancellation RPC failed", error.code || "unknown");
    return errorReply(fields, -9, "Transaction cancelled");
  }

  const { data, error } = await admin.rpc("complete_billing_click_order", {
    p_order_ref: fields.merchant_trans_id,
    p_click_trans_id: clickTransId.toString(),
    p_click_paydoc_id: clickPaydocId.toString(),
    p_merchant_prepare_id: merchantPrepareId,
  });
  if (error) {
    console.error("Click complete RPC failed", error.code || "unknown");
    return errorReply(fields, -8, "Service unavailable");
  }

  const result = (data || {}) as { ok?: boolean; reason?: string; merchant_confirm_id?: number };
  if (!result.ok || !Number.isInteger(result.merchant_confirm_id)) {
    const [code, note] = reasonError(result.reason);
    return errorReply(fields, code, note);
  }

  return clickReply({
    click_trans_id: Number(fields.click_trans_id),
    merchant_trans_id: fields.merchant_trans_id,
    merchant_confirm_id: result.merchant_confirm_id,
    error: 0,
    error_note: SUCCESS,
  });
}
