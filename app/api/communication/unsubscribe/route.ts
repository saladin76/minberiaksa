import { NextRequest, NextResponse } from "next/server";
import { verifyEmailUnsubscribeToken } from "@/lib/communication/email-unsubscribe";
import { suppressEmailRecipient } from "@/lib/communication/email-suppression";
import { emailUnsubscribeCopy } from "@/lib/communication/unsubscribe-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function params(req: NextRequest) {
  return {
    email: (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase(),
    token: req.nextUrl.searchParams.get("token"),
    locale: (req.nextUrl.searchParams.get("locale") ?? "ar").toLowerCase().split(/[-_]/)[0],
  };
}

export async function GET(req: NextRequest) {
  const { email, token, locale } = params(req);
  if (!email || !verifyEmailUnsubscribeToken(email, token)) return new NextResponse("Invalid unsubscribe link", { status: 400 });
  const copy = emailUnsubscribeCopy(locale);
  const title = esc(copy.label), text = esc(copy.question), button = esc(copy.button);
  const action = `${req.nextUrl.pathname}?${req.nextUrl.searchParams.toString()}`;
  return new NextResponse(`<!doctype html><html lang="${copy.locale}" dir="${copy.dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:40px"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><h1>${title}</h1><p>${text}</p><p style="color:#64748b;font-size:13px">${esc(email)}</p><form method="post" action="${esc(action)}"><button style="border:0;border-radius:9px;background:#1f3f4f;color:#fff;padding:12px 18px;font-weight:700;cursor:pointer" type="submit">${button}</button></form></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function POST(req: NextRequest) {
  const { email, token, locale } = params(req);
  if (!email || !verifyEmailUnsubscribeToken(email, token)) return NextResponse.json({ ok: false, error: "invalid unsubscribe token" }, { status: 400 });
  await suppressEmailRecipient(email, "unsubscribe");
  if (req.headers.get("accept")?.includes("text/html")) {
    const copy = emailUnsubscribeCopy(locale);
    return new NextResponse(`<!doctype html><html lang="${copy.locale}" dir="${copy.dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(copy.label)}</title><body style="font-family:Arial,sans-serif;padding:40px"><main><h1>${esc(copy.label)}</h1><p role="status">${esc(copy.done)}</p></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  return NextResponse.json({ ok: true, unsubscribed: true }, { status: 200 });
}
