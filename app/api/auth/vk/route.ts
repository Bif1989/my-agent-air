import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const VK_APP_ID = "54781128";

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

  const queryString = vkParams.map(([key, value]) => `${key}=${value}`).join("&");
  const expectedSign = base64UrlEncode(createHmac("sha256", secretKey).update(queryString).digest());

  return expectedSign === sign;
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.VK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ ok: false, error: "VK secret key is not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const vkAppId = params.get("vk_app_id");
  const vkUserId = params.get("vk_user_id");

  if (vkAppId !== VK_APP_ID || !vkUserId) {
    return NextResponse.json({ ok: false, error: "Invalid VK launch params" }, { status: 401 });
  }

  if (!verifyVkSign(params, secretKey)) {
    return NextResponse.json({ ok: false, error: "Invalid sign" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, vk_user_id: vkUserId });
}
