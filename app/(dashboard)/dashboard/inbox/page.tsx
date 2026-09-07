"use client";

import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InboundMessagesView } from "./_components/InboundMessagesView";

/**
 * الرسائل الواردة — visitor messages from the site's contact form.
 *
 * Split out of `/dashboard/messages`, where it was the second tab behind the outbound template
 * log. The two shared nothing but the word "رسائل": this is human correspondence someone has to
 * read and answer, that one is delivery telemetry for automated sends. Tabbed together, the
 * inbound side was reachable only after landing on a page that defaults to the other tab, so
 * nothing here surfaced in the sidebar or the command palette.
 */
export default function InboxPage() {
  return (
    <div className="min-h-0" dir="rtl">
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          eyebrow="التواصل"
          title="الرسائل الواردة"
          description="رسائل الزوار والمستخدمين المُرسلة من نموذج «أرسل لنا رسالة» في تذييل الموقع."
          icon={Inbox}
        />
        <InboundMessagesView />
      </div>
    </div>
  );
}
