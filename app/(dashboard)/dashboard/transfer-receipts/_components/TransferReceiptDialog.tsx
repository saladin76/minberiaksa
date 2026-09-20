"use client";

import * as React from "react";
import { toast } from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Check,
  Ban,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Phone,
  Globe,
  Landmark,
  CalendarDays,
  Hash,
  StickyNote,
  UserRound,
  ZoomIn,
  Save,
  Receipt,
  Link2,
  RotateCcw,
  ShieldCheck,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALE_LABELS } from "@/lib/locales";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import type { AdminClaimView, DonorReceiptFile } from "@/lib/donations/bank-transfer-serializers";
import {
  CLAIM_STATUS_DOT,
  CLAIM_STATUS_HINTS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_PILL,
  REJECTION_PRESETS,
  absoluteDate,
  dateOnly,
  formatBytes,
  money,
  relativeTime,
  usd,
} from "./status";

export type ReviewAction =
  | { action: "confirm"; adminNote?: string | null }
  | { action: "reject"; reason: string; adminNote?: string | null }
  | { action: "note"; adminNote: string | null };

/**
 * The review workspace.
 *
 * Two panes, because a reviewer does two things at once: reads the receipt
 * and checks it against what the order says. The receipt sits large on one
 * side — zoomable, switchable between submissions — and everything it has to
 * match sits on the other: the donor, the amount, the account, what the donor
 * typed. The decision is the footer, and it is one click plus a confirmation
 * (confirm) or one click plus a reason (reject), never more.
 */
