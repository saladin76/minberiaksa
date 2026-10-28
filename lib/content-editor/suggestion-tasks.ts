import "server-only";
import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { providerErrorMessage } from "@/lib/ai/core/provider-error-message";

const DEADLINE_MS = 270_000;
const controllers = new Map<string, AbortController>();
const headers = { "Cache-Control": "private, no-store" };
export const taskJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const timeout = () => taskJson({ error: providerErrorMessage("AI_TIMEOUT"), reason: "AI_TIMEOUT", stopBatch: true }, 502);

/** Only the initiating operator can read or cancel a suggestion, with permission checked on every poll. */
export async function readSuggestionTask(id: string, ownerId: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const task = await prisma.aiSuggestionTask.findUnique({ where: { id } });
  return task?.ownerId === ownerId && task.expiresAt > new Date() ? task : null;
}
export async function suggestionTaskResponse(task: NonNullable<Awaited<ReturnType<typeof readSuggestionTask>>>) {
  if (task.status === "DONE") return taskJson(task.result, task.httpStatus || 500);
  if (task.status === "CANCELLED") return taskJson({ error: "أُوقف الطلب؛ المحتوى لم يتغير." }, 410);
  if (task.deadlineAt <= new Date()) return timeout();
  return taskJson({ taskId: task.id, status: task.status }, 202);
}
export async function cancelSuggestionTask(id: string, ownerId: string) {
  await prisma.aiSuggestionTask.updateMany({ where: { id, ownerId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED" } });
  controllers.get(id)?.abort();
}

/** Return promptly, then retain a bounded result independently of proxy/client request deadlines.
 * No request snapshot, cookie or key is stored; only the generated review result is retained for 24 hours. A killed worker is never retried implicitly.
 */
export async function queueSuggestion(request: NextRequest, ownerId: string, permission: string,
  execute: (request: NextRequest) => Promise<Response>, analyticsAccess?: { denied: Response | null }) {
  const requestId = request.headers.get("X-Suggestion-Request");
  if (!/^[a-f0-9-]{36}$/i.test(requestId || "")) return taskJson({ error: "معرّف طلب غير صالح" }, 400);
  const text = await request.text();
  if (Buffer.byteLength(text) > 1_000_000) return taskJson({ error: "المسودة كبيرة جدًا؛ حدد حقولًا أقل في الطلب." }, 413);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return taskJson({ error: "طلب غير صالح" }, 400); }
  const requiresAnalytics = Boolean(payload && typeof payload === "object" && "analyticsPeriod" in payload && payload.analyticsPeriod);
  if (requiresAnalytics && (!analyticsAccess || analyticsAccess.denied)) return analyticsAccess?.denied || taskJson({ error: "FORBIDDEN" }, 403);
  const id = createHash("sha256").update(ownerId + ":" + requestId).digest("hex");
  const requestHash = createHash("sha256").update(request.url + "\n" + text).digest("hex");
  const existing = await prisma.aiSuggestionTask.findUnique({ where: { id } });
  if (existing) return existing.requestHash === requestHash && existing.permission === permission
    ? suggestionTaskResponse(existing) : taskJson({ error: "تغير طلب الاقتراح. ابدأ طلبًا جديدًا." }, 409);
  const now = new Date();
  const active = await prisma.aiSuggestionTask.count({ where: { ownerId, status: { in: ["QUEUED", "RUNNING"] }, deadlineAt: { gt: now } } });
  if (active >= 2) return taskJson({ error: "انتظر اكتمال طلباتك الحالية قبل بدء اقتراح آخر.", reason: "AI_RATE_LIMITED", stopBatch: true }, 429);
  const deadlineAt = new Date(now.getTime() + DEADLINE_MS);
  try {
    await prisma.aiSuggestionTask.create({ data: { id, ownerId, permission, requestHash, requiresAnalytics, deadlineAt, expiresAt: new Date(now.getTime() + 86_400_000) } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const concurrent = await prisma.aiSuggestionTask.findUnique({ where: { id } });
      if (concurrent?.requestHash === requestHash && concurrent.permission === permission) return suggestionTaskResponse(concurrent);
      return taskJson({ error: "تغير طلب الاقتراح. ابدأ طلبًا جديدًا." }, 409);
    }
    throw error;
  }
  after(async () => {
    const claim = await prisma.aiSuggestionTask.updateMany({ where: { id, status: "QUEUED", deadlineAt: { gt: new Date() } }, data: { status: "RUNNING" } });
    if (!claim.count) return;
    const controller = new AbortController(); controllers.set(id, controller);
    let checking = false;
    // Cancellation can reach another worker/process; observe the durable state without overlapping reads.
    const cancellation = setInterval(() => {
      if (checking) return;
      checking = true;
      void prisma.aiSuggestionTask.findUnique({ where: { id }, select: { status: true } })
        .then(task => { if (task?.status !== "RUNNING") controller.abort(); })
        .catch(() => controller.abort()).finally(() => { checking = false; });
    }, 5000);
    try {
      // Do not inherit the completed HTTP request's abort signal or asynchronous preference header.
      const detached = new NextRequest(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: text,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, deadlineAt.getTime() - Date.now()))]) });
      const response = await execute(detached);
      const result = await response.json();
      await prisma.aiSuggestionTask.updateMany({ where: { id, status: "RUNNING" }, data: { status: "DONE", httpStatus: response.status, result } });
    } catch {
      await prisma.aiSuggestionTask.updateMany({ where: { id, status: "RUNNING" }, data: { status: "DONE", httpStatus: 502,
        result: { error: providerErrorMessage("AI_PROVIDER_UNAVAILABLE"), reason: "AI_PROVIDER_UNAVAILABLE", stopBatch: true } } });
    } finally { clearInterval(cancellation); controllers.delete(id); }
  });
  return taskJson({ taskId: id, status: "QUEUED" }, 202);
}
