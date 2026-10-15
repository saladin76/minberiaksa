"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dt, dtx } from "@/lib/dashboard/i18n";

type ActionKey = "marketing" | "documentation" | "reject";

type FeedbackState = {
  tone: "success" | "error";
  message: string;
} | null;

type Props = {
  assetId: string;
  fileName: string;
  humanReviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "DOCUMENTATION_ONLY";
  marketingApproved: boolean;
  documentationApproved: boolean;
  isSensitive: boolean;
  needsBlur: boolean;
};

type ReviewAction = {
  key: ActionKey;
  endpoint: string;
  successMessage: string;
  confirmMessage?: string;
};

export function ArchiveAssetReviewActions({
  assetId,
  fileName,
  humanReviewStatus,
  marketingApproved,
  documentationApproved,
  isSensitive,
  needsBlur,
}: Props) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const hasSafetyFlag = isSensitive || needsBlur;

  async function submitReview(action: ReviewAction) {
    if (pendingAction) return;
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) return;

    setPendingAction(action.key);
    setFeedback(null);

    const response = await fetch(`/api/admin/archive/assets/${encodeURIComponent(assetId)}/${action.endpoint}`, {
      method: "POST",
    });
    const result = await response.json().catch(() => null);
    setPendingAction(null);

    if (!response.ok || !result?.ok) {
      setFeedback({ tone: "error", message: result?.error || result?.message || dt("تعذر حفظ المراجعة") });
      return;
    }

    setFeedback({ tone: "success", message: result?.message || action.successMessage });
    router.refresh();
  }

  const marketingConfirm = hasSafetyFlag
    ? dt("هذه المادة تحتاج مراجعة دقيقة: {0}. هل تريد اعتمادها للتسويق؟", [fileName])
    : dt("اعتماد هذه المادة للتسويق: {0}؟", [fileName]);

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(pendingAction) || marketingApproved || humanReviewStatus === "REJECTED"}
          onClick={() => submitReview({ key: "marketing", endpoint: "approve-marketing", successMessage: dt("تم اعتماد المادة للتسويق"), confirmMessage: marketingConfirm })}
          className="gap-2 font-bold"
        >
          <CheckCircle2 className="h-4 w-4" /> {pendingAction === "marketing" ? dt("جاري الاعتماد") : dt("اعتماد للتسويق")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(pendingAction) || documentationApproved || humanReviewStatus === "REJECTED"}
          onClick={() => submitReview({ key: "documentation", endpoint: "approve-documentation", successMessage: dt("تم اعتماد المادة للتوثيق") })}
          className="gap-2 font-bold"
        >
          <ClipboardCheck className="h-4 w-4" /> {pendingAction === "documentation" ? dt("جاري الحفظ") : dt("اعتماد للتوثيق")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(pendingAction) || humanReviewStatus === "REJECTED"}
          onClick={() => submitReview({ key: "reject", endpoint: "reject", successMessage: dt("تم رفض المادة"), confirmMessage: dt("رفض هذه المادة: {0}؟", [fileName]) })}
          className="gap-2 border-rose-200 font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        >
          <XCircle className="h-4 w-4" /> {pendingAction === "reject" ? dt("جاري الرفض") : dt("رفض")}
        </Button>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-500">{dtx("الحالة الحالية: {0}", [statusLabel(humanReviewStatus, marketingApproved, documentationApproved)])}</p>
      {hasSafetyFlag ? <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{dt("هذه المادة تحتاج مراجعة بشرية دقيقة قبل استخدامها.")}</p> : null}
      {feedback ? (
        <p className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}

function statusLabel(status: Props["humanReviewStatus"], marketingApproved: boolean, documentationApproved: boolean) {
  if (status === "REJECTED") return dt("مرفوض");
  if (marketingApproved) return dt("معتمد للتسويق");
  if (documentationApproved || status === "DOCUMENTATION_ONLY") return dt("معتمد للتوثيق فقط");
  if (status === "APPROVED") return dt("تمت المراجعة");
  return dt("بانتظار المراجعة");
}
