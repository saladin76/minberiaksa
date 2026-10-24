import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { generateResearchedSeo, SeoResearchError } from "@/lib/content-editor/seo-research";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!["campaign", "category", "blog"].includes(body?.type))
      return NextResponse.json({ error: "Invalid SEO content type" }, { status: 400 });
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, body.type === "campaign" ? "campaigns" : body.type === "category" ? "categories" : "blog");
    if (denied) return denied;
    const result = await generateResearchedSeo({
      type: body.type,
      locale: typeof body.locale === "string" ? body.locale : "ar",
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : "",
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      market: typeof body.market === "string" ? body.market : undefined,
    }, request.signal);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("SEO suggestions failed", error);
    return NextResponse.json({ error: error instanceof SeoResearchError ? error.message : "تعذّر إعداد اقتراحات SEO" }, { status: error instanceof SeoResearchError ? error.status : 500 });
  }
}
