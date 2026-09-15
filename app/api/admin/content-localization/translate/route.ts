import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { sessionHasDashboardPermission, type DashboardPermissionKey } from "@/lib/dashboard/permissions";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { TRANSLATION_TARGET_LOCALES, translateToLocales } from "@/lib/content-localization/translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/content-localization/translate — machine-translate one
 * item's Arabic fields into the requested locales (all eighteen by default).
 *
 * Nothing is saved. The forms call this, put the result into their own
 * translation fields, and the editor reviews and saves as usual — so the
 * write goes through each section's own validated endpoint and its audit
 * log, and a translation the editor did not look at never reaches the site
 * on its own.
 *
 * Any staffer who can edit content in some section may translate: the
 * endpoint only produces text for a form they already have open.
 */
const CONTENT_PERMISSIONS: DashboardPermissionKey[] = [
  "campaigns",
  "categories",
  "blog",
  "slides",
  "siteContent",
  "badges",
  "templates",
  "bankAccounts",
];

const bodySchema = z.object({
  fields: z.record(z.string(), z.string().max(20000)).default({}),
  richFields: z.record(z.string(), z.string().max(200000)).default({}),
  locales: z.array(z.string()).max(SUPPORTED_LOCALES.length).optional(),
  itemLabel: z.string().max(80).optional(),
  sourceLocale: z.string().max(5).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!CONTENT_PERMISSIONS.some((key) => sessionHasDashboardPermission(session, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { fields, richFields, locales, itemLabel, sourceLocale } = parsed.data;

  const hasContent =
    Object.values(fields).some((v) => v.trim()) || Object.values(richFields).some((v) => v.trim());
  if (!hasContent) {
    return NextResponse.json({ error: "اكتب المحتوى بالعربية أولًا ثم اطلب الترجمة" }, { status: 400 });
  }

  try {
    const result = await translateToLocales(
      { fields, richFields, itemLabel, sourceLocale },
      locales?.length ? locales : TRANSLATION_TARGET_LOCALES
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("content-localization/translate failed:", error);
    const message = error instanceof Error ? error.message : "Translation failed";
    const status = /OPENAI_API_KEY/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
