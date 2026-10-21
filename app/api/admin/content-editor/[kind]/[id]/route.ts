import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import {
  ContentError,
  changeCategorySlug,
  documentFor,
  readContent,
  saveWorkspace,
} from "@/lib/content-editor/service";
import { contentStore } from "@/lib/content-editor/store";
import { isValidLocale } from "@/lib/locales";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ kind: string; id: string }> };
async function access(ctx: Context) {
  const params = await ctx.params,
    kind = parseKind(params.kind);
  if (!kind || !/^[a-f0-9]{24}$/i.test(params.id))
    throw new ContentError("المحتوى غير موجود", 404);
  const session = await getServerSession(authOptions);
  return {
    kind,
    id: params.id,
    session,
    denied: requireAdminOrDashboardPermission(session, CONFIG[kind].permission),
  };
}
function failure(error: unknown) {
  if (error instanceof ContentError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "P2034" || error.code === "P2002")
  )
    return NextResponse.json(
      { error: "تعارض حفظ. احتفظ بتعديلاتك وأعد تحميل المحتوى." },
      { status: 409 },
    );
  console.error("content-editor", error);
  return NextResponse.json(
    { error: "تعذر تنفيذ العملية. تعديلاتك ما زالت في المحرر." },
    { status: 500 },
  );
}
export async function GET(_request: NextRequest, ctx: Context) {
  try {
    const { kind, id, denied } = await access(ctx);
    if (denied) return denied;
    return NextResponse.json(
      documentFor(kind, await readContent(contentStore, kind, id)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const { kind, id, denied, session } = await access(ctx);
    if (denied) return denied;
    const body = await request.json();
    if (typeof body.revision !== "string")
      throw new ContentError("أعد تحميل المحتوى قبل الحفظ");
    let result;
    if (body.action === "slug" && kind === "categories")
      result = await changeCategorySlug(contentStore, {
        id,
        revision: body.revision,
        slug: String(body.slug || ""),
        confirmation: String(body.confirmation || ""),
        actor: String(session?.user?.id || ""),
        locale: isValidLocale(body.locale) ? body.locale : "ar",
      });
    else {
      if (!isValidLocale(body.locale)) throw new ContentError("لغة غير صالحة");
      if (
        body.localeChanges &&
        (typeof body.localeChanges !== "object" ||
          Array.isArray(body.localeChanges) ||
          Object.keys(body.localeChanges).some((l) => !isValidLocale(l)))
      )
        throw new ContentError("لغات غير صالحة");
      result = await saveWorkspace(contentStore, {
        kind,
        id,
        locale: body.locale,
        revision: body.revision,
        changes: body.changes,
        reviewed: body.reviewed === true,
        settings: body.settings,
        localeChanges: body.localeChanges,
      });
    }
    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action:
        body.action === "slug" ? "CONTENT_SLUG_CHANGE" : "CONTENT_EDITOR_SAVE",
      entityType: CONFIG[kind].model,
      entityId: id,
      messageAr: `حفظ محتوى ${CONFIG[kind].label}`,
      metadata: {
        locale: body.locale || "ar",
        fields: Object.keys(body.changes || {}),
      },
    });
    revalidatePath("/", "layout");
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
