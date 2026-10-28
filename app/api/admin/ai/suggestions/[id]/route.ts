import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { isDashboardPermissionKey } from "@/lib/dashboard/permissions";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { readSuggestionTask, suggestionTaskResponse, cancelSuggestionTask, taskJson } from "@/lib/content-editor/suggestion-tasks";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function access(ctx: Context) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { denied: taskJson({ error: "UNAUTHENTICATED" }, 401) };
  // Authenticate before reading any task, including for dashboard users with revoked permissions.
  if (!["ADMIN", "STAFF"].includes(session.user.role || "")) return { denied: taskJson({ error: "FORBIDDEN" }, 403) };
  const task = await readSuggestionTask((await ctx.params).id, session.user.id);
  if (!task || !isDashboardPermissionKey(task.permission)) return { denied: taskJson({ error: "NOT_FOUND" }, 404) };
  const permissionDenied = requireAdminOrDashboardPermission(session, task.permission);
  if (permissionDenied) return { denied: permissionDenied };
  // A retained result can include restricted GA4 evidence. Recheck that source permission too.
  // Legacy tasks have no explicit flag and must fail closed for operators without analytics access.
  if (task.requiresAnalytics !== false) {
    const analyticsDenied = requireAdminOrDashboardPermission(session, "platformConnections");
    if (analyticsDenied) return { denied: analyticsDenied };
  }
  return { task };
}
export async function GET(_request: NextRequest, ctx: Context) {
  try { const result = await access(ctx); return result.denied || await suggestionTaskResponse(result.task!); }
  catch { return taskJson({ error: "تعذر تحميل حالة الاقتراح. احتفظ بالمسودة وأعد المحاولة." }, 503); }
}
export async function DELETE(_request: NextRequest, ctx: Context) {
  try { const result = await access(ctx); if (result.denied) return result.denied;
    await cancelSuggestionTask(result.task!.id, result.task!.ownerId); return taskJson({ ok: true });
  } catch { return taskJson({ error: "تعذر تأكيد إيقاف الطلب." }, 503); }
}
