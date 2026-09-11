import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/site-settings — every setting, public.
 *
 * Public because the settings exist to be rendered on the site: contact
 * details, social links, the WhatsApp number. `?group=` narrows to one section
 * and `?keys=a,b,c` to a named set, so a footer can ask for exactly what it
 * shows. Writes go through /api/site-settings/[key] and are gated there.
 */
export async function GET(request: NextRequest) {
  try {
    const group = request.nextUrl.searchParams.get("group");
    const keysParam = request.nextUrl.searchParams.get("keys");
    const keys = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : null;

    const rows = await prisma.siteSetting.findMany({
      where: {
        ...(group ? { group } : {}),
        ...(keys && keys.length ? { key: { in: keys } } : {}),
      },
      orderBy: [{ group: "asc" }, { key: "asc" }],
      select: { key: true, value: true, group: true, updatedAt: true },
    });

    /* Both shapes: the list for the dashboard, the map for site code that just
       wants `settings["contact.phone"]`. */
    const items = rows.map((r) => ({
      key: r.key,
      value: r.value,
      group: r.group ?? "",
      updatedAt: r.updatedAt.toISOString(),
    }));
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    return NextResponse.json({ items, map });
  } catch (error) {
    console.error("Error fetching site settings:", error);
    return NextResponse.json({ error: "Failed to fetch site settings" }, { status: 500 });
  }
}
