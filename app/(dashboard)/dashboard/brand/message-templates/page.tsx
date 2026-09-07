import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy shim, same story as ../frameworks: it pointed into the removed التشغيل tree. Repointed
 * at the surviving template editor so old bookmarks land somewhere real.
 */
export default function BrandMessageTemplatesPage() {
  redirect("/dashboard/templates");
}