export function TransferReceiptDialog({
  claim,
  onClose,
  onReview,
}: {
  claim: AdminClaimView | null;
  onClose: () => void;
  onReview: (id: string, input: ReviewAction) => Promise<void>;
}) {
  const { openUserProfile } = useViewUserProfile();
  const [busy, setBusy] = React.useState<"confirm" | "reject" | "note" | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState(claim?.adminNote ?? "");
  const [activeFile, setActiveFile] = React.useState<number>(Math.max(0, (claim?.receipts.length ?? 1) - 1));
  const [zoom, setZoom] = React.useState(false);

  /* A new claim in the same dialog: reset what belongs to the previous one. */
  React.useEffect(() => {
    setNote(claim?.adminNote ?? "");
    setActiveFile(Math.max(0, (claim?.receipts.length ?? 1) - 1));
    setReason("");
    setZoom(false);
    setRejectOpen(false);
    setConfirmOpen(false);
  }, [claim?.id, claim?.adminNote, claim?.receipts.length]);

  const copy = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }, []);

  const run = React.useCallback(
    async (input: ReviewAction) => {
      if (!claim) return;
      setBusy(input.action);
      try {
        await onReview(claim.id, input);
      } finally {
        setBusy(null);
      }
    },
    [claim, onReview],
  );

  if (!claim) return null;

  const file: DonorReceiptFile | null = claim.receipts[activeFile] ?? null;
  const initial = (claim.donor.name ?? claim.donor.email ?? "?").trim().charAt(0).toUpperCase();
  const decided = claim.status === "CONFIRMED";
  const noteDirty = (note.trim() || null) !== (claim.adminNote ?? null);
  const donorPage = typeof window !== "undefined" ? `${window.location.origin}${claim.donorPagePath}` : claim.donorPagePath;
  const remaining = claim.maxSubmissions - claim.submissionCount;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideCloseButton
        dir="rtl"
        className="flex max-h-[92vh] w-[calc(100%-2rem)] max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", claim.status === "CONFIRMED" ? "bg-emerald-50 text-emerald-600" : claim.status === "REJECTED" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")}>
            <Receipt className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-slate-900">
              إيصال تحويل بنكي
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold", CLAIM_STATUS_PILL[claim.status])}>
                <span className={cn("h-1.5 w-1.5 rounded-full", CLAIM_STATUS_DOT[claim.status])} />
                {CLAIM_STATUS_LABELS[claim.status]}
              </span>
              {claim.submissionCount > 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  <RotateCcw className="h-3 w-3" />
                  المحاولة {claim.submissionCount} من {claim.maxSubmissions}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[12px] leading-5 text-slate-500">{CLAIM_STATUS_HINTS[claim.status]}</DialogDescription>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-slate-500" onClick={onClose} aria-label="إغلاق">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* Evidence */}
          <section className="flex min-h-[320px] flex-col border-b border-slate-200 bg-slate-50 lg:min-h-0 lg:border-b-0 lg:border-s">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
              {file ? (
                file.isImage ? (
                  <button type="button" onClick={() => setZoom(true)} className="group relative max-h-full max-w-full focus:outline-none" title="تكبير">
                    <img src={file.url} alt={file.fileName} className="max-h-[52vh] w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain shadow-sm lg:max-h-[60vh]" />
                    <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-3 w-3" />
                      تكبير
                    </span>
                  </button>
                ) : (
                  <div className="flex h-full w-full flex-col">
                    <iframe src={`${file.url}#toolbar=0`} title={file.fileName} className="min-h-[300px] flex-1 rounded-lg border border-slate-200 bg-white lg:min-h-[52vh]" />
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center justify-center gap-1.5 self-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
                      <FileText className="h-3.5 w-3.5" />
                      فتح ملف PDF في تبويب جديد
                    </a>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <FileText className="h-10 w-10" />
                  <p className="text-sm font-medium text-slate-600">لم يرفع المتبرع إيصالًا بعد</p>
                  <p className="max-w-xs text-center text-[12px] leading-5">إن ظهر التحويل في كشف الحساب يمكن تأكيده من هنا مباشرة دون انتظار الإيصال.</p>
                </div>
              )}
            </div>

            {claim.receipts.length > 0 && (
              <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2">
                {claim.receipts.map((f, i) => (
                  <button
                    key={`${f.submission}-${f.uploadedAt}`}
                    type="button"
                    onClick={() => setActiveFile(i)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-start transition-colors",
                      i === activeFile ? "border-brand bg-brand-50" : "border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {f.isImage ? (
                      <img src={f.url} alt="" className="h-9 w-9 rounded object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded bg-rose-50 text-rose-600"><FileText className="h-4 w-4" /></span>
                    )}
                    <span className="min-w-0">
                      <span className="block max-w-[140px] truncate text-[11.5px] font-semibold text-slate-800" dir="ltr">{f.fileName}</span>
                      <span className="block text-[10.5px] text-slate-500">الإرسال {f.submission} · {formatBytes(f.bytes)} · {relativeTime(f.uploadedAt)}</span>
                    </span>
                  </button>
                ))}
                {file && (
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-slate-600 hover:bg-slate-100" title="فتح الملف الأصلي">
                    <ExternalLink className="h-3.5 w-3.5" />
                    الأصل
                  </a>
                )}
              </div>
            )}
          </section>

          {/* What it has to match */}
          <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
            {/* Amount — the one number the receipt must show. */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">المبلغ المتوقع في الإيصال</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[28px] font-bold leading-tight tabular-nums text-slate-900" dir="ltr">{money(claim.donation.totalAmount, claim.donation.currency)}</p>
                {claim.donation.currency !== "USD" && usd(claim.donation.amountUSD) && <p className="text-[13px] tabular-nums text-slate-500" dir="ltr">{usd(claim.donation.amountUSD)}</p>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-slate-600">
                {claim.bankName ? (
                  <span className="inline-flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-slate-400" />{claim.bankName}{claim.bankCurrency && <span dir="ltr" className="rounded bg-slate-100 px-1.5 font-semibold text-slate-700">{claim.bankCurrency}</span>}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-400"><Landmark className="h-3.5 w-3.5" />لم يُحدَّد الحساب البنكي</span>
                )}
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />أُنشئ الطلب {absoluteDate(claim.createdAt)}</span>
              </div>
              {(claim.donation.teamSupport > 0 || claim.donation.fees > 0) && (
                <p className="mt-2 text-[11.5px] text-slate-500">
                  التبرع {money(claim.donation.amount, claim.donation.currency)}
                  {claim.donation.teamSupport > 0 && ` + دعم الفريق ${money(claim.donation.teamSupport, claim.donation.currency)}`}
                  {claim.donation.fees > 0 && ` + رسوم ${money(claim.donation.fees, claim.donation.currency)}`}
                </p>
              )}
            </div>

            {/* What the donor said about the transfer. */}
            <Block title="بيانات التحويل كما أدخلها المتبرع" icon={MessageSquareText}>
              <Row icon={UserRound} label="الاسم على التحويل" value={claim.senderName} />
              <Row icon={CalendarDays} label="تاريخ التحويل" value={claim.transferDate ? dateOnly(claim.transferDate) : null} />
              <Row icon={Hash} label="المرجع / رقم الإيصال" value={claim.transferReference} ltr copyable onCopy={copy} />
              {claim.donorNote && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[12.5px] leading-5 text-slate-700">
                  <span className="mb-0.5 block text-[10.5px] font-semibold text-amber-700">ملاحظة المتبرع</span>
                  {claim.donorNote}
                </div>
              )}
              {claim.receiptSubmittedAt && <p className="text-[11px] text-slate-400">رُفع الإيصال {absoluteDate(claim.receiptSubmittedAt)}</p>}
            </Block>

            {/* Who. */}
            <Block title="المتبرع" icon={UserRound} action={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11.5px]" onClick={() => openUserProfile(claim.donor.id)}>
                <ExternalLink className="h-3 w-3" />
                الملف الكامل
              </Button>
            }>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 rounded-full ring-2 ring-white shadow-sm">
                  <AvatarImage src={claim.donor.image ?? undefined} alt="" />
                  <AvatarFallback className="rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-semibold text-white">{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-900">{claim.donor.name || "متبرع بلا اسم"}</p>
                  <p className="text-[11.5px] text-slate-500">عضو منذ {dateOnly(claim.donor.memberSince)}</p>
                </div>
              </div>
              <Row icon={Mail} label="البريد" value={claim.donor.email} ltr copyable onCopy={copy} href={claim.donor.email ? `mailto:${claim.donor.email}` : undefined} />
              <Row icon={Phone} label="الهاتف" value={claim.donor.phone} ltr copyable onCopy={copy} href={claim.donor.phone ? `https://wa.me/${claim.donor.phone.replace(/[^\d]/g, "")}` : undefined} />
              <Row icon={Globe} label="الدولة / اللغة" value={[claim.donor.countryName ?? claim.donation.donorCountryCode, claim.donation.locale ? LOCALE_LABELS[claim.donation.locale as keyof typeof LOCALE_LABELS] ?? claim.donation.locale : null].filter(Boolean).join(" · ") || null} />
            </Block>

            {/* What for. */}
            <Block title="وجهة التبرع" icon={Receipt}>
              <ul className="divide-y divide-slate-100">
                {claim.donation.lines.map((line) => (
                  <li key={`${line.kind}-${line.id}`} className="flex items-center gap-3 py-2">
                    {line.image ? <img src={line.image} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="h-9 w-9 rounded-md bg-slate-100" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{line.title}</span>
                      <span className="text-[10.5px] text-slate-400">{line.kind === "campaign" ? "مشروع" : "حملة / تصنيف"}</span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-slate-900" dir="ltr">{money(line.amount, claim.donation.currency)}</span>
                  </li>
                ))}
                {claim.donation.lines.length === 0 && <li className="py-2 text-[12px] text-slate-400">لا توجد بنود</li>}
              </ul>
              <Row icon={Hash} label="رقم الطلب" value={claim.donationId} ltr copyable onCopy={copy} mono />
              <Row icon={Link2} label="صفحة المتبرع" value={donorPage} ltr copyable onCopy={copy} href={donorPage} truncate />
            </Block>

            {/* Decision trail. */}
            {(claim.reviewedAt || claim.rejectionReason) && (
              <Block title="سجل المراجعة" icon={ShieldCheck}>
                {claim.reviewedAt && <p className="text-[12.5px] text-slate-700">{claim.status === "CONFIRMED" ? "أكّده" : "رفضه"} <b>{claim.reviewedByName ?? "—"}</b> {absoluteDate(claim.reviewedAt)}</p>}
                {claim.rejectionReason && (
                  <div className="rounded-lg border border-rose-100 bg-rose-50/70 px-3 py-2 text-[12.5px] leading-5 text-rose-800">
                    <span className="mb-0.5 block text-[10.5px] font-semibold">سبب الرفض المُرسل للمتبرع</span>
                    {claim.rejectionReason}
                  </div>
                )}
                {claim.status === "REJECTED" && <p className="text-[11.5px] text-slate-500">{remaining > 0 ? `يمكن للمتبرع رفع الإيصال ${remaining} ${remaining === 1 ? "مرة" : "مرات"} أخرى.` : "استُنفدت محاولات الرفع — المتابعة يدويًا مع المتبرع."}</p>}
                {claim.status === "CONFIRMED" && claim.donation.paidAt && (
                  <a href={`/api/donations/${claim.donationId}/receipt?locale=ar`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline">
                    <FileText className="h-3.5 w-3.5" />
                    الإيصال الرسمي (PDF)
                  </a>
                )}
              </Block>
            )}

            {/* Internal note. */}
            <Block title="ملاحظة داخلية" icon={StickyNote} hint="لا تظهر للمتبرع">
              <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} placeholder="رقم العملية في كشف الحساب، من تحقق منه، أي شيء يفيد المراجع التالي…" rows={2} className="text-[13px]" />
              {noteDirty && (
                <Button variant="outline" size="sm" className="gap-1.5 self-start" disabled={busy !== null} onClick={() => run({ action: "note", adminNote: note.trim() || null })}>
                  {busy === "note" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  حفظ الملاحظة
                </Button>
              )}
            </Block>
          </section>
        </div>

        {/* ── Decision ───────────────────────────────────────────────── */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <p className="text-[11.5px] text-slate-500">
            {decided
              ? "تم الاعتماد: التبرع محسوب في الإجماليات وأُرسل الإيصال الرسمي."
              : claim.status === "REJECTED"
                ? "مرفوض حاليًا. يمكن التأكيد إن ظهر التحويل لاحقًا في كشف الحساب."
                : "التأكيد يحتسب التبرع فورًا في الإيرادات وإجماليات المشاريع ويُرسل الإيصال للمتبرع."}
          </p>
          {!decided && (
            <div className="flex items-center gap-2">
              {claim.status !== "REJECTED" && (
                <Button variant="outline" className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busy !== null} onClick={() => setRejectOpen(true)}>
                  <Ban className="h-4 w-4" />
                  رفض
                </Button>
              )}
              <Button className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy !== null} onClick={() => setConfirmOpen(true)}>
                {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                تأكيد التحويل
              </Button>
            </div>
          )}
        </footer>
      </DialogContent>

      {/* Zoomed receipt */}
      {zoom && file?.isImage && (
        <Dialog open onOpenChange={(open) => !open && setZoom(false)}>
          <DialogContent hideCloseButton className="max-h-[96vh] w-[calc(100%-1rem)] max-w-[96vw] overflow-auto rounded-xl bg-black/95 p-2">
            <DialogTitle className="sr-only">{file.fileName}</DialogTitle>
            <img src={file.url} alt={file.fileName} className="mx-auto h-auto w-auto max-w-full" />
            <Button variant="secondary" size="sm" className="absolute end-3 top-3 rounded-full" onClick={() => setZoom(false)} aria-label="إغلاق">
              <X className="h-4 w-4" />
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد التحويل البنكي؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              سيُسجَّل تبرع <b dir="ltr">{money(claim.donation.totalAmount, claim.donation.currency)}</b> من <b>{claim.donor.name || "المتبرع"}</b> كتبرع ناجح: يُحتسب في الإيرادات وإجماليات المشاريع وملف المتبرع، ويُرسل الإيصال الرسمي إلى بريده. تأكد أولًا أن المبلغ ظهر فعلًا في كشف الحساب.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                void run({ action: "confirm", adminNote: noteDirty ? note.trim() || null : undefined });
              }}
            >
              نعم، المبلغ وصل — تأكيد
            </AlertDialogAction>
            <AlertDialogCancel>رجوع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent dir="rtl" className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>رفض الإيصال</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              يُرسل السبب إلى المتبرع بالبريد ويظهر له في صفحة التبرع، ويمكنه رفع إيصال آخر ({remaining > 0 ? `${remaining} ${remaining === 1 ? "محاولة متبقية" : "محاولات متبقية"}` : "لا محاولات متبقية"}). اكتب سببًا يساعده على التصحيح.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {REJECTION_PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => setReason(preset)} className={cn("rounded-full border px-2.5 py-1 text-[11.5px] transition-colors", reason === preset ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                {preset}
              </button>
            ))}
          </div>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 600))} placeholder="سبب الرفض كما سيقرؤه المتبرع…" rows={3} className="text-[13px]" autoFocus />
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={!reason.trim()}
              onClick={(e) => {
                e.preventDefault();
                if (!reason.trim()) return;
                setRejectOpen(false);
                void run({ action: "reject", reason: reason.trim(), adminNote: noteDirty ? note.trim() || null : undefined });
              }}
            >
              رفض وإبلاغ المتبرع
            </AlertDialogAction>
            <AlertDialogCancel>رجوع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function Block({ title, icon: Icon, hint, action, children }: { title: string; icon: React.ComponentType<{ className?: string }>; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
          {title}
          {hint && <span className="font-normal text-slate-400">— {hint}</span>}
        </h3>
        {action}
      </header>
      <div className="flex flex-col gap-2 px-3.5 py-3">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  ltr,
  mono,
  truncate,
  copyable,
  href,
  onCopy,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  ltr?: boolean;
  mono?: boolean;
  truncate?: boolean;
  copyable?: boolean;
  href?: string;
  onCopy?: (value: string, label: string) => void;
}) {
  const empty = !value;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="w-28 shrink-0 text-slate-500">{label}</span>
      <span className={cn("min-w-0 flex-1 font-medium text-slate-800", empty && "font-normal text-slate-400", mono && "font-mono text-[11.5px]", truncate && "truncate")} dir={ltr && !empty ? "ltr" : undefined} style={ltr ? { textAlign: "end", unicodeBidi: "isolate" } : undefined}>
        {empty ? "—" : href ? (
          <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="hover:text-brand hover:underline">{value}</a>
        ) : value}
      </span>
      {copyable && !empty && onCopy && (
        <button type="button" onClick={() => onCopy(value!, `تم نسخ ${label}`)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`نسخ ${label}`}>
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
