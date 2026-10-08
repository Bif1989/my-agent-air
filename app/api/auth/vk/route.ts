import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VK_APP_ID = "54781128";
const SUPABASE_URL = "https://fsemjqlreuzvpyvbmxzt.supabase.co";
const VK_SYNTHETIC_EMAIL_DOMAIN = "users.agent.bifavia.uz";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_LAUNCH_AGE_SECONDS = 10 * 60;
const MAX_CLOCK_SKEW_SECONDS = 2 * 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function vkSyntheticEmail(vkUserId: string) {
  return `vk_${vkUserId}@${VK_SYNTHETIC_EMAIL_DOMAIN}`;
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function verifyVkSign(params: URLSearchParams, secretKey: string) {
  const sign = params.get("sign");
  if (!sign) return false;

  const vkParams = Array.from(params.entries())
    .filter(([key]) => key.startsWith("vk_"))
    .sort(([a], [b]) => a.localeCompare(b));

  const queryString = vkParams
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const expectedSign = base64UrlEncode(createHmac("sha256", secretKey).update(queryString).digest());
  const expected = Buffer.from(expectedSign);
  const received = Buffer.from(sign);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function launchTimestampIsFresh(params: URLSearchParams) {
  const raw = params.get("vk_ts");
  if (!raw) return true;
  if (!/^\d{9,13}$/.test(raw)) return false;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return false;
  const seconds = raw.length > 10 ? Math.floor(numeric / 1000) : numeric;
  const now = Math.floor(Date.now() / 1000);
  return seconds >= now - MAX_LAUNCH_AGE_SECONDS && seconds <= now + MAX_CLOCK_SKEW_SECONDS;
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error_code: "PAYLOAD_TOO_LARGE" }, 413);
  }

  const secretKey = process.env.VK_SECRET_KEY?.trim();
  if (!secretKey) {
    return json({ ok: false, error_code: "MISSING_SECRET" }, 500);
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return json({ ok: false, error_code: "INVALID_PARAMS" }, 400);
  }
  const body = rawBody as Record<string, unknown>;

  const params = new URLSearchParams();
  let bodyBytes = 0;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      bodyBytes += key.length + value.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        return json({ ok: false, error_code: "PAYLOAD_TOO_LARGE" }, 413);
      }
      params.set(key, value);
    }
  }

  const vkAppId = params.get("vk_app_id");
  const vkUserId = params.get("vk_user_id");

  if (vkAppId !== VK_APP_ID || !vkUserId || !/^\d{1,20}$/.test(vkUserId)) {
    return json({ ok: false, error_code: "INVALID_PARAMS" }, 401);
  }

  if (!launchTimestampIsFresh(params)) {
    return json({ ok: false, error_code: "STALE_LAUNCH_PARAMS" }, 401);
  }

  if (!verifyVkSign(params, secretKey)) {
    return json({ ok: false, error_code: "INVALID_SIGN" }, 401);
  }

  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseSecretKey) {
    return json({ ok: false, error_code: "MISSING_SECRET" }, 500);
  }

  // Display-only profile data; identity is derived solely from the verified vk_user_id.
  const firstName = typeof body.first_name === "string" ? body.first_name.slice(0, 100) : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.slice(0, 100) : "";
  const photoUrl = typeof body.photo_url === "string" ? body.photo_url.slice(0, 2048) : null;

  const supabaseAdmin = createClient(SUPABASE_URL, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const syntheticEmail = vkSyntheticEmail(vkUserId);

  try {
    const { data: existingIdentity, error: lookupError } = await supabaseAdmin
      .from("vk_identities")
      .select("user_id")
      .eq("vk_user_id", vkUserId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let userId = existingIdentity?.user_id as string | undefined;

    if (!userId) {
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          agent_type: "agent",
          auth_source: "vk",
          vk_user_id: vkUserId,
        },
      });

      if (createError || !createdUser?.user) {
        throw createError ?? new Error("USER_CREATE_FAILED");
      }

      userId = createdUser.user.id;

      const { error: insertError } = await supabaseAdmin.from("vk_identities").insert({
        vk_user_id: vkUserId,
        user_id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        photo_url: photoUrl,
      });

      if (insertError) throw insertError;
    } else {
      const { error: updateError } = await supabaseAdmin
        .from("vk_identities")
        .update({ first_name: firstName || null, last_name: lastName || null, photo_url: photoUrl })
        .eq("vk_user_id", vkUserId);
      if (updateError) throw updateError;
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: syntheticEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      throw linkError ?? new Error("LINK_GENERATE_FAILED");
    }

    const { data: otpData, error: otpError } = await supabaseAdmin.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });

    if (otpError || !otpData?.session) {
      throw otpError ?? new Error("VERIFY_OTP_FAILED");
    }

    return json({
      ok: true,
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      user: otpData.session.user,
    });
  } catch (error) {
    console.error("VK auto-login failed", error instanceof Error ? error.message : "UNKNOWN_ERROR");
    return json({ ok: false, error_code: "VK_LOGIN_FAILED" }, 500);
  }
}
