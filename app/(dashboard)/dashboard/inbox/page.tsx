"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InboundMessagesView } from "./_components/InboundMessagesView";
import { dashDir, dt } from "@/lib/dashboard/i18n";

/**
 * الرسائل الواردة  visitor messages from the site's contact form.
 *
 * Split out of `/dashboard/messages`, where it was the second tab behind the outbound template
 * log. The two shared nothing but the word "رسائل": this is human correspondence someone has to
 * read and answer, that one is delivery telemetry for automated sends. Tabbed together, the
 * inbound side was reachable only after landing on a page that defaults to the other tab, so
 * nothing here surfaced in the sidebar or the command palette.
 */
export default function InboxPage() {
  return (
    <div className="min-h-0" dir={dashDir()}>
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          eyebrow={dt("التواصل")}
          title={dt("الرسائل الواردة")}
          description={dt("رسائل التواصل والدعم والشراكات والتطوع. الإرسال متاح للمستخدمين بعد تسجيل الدخول.")}
          icon={Inbox}
        />
        <aside className="mb-5 space-y-2 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm leading-7">
          <p>{dt("تُحفظ الرسائل هنا داخل لوحة التحكم ولا تُرسل تلقائيًا إلى بريد المؤسسة. زر الرد بالبريد يفتح برنامج البريد، وزر واتساب يفتح المحادثة؛ فتحهما لا يؤكد إرسال الرد.")}</p>
          <Link href="/ar/contact-us" target="_blank" className="font-semibold text-brand underline">{dt("فتح نموذج التواصل على الموقع")}</Link>
        </aside>
        <InboundMessagesView />
      </div>
    </div>
  );
}
