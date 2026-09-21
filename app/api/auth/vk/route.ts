import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VK_APP_ID = "54781128";
const SUPABASE_URL = "https://fsemjqlreuzvpyvbmxzt.supabase.co";
const VK_SYNTHETIC_EMAIL_DOMAIN = "users.agent.bifavia.uz";

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
  if (!sign) {
    return false;
  }

  const vkParams = Array.from(params.entries())
    .filter(([key]) => key.startsWith("vk_"))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const queryString = vkParams
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const expectedSign = base64UrlEncode(createHmac("sha256", secretKey).update(queryString).digest());

  return expectedSign === sign;
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.VK_SECRET_KEY?.trim();
  if (!secretKey) {
    return NextResponse.json({ ok: false, error_code: "MISSING_SECRET" }, { status: 500 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ ok: false, error_code: "INVALID_PARAMS" }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const vkAppId = params.get("vk_app_id");
  const vkUserId = params.get("vk_user_id");

  if (vkAppId !== VK_APP_ID || !vkUserId) {
    return NextResponse.json({ ok: false, error_code: "INVALID_PARAMS" }, { status: 401 });
  }

  if (!verifyVkSign(params, secretKey)) {
    return NextResponse.json({ ok: false, error_code: "INVALID_SIGN" }, { status: 401 });
  }

  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseSecretKey) {
    return NextResponse.json({ ok: false, error_code: "MISSING_SECRET" }, { status: 500 });
  }

  // Display-only profile data; identity is derived solely from the verified vk_user_id.
  const firstName = typeof body.first_name === "string" ? body.first_name : "";
  const lastName = typeof body.last_name === "string" ? body.last_name : "";
  const photoUrl = typeof body.photo_url === "string" ? body.photo_url : null;

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

    if (lookupError) {
      throw lookupError;
    }

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

      if (insertError) {
        throw insertError;
      }
    } else {
      await supabaseAdmin
        .from("vk_identities")
        .update({ first_name: firstName || null, last_name: lastName || null, photo_url: photoUrl })
        .eq("vk_user_id", vkUserId);
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

    return NextResponse.json({
      ok: true,
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      user: otpData.session.user,
    });
  } catch (error) {
    console.error("VK auto-login failed", error);
    return NextResponse.json({ ok: false, error_code: "VK_LOGIN_FAILED" }, { status: 500 });
  }
}
