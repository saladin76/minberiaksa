"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CampaignOption {
  id: string;
  title: string;
}
interface CategoryOption {
  id: string;
  name: string;
}

interface DonationDetail {
  id: string;
  amount: number;
  totalAmount: number;
  currency: string;
  status: "PAID" | "FAILED";
  paidAt: string | null;
  // null on one-time donations; set for monthly subscription rows. Monthly
  // donations are treated as ناجح in the UI even with paidAt=null, so the
  // edit dialog skips the قيد التأكيد option for them.
  subscriptionId?: string | null;
  donor?: { name: string | null; email: string | null } | null;
  items: { campaignId: string; amount: number; campaign: { title: string } }[];
  categoryItems: { categoryId: string; amount: number; category: { name: string } }[];
}

interface Props {
  donationId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EditableItem {
  key: string; // local key for React list
  kind: "campaign" | "category";
  refId: string; // campaignId or categoryId
  label: string;
  amount: string; // string for input control
}

/**
 * Admin edit dialog: amount per line, status flip, add/remove/reassign lines.
 * Server PATCH atomically recomputes campaign/category totals from the diff
 * between OLD and NEW contribution maps (see /api/donations/[id] PATCH).
 */
export function EditDonationDialog({ donationId, onClose, onSaved }: Props) {
  const [donation, setDonation] = useState<DonationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmTyped, setConfirmTyped] = useState("");

