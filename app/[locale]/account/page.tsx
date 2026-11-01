import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { profileHref } from "@/lib/minbar/profile-navigation";
export const metadata: Metadata = { robots: { index: false, follow: false } };
/** The former account summary remains available inside the donor profile. */
export default async function Account({ params }: { params: Promise<{ locale: string }> }) {
  redirect(profileHref((await params).locale, "overview"));
}
