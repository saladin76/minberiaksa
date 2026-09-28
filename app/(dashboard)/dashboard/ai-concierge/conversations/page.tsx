"use client";

import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { ConciergeShell } from "../_components/ConciergeShell";
import { ConversationsView } from "../_components/ConversationsView";

/** مساعد العطاء — every conversation visitors had with the concierge. */
export default function AiConciergeConversationsPage() {
  return (
    <ConciergeShell
      title="محادثات مساعد العطاء"
      icon={MessagesSquare}
      description="كل ما كتبه الزوار للمساعد وما أجاب به، مع التبرع الذي نتج عن المحادثة إن وُجد."
    >
      <Suspense fallback={null}>
        <ConversationsView />
      </Suspense>
    </ConciergeShell>
  );
}
