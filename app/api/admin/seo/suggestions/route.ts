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
    const source = body.sourceDraft ?? ((!body.locale || body.locale === "ar") ? body : null);
    if (!source || typeof source.title !== "string" || typeof source.description !== "string" || !(source.title.trim() || source.description.trim()))
      return NextResponse.json({ error: "اكتب المحتوى بالعربية أولًا واستخدمه مرجعًا لاقتراحات SEO." }, { status: 400 });
    const result = await generateResearchedSeo({
      type: body.type,
      locale: typeof body.locale === "string" ? body.locale : "ar",
      title: source.title,
      description: source.description,
      keywords: Array.isArray(source.keywords) ? source.keywords : [],
      market: typeof body.market === "string" ? body.market : undefined,
    }, request.signal);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("SEO suggestions failed", error);
    return NextResponse.json({ error: error instanceof SeoResearchError ? error.message : "تعذّر إعداد اقتراحات SEO" }, { status: error instanceof SeoResearchError ? error.status : 500 });
  }
}
