import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getAccountSummary } from "@/lib/minbar/account";
import { isValidLocale } from "@/lib/locales";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const requested = request.nextUrl.searchParams.get("locale");
  const locale = requested && isValidLocale(requested) ? requested : "ar";
  const summary = await getAccountSummary(session.user.id, locale);
  return NextResponse.json(summary ? { summary } : { error: "NOT_FOUND" }, {
    status: summary ? 200 : 404, headers: { "Cache-Control": "private, no-store" },
  });
}
