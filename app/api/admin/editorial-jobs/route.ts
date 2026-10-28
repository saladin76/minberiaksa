import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { ContentError } from "@/lib/content-editor/service";
import { editorialSettings, saveEditorialSettings, enqueueWeeklyArticle, enqueueMissingArticleTranslations, enqueueArticleImprovement, runEditorialJobs, retryTransientEditorialJobs } from "@/lib/content-editor/editorial-jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function authorize() { return requireAdminOrDashboardPermission(await getServerSession(authOptions), "blog"); }
function failure(error: unknown) {
  if (error instanceof ContentError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("editorial-jobs operation failed");
  return NextResponse.json({ error: "تعذر تنفيذ العملية. احتفظ بالمراجعة وأعد المحاولة." }, { status: 500 });
}
export async function GET(request: NextRequest) {
  const denied = await authorize(); if (denied) return denied;
  try {
    const cursor = request.nextUrl.searchParams.get("cursor"), status = request.nextUrl.searchParams.get("status");
    if (cursor && !/^[a-f0-9]{24}$/i.test(cursor)) throw new ContentError("مؤشر غير صالح");
    if (status && !["QUEUED", "RUNNING", "REVIEW", "APPLIED", "FAILED", "STALE", "CANCELLED"].includes(status)) throw new ContentError("حالة غير صالحة");
    const [jobs, counts, settings, lastCompleted] = await Promise.all([
      prisma.editorialJob.findMany({ where: status ? { status } : {}, orderBy: { id: "desc" }, take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, kind: true, status: true, locale: true, sourceId: true, resultContentId: true, error: true, version: true, createdAt: true, updatedAt: true, attempts: true } }),
      prisma.editorialJob.groupBy({ by: ["status"], _count: true }),
      editorialSettings(),
      prisma.editorialJob.findFirst({ where: { status: { in: ["REVIEW", "APPLIED"] } }, orderBy: { updatedAt: "desc" }, select: { kind: true, locale: true, updatedAt: true } }),
    ]);
    const sourceIds = [...new Set(jobs.map((job) => job.sourceId).filter((id): id is string => Boolean(id)))];
    const posts = sourceIds.length ? await prisma.post.findMany({ where: { id: { in: sourceIds } }, select: { id: true, title: true } }) : [];
    return NextResponse.json({ jobs: jobs.slice(0, 50).map((job) => ({ ...job, title: posts.find((post) => post.id === job.sourceId)?.title || "" })), nextCursor: jobs.length > 50 ? jobs[49].id : null, counts, settings, lastCompleted }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const denied = await authorize(); if (denied) return denied;
  try {
    const body = await request.json();
    if (body.action === "weekly") return NextResponse.json({ created: await enqueueWeeklyArticle() });
    if (body.action === "translations") return NextResponse.json(await enqueueMissingArticleTranslations(typeof body.cursor === "string" ? body.cursor : undefined));
    if (body.action === "improve") {
      if (typeof body.id !== "string" || !/^[a-f0-9]{24}$/i.test(body.id)) throw new ContentError("معرّف مقال غير صالح");
      return NextResponse.json({ created: await enqueueArticleImprovement(body.id) });
    }
    if (body.action === "retry-failed") {
      return NextResponse.json(await retryTransientEditorialJobs());
    }
    if (body.action === "run") return NextResponse.json({ jobs: await runEditorialJobs(request.signal, 2) });
    throw new ContentError("عملية غير صالحة");
  } catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  const denied = await authorize(); if (denied) return denied;
  try { return NextResponse.json(await saveEditorialSettings(await request.json())); }
  catch (error) { return failure(error); }
}
