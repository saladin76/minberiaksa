import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy shim. It redirected into /dashboard/operations/communication/templates, which went with
 * التشغيل — and since لوحة العلامة links here as «قوالب الرسائل», that made a live nav entry throw
 * rather than merely 404. Repointed at the surviving template editor.
 */
export default function BrandFrameworksPage() {
  redirect("/dashboard/templates");
}
