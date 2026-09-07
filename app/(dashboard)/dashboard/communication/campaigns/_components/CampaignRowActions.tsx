"use client";

import * as React from "react";
import { toast } from "react-hot-toast";
import { Ban, Loader2, MoreHorizontal, Send, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { channelMeta, isPreSend, type CampaignRow } from "./campaign-ui";

/**
 * Campaign lifecycle actions, in the list row.
 *
 * These used to live on `/dashboard/communication/campaigns/[id]`, which was the
 * only place a campaign could be confirmed, sent or cancelled. That page is gone
 * — clicking a campaign now opens its channel report — so the actions moved here
 * rather than disappearing with it.
 *
 * The send confirmation keeps naming the real recipient count and the channel:
 * it is the one irreversible action in the section, and «هل أنت متأكد؟» on its
 * own tells nobody what they are about to do. The count comes from the same
 * `GET …/send` plan the old page used, fetched when the menu item is clicked
 * rather than for every visible row.
 */

const BLOCKED_LABELS: Record<string, string> = {
  NOT_APPROVED: "الحملة غير معتمدة — اعتمدها أولًا.",
  NO_TEMPLATE: "لم يُختَر قالب لهذه الحملة.",
  NO_AUDIENCE: "لم يُحدَّد جمهور لهذه الحملة.",
  NO_RECIPIENTS: "لا يوجد مستلم مؤهَّل في هذا الجمهور.",
  NOT_CONFIGURED: "لا يوجد مزوّد مُعدّ لهذه القناة.",
};

type SendPlan = { total: number; blocked?: string | null };

export function CampaignRowActions({
  campaign,
  onChanged,
}: {
  campaign: CampaignRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [plan, setPlan] = React.useState<SendPlan | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const canConfirm = campaign.status === "DRAFT" || campaign.status === "REVIEW";
  const canSend = campaign.status === "APPROVED";
  const canCancel = isPreSend(campaign.status);
  if (!canConfirm && !canSend && !canCancel) return null;

  const transition = async (action: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communication/campaigns/${campaign.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر تحديث الحالة");
      toast.success(action === "CONFIRM" ? "تم تأكيد الحملة — يمكنك إرسالها الآن" : "تم تحديث الحالة");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Resolve the recipient count first — the dialog is worthless without it. */
  const openSend = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communication/campaigns/${campaign.id}/send`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const resolved: SendPlan = json?.ok ? json.plan : { total: 0 };
      if (resolved.blocked) {
        toast.error(BLOCKED_LABELS[resolved.blocked] ?? `تعذّر الإرسال: ${resolved.blocked}`);
        return;
      }
      setPlan(resolved);
      setConfirmOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/communication/campaigns/${campaign.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json();
      if (json?.summary?.blocked) {
        toast.error(BLOCKED_LABELS[json.summary.blocked] ?? `تعذّر الإرسال: ${json.summary.blocked}`);
      } else if (!res.ok || !json.ok) {
        toast.error(json?.error || "تعذّر الإرسال");
      } else {
        const s = json.summary;
        toast.success(`أُرسلت ${s.sent} · تُخطّيت ${s.skipped} · فشلت ${s.failed}`);
      }
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // The row itself navigates to the channel report; the menu must not.
            onClick={(e) => e.stopPropagation()}
            disabled={busy}
            aria-label={`إجراءات حملة ${campaign.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-brand/40 hover:bg-brand-50 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[170px]" onClick={(e) => e.stopPropagation()}>
          {canConfirm && (
            <DropdownMenuItem onClick={() => transition("CONFIRM")}>
              <ShieldCheck className="me-2 h-3.5 w-3.5" />
              تأكيد الحملة
            </DropdownMenuItem>
          )}
          {canSend && (
            <DropdownMenuItem onClick={openSend}>
              <Send className="me-2 h-3.5 w-3.5" />
              إرسال الآن
            </DropdownMenuItem>
          )}
          {canCancel && (
            <DropdownMenuItem onClick={() => transition("CANCEL")} className="text-rose-600 focus:text-rose-700">
              <Ban className="me-2 h-3.5 w-3.5" />
              إلغاء الحملة
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إرسال «{campaign.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم الإرسال عبر {channelMeta(campaign.channel).label} إلى{" "}
              <b className="font-semibold text-slate-900">{(plan?.total ?? 0).toLocaleString("en-US")}</b> مستلمًا.
              لا يمكن التراجع بعد الإرسال.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={send} className="bg-emerald-600 hover:bg-emerald-700">
              إرسال الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