  // قيد التأكيد = PAID with paidAt=null. We expose it as a distinct dropdown
  // option so admins can either leave it pending or confirm it (stamp paidAt
  // and let the server roll the amount into campaign/category totals).
  const [statusChoice, setStatusChoice] = useState<"PAID" | "PAID_PENDING" | "FAILED">("PAID");
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);

  // Picker datasets — fetched once when dialog opens.
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [donRes, campRes, catRes] = await Promise.all([
          axios.get(`/api/donations/${donationId}`),
          axios.get(`/api/campaigns?limit=500&includeInactive=true`).catch(() => ({ data: { items: [] } })),
          axios.get(`/api/categories?limit=500`).catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;

        const d = donRes.data as DonationDetail;
        setDonation(d);
        // Monthly donations are surfaced as ناجح everywhere — default the
        // edit dialog to "PAID" so saving stamps paidAt and contributes the
        // amount to campaign currentAmount (no قيد التأكيد middle option).
        const isMonthly = d.subscriptionId != null;
        setStatusChoice(
          d.status === "FAILED"
            ? "FAILED"
            : d.paidAt === null && !isMonthly
              ? "PAID_PENDING"
              : "PAID"
        );

        const rows: EditableItem[] = [];
        for (const it of d.items ?? []) {
          rows.push({
            key: `c-${it.campaignId}-${rows.length}`,
            kind: "campaign",
            refId: it.campaignId,
            label: it.campaign?.title ?? "—",
            amount: String(it.amount),
          });
        }
        for (const it of d.categoryItems ?? []) {
          rows.push({
            key: `g-${it.categoryId}-${rows.length}`,
            kind: "category",
            refId: it.categoryId,
            label: it.category?.name ?? "—",
            amount: String(it.amount),
          });
        }
        setEditableItems(rows);

        // Both /api/campaigns and /api/categories return { items: [...] }.
        const campList = (campRes.data?.items ?? []) as Array<{
          id: string;
          title?: string;
          name?: string;
        }>;
        setCampaigns(
          campList
            .map((c) => ({ id: c.id, title: c.title ?? c.name ?? "—" }))
            .filter((c) => c.id)
        );
        const catList = (catRes.data?.items ?? []) as Array<{
          id: string;
          name?: string;
          title?: string;
        }>;
        setCategories(
          catList
            .map((c) => ({ id: c.id, name: c.name ?? c.title ?? "—" }))
            .filter((c) => c.id)
        );
      } catch (err) {
        console.error("[Edit Donation] load failed:", err);
        toast.error("فشل في تحميل تفاصيل التبرع");
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [donationId, onClose]);

  const newAmountSum = useMemo(
    () => editableItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [editableItems]
  );

  const hasInvalidLine = editableItems.some(
    (it) => !it.refId || !Number.isFinite(Number(it.amount)) || Number(it.amount) <= 0
  );
  const hasDuplicateLine = (() => {
    const seen = new Set<string>();
    for (const it of editableItems) {
      const k = `${it.kind}:${it.refId}`;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  })();
  const canSave =
    !loading &&
    !submitting &&
    editableItems.length > 0 &&
    newAmountSum > 0 &&
    !hasInvalidLine &&
    !hasDuplicateLine;
  const confirmExpected = formatExpected(newAmountSum);
  const confirmMatches = normalizeNumericInput(confirmTyped) === confirmExpected;

  const dirty = useMemo(() => {
    if (!donation) return false;
    const isMonthly = donation.subscriptionId != null;
    const originalChoice: "PAID" | "PAID_PENDING" | "FAILED" =
      donation.status === "FAILED"
        ? "FAILED"
        : donation.paidAt === null && !isMonthly
          ? "PAID_PENDING"
          : "PAID";
    if (originalChoice !== statusChoice) return true;
    const old: EditableItem[] = [
      ...donation.items.map((i) => ({
        key: "",
        kind: "campaign" as const,
        refId: i.campaignId,
        label: "",
        amount: String(i.amount),
      })),
      ...donation.categoryItems.map((i) => ({
        key: "",
        kind: "category" as const,
        refId: i.categoryId,
        label: "",
        amount: String(i.amount),
      })),
    ];
    if (old.length !== editableItems.length) return true;
    const sig = (xs: EditableItem[]) =>
      xs
        .map((x) => `${x.kind}:${x.refId}:${Number(x.amount)}`)
        .sort()
        .join("|");
    return sig(old) !== sig(editableItems);
  }, [donation, editableItems, statusChoice]);

  const setLineAmount = (idx: number, val: string) => {
    setEditableItems((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: val } : it)));
  };
  const setLineRef = (idx: number, refId: string) => {
    setEditableItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const label =
          it.kind === "campaign"
            ? campaigns.find((c) => c.id === refId)?.title ?? "—"
            : categories.find((c) => c.id === refId)?.name ?? "—";
        return { ...it, refId, label };
      })
    );
  };
  const removeLine = (idx: number) =>
    setEditableItems((prev) => prev.filter((_, i) => i !== idx));
  const addLine = (kind: "campaign" | "category") =>
    setEditableItems((prev) => [
      ...prev,
      {
        key: `${kind === "campaign" ? "c" : "g"}-new-${Date.now()}`,
        kind,
        refId: "",
        label: "",
        amount: "0",
      },
    ]);

  const submit = async () => {
    if (!canSave || !donation) return;
    setSubmitting(true);
    try {
      const items = editableItems
        .filter((it) => it.kind === "campaign")
        .map((it) => ({ campaignId: it.refId, amount: Number(it.amount) }));
      const categoryItems = editableItems
        .filter((it) => it.kind === "category")
        .map((it) => ({ categoryId: it.refId, amount: Number(it.amount) }));

      const status = statusChoice === "FAILED" ? "FAILED" : "PAID";
      // "PAID" (vs "PAID_PENDING") is admin's explicit confirmation that the
      // donation actually settled — server stamps paidAt when it was null.
      const confirmPaidAt = statusChoice === "PAID";
      await axios.patch(`/api/donations/${donationId}`, {
        status,
        confirmPaidAt,
        items,
        categoryItems,
      });
      toast.success("تم تعديل التبرع وتحديث الإجماليات");
      onSaved();
      onClose();
    } catch (err) {
      console.error("[Edit Donation] save failed:", err);
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || "فشل في تعديل التبرع");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  const donor = donation?.donor?.name?.trim() || donation?.donor?.email || "—";
  const isMonthly = !!donation && donation.subscriptionId != null;
  const wasContributing = !!donation && donation.status === "PAID" && donation.paidAt !== null;
  // Pending toggle only applies to one-time donations. Monthly donations are
  // treated as ناجح in dashboards regardless of paidAt, so the dialog hides
  // the قيد التأكيد middle option for them.
  const wasPending =
    !!donation && donation.status === "PAID" && donation.paidAt === null && !isMonthly;
  const statusWillRemoveContribution = wasContributing && statusChoice === "FAILED";
  const statusWillAddContribution =
    !!donation &&
    !wasContributing &&
    statusChoice === "PAID";

  return (
    <Dialog open onOpenChange={(open) => (!open && !submitting ? onClose() : null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>تعديل التبرع</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            أي تغيير في القيمة أو الحالة سيُحدّث تلقائيًا إجماليات المشاريع
            والحملات. تأكّد من القيم قبل الحفظ.
          </DialogDescription>
        </DialogHeader>

        {loading || !donation ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 text-right text-sm">
            {/* Donor + meta */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs grid grid-cols-2 gap-y-1">
              <span className="text-slate-500">المتبرع</span>
              <span className="font-medium text-slate-800 text-left" dir="auto">
                {donor}
              </span>
              <span className="text-slate-500">العملة</span>
              <span className="font-medium text-slate-800 text-left">{donation.currency}</span>
              <span className="text-slate-500">القيمة الحالية</span>
              <span className="font-medium text-slate-800 text-left" dir="ltr">
                {donation.amount} {donation.currency}
              </span>
              <span className="text-slate-500">paidAt</span>
              <span className="font-medium text-slate-800 text-left" dir="ltr">
                {donation.paidAt ?? "—"}
              </span>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">الحالة</label>
              <Select
                value={statusChoice}
                onValueChange={(v) =>
                  setStatusChoice(v as "PAID" | "PAID_PENDING" | "FAILED")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAID">
                    {wasPending ? "ناجح — تأكيد الدفع الآن (PAID)" : "ناجح (PAID)"}
                  </SelectItem>
                  {wasPending && (
                    <SelectItem value="PAID_PENDING">قيد التأكيد (PAID — بدون paidAt)</SelectItem>
                  )}
                  <SelectItem value="FAILED">فاشل (FAILED)</SelectItem>
                </SelectContent>
              </Select>
              {statusWillRemoveContribution && (
                <p className="text-[11px] text-rose-600 leading-relaxed">
                  تحويل التبرع إلى «فاشل» سيخصم قيمته من إجمالي المشاريع/الحملات المرتبطة.
                </p>
              )}
              {statusWillAddContribution && (
                <p className="text-[11px] text-amber-600 leading-relaxed">
                  تحويل التبرع إلى «ناجح» سيُسجّل تاريخ الدفع الآن ويُضيف قيمته إلى إجمالي المشاريع/الحملات المرتبطة.
                </p>
              )}
              {wasPending && statusChoice === "PAID_PENDING" && (
                <p className="text-[11px] text-amber-600 leading-relaxed">
                  هذا التبرع لم يُسجّل بـ paidAt — لن يُضاف إلى الإجماليات حتى يُؤكد الدفع.
                </p>
              )}
            </div>

            {/* Line items editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">عناصر التبرع</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => addLine("campaign")}
                  >
                    <Plus className="h-3 w-3 ms-1" /> مشروع
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => addLine("category")}
                  >
                    <Plus className="h-3 w-3 ms-1" /> حملة
                  </Button>
                </div>
              </div>

              {editableItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                  لا توجد عناصر — أضف على الأقل مشروعًا أو حملة واحدة.
                </p>
              ) : (
                <div className="space-y-2">
                  {editableItems.map((it, idx) => {
                    const options = it.kind === "campaign" ? campaigns : categories;
                    return (
                      <div
                        key={it.key}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
                      >
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            it.kind === "campaign"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {it.kind === "campaign" ? "مشروع" : "حملة"}
                        </span>
                        <Select
                          value={it.refId || undefined}
                          onValueChange={(v) => setLineRef(idx, v)}
                        >
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue placeholder={it.kind === "campaign" ? "اختر مشروعًا" : "اختر حملة"} />
                          </SelectTrigger>
                          <SelectContent>
                            {options.length === 0 ? (
                              <SelectItem value="__none" disabled>
                                لا توجد خيارات
                              </SelectItem>
                            ) : (
                              options.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {it.kind === "campaign"
                                    ? (o as CampaignOption).title
                                    : (o as CategoryOption).name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.amount}
                          onChange={(e) => setLineAmount(idx, e.target.value)}
                          dir="ltr"
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs text-right"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-rose-500 hover:text-rose-700"
                          aria-label="حذف السطر"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs">
                <span className="text-slate-600">إجمالي العناصر الجديد</span>
                <span className="font-bold text-slate-900" dir="ltr">
                  {newAmountSum} {donation.currency}
                </span>
              </div>

              {hasDuplicateLine && (
                <p className="text-[11px] text-rose-600">
                  يوجد سطران للمشروع/الحملة نفسها — ادمجهما في سطر واحد.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="!justify-between flex-row-reverse">
          <Button
            type="button"
            onClick={() => {
              setConfirmTyped("");
              setShowConfirm(true);
            }}
            disabled={!canSave || !dirty}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            حفظ التعديلات
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
        </DialogFooter>

        {/* Confirmation gate — second click pattern, since edits are destructive. */}
        {showConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl text-right" dir="rtl">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">تأكيد التعديل</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    سيتم تطبيق التعديل وتحديث إجماليات المشاريع/الحملات تلقائيًا. هل أنت متأكد؟
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1 text-right">
                <label className="block text-xs font-medium text-slate-700">
                  للتأكيد، اكتب إجمالي عناصر التبرع الجديد تمامًا (<span dir="ltr">{confirmExpected}</span>):
                </label>
                <input
                  type="text"
                  value={confirmTyped}
                  onChange={(e) => setConfirmTyped(e.target.value)}
                  autoFocus
                  dir="ltr"
                  placeholder={confirmExpected}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-right focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
                  disabled={submitting}
                />
                {confirmTyped && !confirmMatches && (
                  <p className="text-[11px] text-rose-600">القيمة المُدخلة لا تطابق إجمالي عناصر التبرع الجديد.</p>
                )}
              </div>
              <div className="mt-4 flex justify-between gap-2">
                <Button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !confirmMatches}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin ms-2" />
                      جاري الحفظ...
                    </>
                  ) : (
                    "نعم، طبّق التعديل"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                >
                  تراجع
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Render a number the same way the input is parsed back (no trailing zeros). */
function formatExpected(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function normalizeNumericInput(s: string): string {
  const normalized = s.trim().replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? formatExpected(n) : normalized;
}
