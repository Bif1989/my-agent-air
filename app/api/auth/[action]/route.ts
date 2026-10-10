import { NextRequest, NextResponse } from "next/server";
import { POST as passwordPost } from "@/lib/server/auth-actions/password";
import { POST as recoverPost } from "@/lib/server/auth-actions/recover";
import { POST as resendSignupPost } from "@/lib/server/auth-actions/resend-signup";
import { POST as signupPost } from "@/lib/server/auth-actions/signup";
import { POST as updatePasswordPost } from "@/lib/server/auth-actions/update-password";
import { POST as verifySignupPost } from "@/lib/server/auth-actions/verify-signup";

export const runtime = "nodejs";
export const maxDuration = 20;

type Handler = (request: NextRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  password: passwordPost,
  recover: recoverPost,
  "resend-signup": resendSignupPost,
  signup: signupPost,
  "update-password": updatePasswordPost,
  "verify-signup": verifySignupPost,
};

export async function POST(request: NextRequest) {
  const action = request.nextUrl.pathname.split("/").filter(Boolean).at(-1) || "";
  const handler = handlers[action];
  if (!handler) {
    return NextResponse.json(
      { code: "NOT_FOUND", message: "Endpoint topilmadi." },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
  return handler(request);
}
