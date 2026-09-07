import { z } from "zod";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { jsonNoStore, readJson, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultOptions = {
  years: Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)),
  countries: ["فلسطين", "السودان", "سوريا", "تركيا", "اليمن", "لبنان", "عام"],
  cities: ["غزة", "القدس", "الخرطوم", "إدلب", "إسطنبول", "صنعاء", "عام"],
  themes: ["مياه", "طرود", "إفطار", "كفالات", "زكاة", "وقف", "تعليم", "صحة", "إيواء", "أضاحي"],
  projectTypes: ["إغاثة طارئة", "مشروع موسمي", "مشروع دائم", "توثيق ميداني", "حملة تسويقية", "ملف رسمي"],
};

const optionsSchema = z.object({
  years: z.array(z.string().trim().min(1).max(20)).default(defaultOptions.years),
  countries: z.array(z.string().trim().min(1).max(80)).default(defaultOptions.countries),
  cities: z.array(z.string().trim().min(1).max(80)).default(defaultOptions.cities),
  themes: z.array(z.string().trim().min(1).max(80)).default(defaultOptions.themes),
  projectTypes: z.array(z.string().trim().min(1).max(100)).default(defaultOptions.projectTypes),
});

type ArchiveProjectOptions = z.infer<typeof optionsSchema>;

export async function GET() {
  const { denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const options = await readLatestOptions();
  return jsonNoStore({ ok: true, options });
}

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;

  const parsed = optionsSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });

  const options = normalizeOptions(parsed.data);

  if (session?.user) {
    const actor = auditActorFromDashboardSession(session);
    await writeAuditLog({
      ...actor,
      action: "archive.projectOptions.update",
      messageAr: "تم تحديث خيارات مشاريع الأرشيف",
      messageEn: "Archive project options updated",
      entityType: "ArchiveProjectOptions",
      entityId: "archive-project-options",
      metadata: { options, source: "dashboard.archive.project-options" },
      stream: "TEAM",
    });
  }

  return jsonNoStore({ ok: true, options, message: "تم حفظ خيارات الأرشيف" });
}

async function readLatestOptions(): Promise<ArchiveProjectOptions> {
  try {
    const row = await prisma.auditLog.findFirst({
      where: { action: "archive.projectOptions.update", entityType: "ArchiveProjectOptions" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });

    const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
    const rawOptions = metadata.options && typeof metadata.options === "object" ? metadata.options : undefined;
    const parsed = optionsSchema.safeParse(rawOptions);
    return normalizeOptions(parsed.success ? parsed.data : defaultOptions);
  } catch (error) {
    console.error("Archive project options read failed", error);
    return normalizeOptions(defaultOptions);
  }
}

function normalizeOptions(options: ArchiveProjectOptions): ArchiveProjectOptions {
  return {
    years: sortYears(unique([...options.years, ...defaultOptions.years])),
    countries: unique([...options.countries, ...defaultOptions.countries]),
    cities: unique([...options.cities, ...defaultOptions.cities]),
    themes: unique([...options.themes, ...defaultOptions.themes]),
    projectTypes: unique([...options.projectTypes, ...defaultOptions.projectTypes]),
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sortYears(values: string[]) {
  return values.slice().sort((a, b) => Number(b) - Number(a));
}
