import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as sendEmailPost } from "@/lib/server/supplier-outreach-actions/send";
import { POST as sendSmsPost } from "@/lib/server/supplier-outreach-actions/send-sms";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/i;

type Handler = (request: NextRequest) => Promise<Response>;
type DeliveryBody = { invite_id?: unknown; token?: unknown };
type DeliveryClaim = { claimed?: boolean; claim_id?: unknown; status?: unknown };

const handlers: Record<string, Handler> = {
  send: sendEmailPost,
  "send-sms": sendSmsPost,
};

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.length > 4096) return "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || "";
}

function response(code: string, message: string, status: number) {
  return NextResponse.json(
    { code, message },
    { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
  );
}

async function withDeliveryClaim(request: NextRequest, handler: Handler) {
  // Parse only a bounded clone. The original request remains untouched for the
  // existing action handler, which performs the authoritative validation too.
  const body = await readBoundedJson<DeliveryBody>(request.clone(), MAX_BODY_BYTES);
  const inviteId = typeof body?.invite_id === "string" ? body.invite_id.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const accessToken = bearerToken(request);

  // Let the existing handler return its established validation error shape.
  if (!UUID_RE.test(inviteId) || !TOKEN_RE.test(token) || !accessToken) return handler(request);

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return handler(request);

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user?.id) return handler(request);

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await admin.rpc("claim_supplier_invite_delivery", {
    p_invite_id: inviteId,
    p_actor_id: user.id,
    p_token: token,
  });
  if (error) {
    console.error("Supplier delivery claim failed", error.code || "unknown");
    return response("OUTREACH_UNAVAILABLE", "Yuborish xizmati vaqtincha ishlamayapti.", 503);
  }

  const claim = (data || {}) as DeliveryClaim;
  if (claim.claimed !== true) {
    if (claim.status === "in_flight") {
      return response("DELIVERY_IN_PROGRESS", "Bu xabar hozir yuborilmoqda. Biroz kuting.", 409);
    }
    // Terminal, expired and authorization cases are intentionally delegated so
    // the existing action keeps its precise public response semantics.
    return handler(request);
  }

  const claimId = typeof claim.claim_id === "string" ? claim.claim_id : "";
  if (!UUID_RE.test(claimId)) {
    console.error("Supplier delivery claim returned an invalid claim id");
    return response("OUTREACH_UNAVAILABLE", "Yuborish xizmati vaqtincha ishlamayapti.", 503);
  }

  try {
    return await handler(request);
  } finally {
    const { error: releaseError } = await admin.rpc("release_supplier_invite_delivery", {
      p_invite_id: inviteId,
      p_claim_id: claimId,
    });
    if (releaseError) console.error("Supplier delivery claim release failed", releaseError.code || "unknown");
  }
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.pathname.split("/").filter(Boolean).at(-1) || "";
  const handler = handlers[action];
  if (!handler) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Endpoint topilmadi." },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  return withDeliveryClaim(request, handler);
}
