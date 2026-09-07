import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { loadContext, mergeText, VARIABLE_CATALOG, type TemplateContext } from "@/lib/templates/variables";
import { pickLocale, resolveWhatsappBody } from "@/lib/templates/locale-resolver";

const previewSchema = z.object({
  templateId: z.string().min(1),
  userId: z.string().optional(),
  locale: z.string().optional(),
});

function buildSampleContext(): TemplateContext {
  const flat: Record<string, string> = {};
  for (const g of VARIABLE_CATALOG) {
    for (const e of g.entries) {
      flat[e.token.replace(/[{}]/g, "").trim()] = e.exampleValue;
    }
  }
  const get = (k: string) => flat[k] ?? "";
  return {
    user: {
      id: "sample",
      name: get("user.name"),
      email: get("user.email"),
      phone: get("user.phone"),
      countryName: get("user.countryName"),
      countryCode: get("user.countryCode"),
      city: get("user.city"),
      region: "",
      preferredLang: get("user.preferredLang"),
    },
    donations: [
      {
        id: "sample-1",
        amount: get("amount"),
        amountUSD: get("amountUSD"),
        currency: get("currency"),
        totalAmount: get("amount"),
        status: "PAID",
        createdAt: get("createdAt"),
        campaignTitle: get("campaignTitle"),
        itemCount: "1",
        items: [
          {
            campaignTitle: get("campaignTitle"),
            amount: get("amount"),
            amountUSD: get("amountUSD"),
            currency: get("currency"),
            shareCount: "",
          },
        ],
      },
    ],
    totals: {
      count: get("totals.count"),
      amountUSD: get("totals.amountUSD"),
      lastAt: get("totals.lastAt"),
    },
    donation: {
      id: "sample-1",
      amount: get("amount"),
      amountUSD: get("amountUSD"),
      currency: get("currency"),
      totalAmount: get("amount"),
      status: "PAID",
      createdAt: get("createdAt"),
      campaignTitle: get("campaignTitle"),
      itemCount: "2",
      items: [
        {
          campaignTitle: get("campaignTitle"),
          amount: "25",
          amountUSD: "25",
          currency: get("currency"),
          shareCount: "",
        },
        {
          campaignTitle: "حملة الشتاء",
          amount: "25",
          amountUSD: "25",
          currency: get("currency"),
          shareCount: "",
        },
      ],
    },
  };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "templates");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ctx =
    (parsed.data.userId ? await loadContext(parsed.data.userId) : null) ??
    buildSampleContext();

  const locale = pickLocale({
    override: parsed.data.locale,
    recipientLang: ctx.user.preferredLang,
  });
  const variant = resolveWhatsappBody(template, locale);

  return NextResponse.json({
    body: mergeText(variant.body, ctx),
    resolvedLocale: variant.resolvedLocale,
  });
}
