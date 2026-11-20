import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The WhatsApp inbox moved to the conversations page (2026-11-19); old links and bookmarks land there. */
export default function WhatsappInboxPage() {
  redirect("/dashboard/communication/conversations");
}
