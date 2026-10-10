import { NextRequest, NextResponse } from "next/server";
import { POST as sendEmailPost } from "@/lib/server/supplier-outreach-actions/send";
import { POST as sendSmsPost } from "@/lib/server/supplier-outreach-actions/send-sms";

export const runtime = "nodejs";
export const maxDuration = 15;

type Handler = (request: NextRequest) => Promise<Response>;

const handlers: Record<string, Handler> = {
  send: sendEmailPost,
  "send-sms": sendSmsPost,
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
