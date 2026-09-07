import { z } from "zod";
import { runArchiveAiDraft } from "@/lib/archive/archive-service";
import { dashboardUser, jsonNoStore, readJson, requireArchiveApiAccess } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ prompt: z.string().trim().max(2000).default("Summarize archive readiness") });

export async function POST(request: Request) {
  const { session, denied } = await requireArchiveApiAccess();
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return jsonNoStore({ ok: false, error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  return jsonNoStore(runArchiveAiDraft(parsed.data.prompt, dashboardUser(session)));
}
