import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import DashboardLayoutClient from "./DashboardLayoutClient";
import ar from "../../../i18n/messages/ar.json";

export const metadata: Metadata = {
  title: "لوحة التحكم | قرة العيون",
  description: "إدارة المشاريع والتبرعات والمستخدمين",
  icons: { icon: "/logometayedi.avif" },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Root gate for the whole dashboard tree. `middleware.ts` deliberately excludes /dashboard
  // from its matcher, and only 2 of ~30 sections (archive, operations) had their own layout
  // guard — so the other 28 rendered server-side for an unauthenticated visitor. The API
  // routes are guarded, so this was defence-in-depth rather than a data leak, but an
  // anonymous visitor could still render the dashboard shell.
  //
  // Authentication only: per-section PERMISSION checks stay in each section's own layout,
  // because this layout cannot know which section is being rendered.
  if (!session?.user) {
    redirect("/ar/auth/signin");
  }

  const locale = "ar";
  const messages = (ar ?? {}) as unknown as Record<string, string | Record<string, string>>;

  return (
    <DashboardLayoutClient
      session={session}
      messages={messages}
      locale={locale}
    >
      {children}
    </DashboardLayoutClient>
  );
}
