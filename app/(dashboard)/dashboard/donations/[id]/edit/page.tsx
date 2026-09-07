import { redirect } from "next/navigation";

/**
 * This page was never implemented. It was a copy-paste of the campaign editor that still
 * contained the literal placeholder `// ... rest of your component code ...`, referenced
 * undeclared `form` / `onSubmit` / `Category`, and rendered the heading "تعديل المشروع"
 * (edit *project*). Opening it threw `ReferenceError: form is not defined`.
 *
 * Editing a donation is done through `EditDonationDialog`
 * (components/dashboard/donations/EditDonationDialog.tsx), opened from the donations table
 * via `useDonationActions` — that path works and is the one the UI actually uses. Nothing in
 * the app ever linked here.
 *
 * Kept as a redirect rather than deleted so any bookmarked URL lands somewhere useful
 * instead of on a crash. Safe to remove entirely once that's confirmed unnecessary.
 */
export default async function EditDonationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect("/dashboard");
}
