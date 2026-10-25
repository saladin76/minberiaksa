import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { ContentError } from "@/lib/content-editor/service";
import { applyEditorialJob, changeEditorialJob } from "@/lib/content-editor/editorial-jobs";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function access(ctx: Context) {
  const { id } = await ctx.params, session = await getServerSession(authOptions);
  return { id, session, denied: requireAdminOrDashboardPermission(session, "blog") };
}
function failure(error: unknown) {
  if (error instanceof ContentError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "code" in error && ["P2025", "P2034"].includes(String(error.code))) return NextResponse.json({ error: "تغيرت المهمة أو المحتوى. احتفظ بالمراجعة وأعد تحميل النسخة الحالية." }, { status: 409 });
  console.error("editorial-job operation failed");
  return NextResponse.json({ error: "تعذر تأكيد العملية. احتفظ بالمراجعة وأعد المحاولة." }, { status: 500 });
}
export async function GET(_request: NextRequest, ctx: Context) {
  const { id, denied } = await access(ctx); if (denied) return denied;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "مهمة غير صالحة" }, { status: 400 });
  const job = await prisma.editorialJob.findUnique({ where: { id } });
  return job ? NextResponse.json(job, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
}
export async function POST(request: NextRequest, ctx: Context) {
  const { id, session, denied } = await access(ctx); if (denied) return denied;
  try {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new ContentError("مهمة غير صالحة");
    const body = await request.json();
    if (typeof body.version !== "string") throw new ContentError("أعد تحميل المهمة أولًا");
    if (body.action === "apply") {
      const result = await applyEditorialJob(id, body.version, body.values);
      queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "EDITORIAL_PROPOSAL_APPLY", entityType: "Post", entityId: result.contentId, messageAr: "اعتماد مراجعة محتوى تحريري", metadata: { jobId: id } });
      revalidatePath("/", "layout");
      return NextResponse.json(result);
    }
    if (!["retry", "cancel"].includes(body.action)) throw new ContentError("عملية غير صالحة");
    await changeEditorialJob(id, body.version, body.action);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
