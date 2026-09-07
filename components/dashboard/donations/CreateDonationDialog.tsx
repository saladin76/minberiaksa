"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { AlertTriangle, Loader2, Plus, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CampaignOption {
  id: string;
  title: string;
}
interface CategoryOption {
  id: string;
  name: string;
}
interface DonorOption {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

type DonorMode = "EXISTING" | "NEW" | "UNKNOWN";

interface EditableItem {
  key: string;
  kind: "campaign" | "category";
  refId: string;
  label: string;
  amount: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const CURRENCIES = ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "EGP", "KWD", "QAR"];

/**
 * Admin "manually add donation" dialog. The server marks the row PAID + paidAt
 * immediately and increments campaign/category currentAmount, so this is the
 * one place admins reconcile cash / bank transfer money that bypassed the
 * regular checkout flow.
 */
export function CreateDonationDialog({ onClose, onCreated }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  const [donorMode, setDonorMode] = useState<DonorMode>("EXISTING");
  const [donorSearch, setDonorSearch] = useState("");
  const [donorResults, setDonorResults] = useState<DonorOption[]>([]);
  const [donorSearching, setDonorSearching] = useState(false);
  const [donor, setDonor] = useState<DonorOption | null>(null);
  const [newDonorName, setNewDonorName] = useState("");
  const [newDonorPhone, setNewDonorPhone] = useState("");
  const [newDonorEmail, setNewDonorEmail] = useState("");

  const [currency, setCurrency] = useState("USD");
  // `provider` is the gateway/rail label stored on Donation.provider
  // ("BANK" / "PAYFOR" / "ALBARAKA" / "STRIPE"). All are card-style rails, so
  // Donation.paymentMethod is always CARD here.
  const [provider, setProvider] = useState<"BANK" | "PAYFOR" | "ALBARAKA" | "STRIPE">("BANK");
  const [teamSupport, setTeamSupport] = useState("0");
  const [notes, setNotes] = useState("");
  const [editableItems, setEditableItems] = useState<EditableItem[]>([
    {
      key: `c-init-${Date.now()}`,
      kind: "campaign",
      refId: "",
      label: "",
      amount: "0",
    },
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [campRes, catRes] = await Promise.all([
          axios
            .get(`/api/campaigns?limit=500&isActiveFalse=true`)
            .catch(() => ({ data: { items: [] } })),
          axios.get(`/api/categories?limit=500`).catch(() => ({ data: { items: [] } })),
        ]);
        if (cancelled) return;
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
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runDonorSearch = async () => {
    const q = donorSearch.trim();
    if (!q) return;
    setDonorSearching(true);
    try {
      const res = await axios.get(`/api/users?search=${encodeURIComponent(q)}`);
      const users = (res.data?.users ?? []) as Array<{
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
      }>;
      setDonorResults(users.slice(0, 25));
    } catch {
      toast.error("فشل البحث عن المتبرعين");
      setDonorResults([]);
    } finally {
      setDonorSearching(false);
    }
  };

  const amountSum = useMemo(
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
  const teamSupportNumber = Math.max(0, Number(teamSupport) || 0);
  const donorPickerValid =
    (donorMode === "EXISTING" && donor != null) ||
    (donorMode === "NEW" && newDonorName.trim().length > 0) ||
    donorMode === "UNKNOWN";
  const canSave =
    !submitting &&
    donorPickerValid &&
    editableItems.length > 0 &&
    amountSum > 0 &&
    !hasInvalidLine &&
    !hasDuplicateLine;

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
        key: `${kind === "campaign" ? "c" : "g"}-new-${Date.now()}-${prev.length}`,
        kind,
        refId: "",
        label: "",
        amount: "0",
      },
    ]);

  const submit = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      const items = editableItems
        .filter((it) => it.kind === "campaign")
        .map((it) => ({ campaignId: it.refId, amount: Number(it.amount) }));
      const categoryItems = editableItems
        .filter((it) => it.kind === "category")
        .map((it) => ({ categoryId: it.refId, amount: Number(it.amount) }));

      const donorPayload =
        donorMode === "EXISTING" && donor
          ? { mode: "EXISTING" as const, id: donor.id }
          : donorMode === "NEW"
            ? {
                mode: "NEW" as const,
                name: newDonorName.trim(),
                phone: newDonorPhone.trim() || null,
                email: newDonorEmail.trim() || null,
              }
            : { mode: "UNKNOWN" as const };

      const res = await axios.post(`/api/admin/donations`, {
        donor: donorPayload,
        items,
        categoryItems,
        currency,
        teamSupport: teamSupportNumber,
        // All three rails (BANK / PAYFOR / STRIPE) are card-style for the
        // donation schema; the `provider` field is what distinguishes them.
        paymentMethod: "CARD",
        provider,
        notes: notes.trim() || null,
      });
      const created = res.data?.donorCreated === true;
      toast.success(
        created
          ? "تم إنشاء المتبرع وتسجيل التبرع"
          : donorMode === "UNKNOWN"
            ? "تم تسجيل تبرع متبرع غير معروف"
            : "تم إضافة التبرع وتحديث الإجماليات"
      );
      onCreated();
      onClose();
    } catch (err) {
      console.error("[Create Donation] save failed:", err);
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || "فشل في إضافة التبرع");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !submitting ? onClose() : null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>إضافة تبرع يدوي</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            يُسجَّل التبرع كناجح فورًا ويُضاف إلى إجماليات المشاريع/الحملات
            المرتبطة. استخدمها لتسجيل المدفوعات النقدية أو التحويلات البنكية
            التي تمّت خارج بوابة الدفع.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-right text-sm">
          {/* Donor */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700">المتبرع</label>
            <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
              {[
                { value: "EXISTING" as const, label: "متبرع موجود" },
                { value: "NEW" as const, label: "متبرع جديد" },
                { value: "UNKNOWN" as const, label: "غير معروف" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setDonorMode(opt.value)}
                  className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
                    donorMode === opt.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {donorMode === "EXISTING" && (
              <>
                {donor ? (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-right">
                      <p className="font-medium text-slate-800">{donor.name || "—"}</p>
                      <p className="text-[11px] text-slate-500">
                        {donor.email || donor.phone || donor.id}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDonor(null)}
                      className="h-7 text-xs"
                    >
                      تغيير
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={donorSearch}
                        onChange={(e) => setDonorSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void runDonorSearch();
                          }
                        }}
                        placeholder="ابحث بالاسم أو البريد أو الهاتف"
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={runDonorSearch}
                        disabled={donorSearching || !donorSearch.trim()}
                        className="h-8 gap-1.5"
                      >
                        {donorSearching ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        بحث
                      </Button>
                    </div>
                    {donorResults.length > 0 && (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                        {donorResults.map((u) => (
                          <button
                            type="button"
                            key={u.id}
                            onClick={() => {
                              setDonor(u);
                              setDonorResults([]);
                              setDonorSearch("");
                            }}
                            className="w-full text-right px-3 py-2 text-xs hover:bg-slate-50"
                          >
                            <div className="font-medium text-slate-800">{u.name || "—"}</div>
                            <div className="text-[11px] text-slate-500">
                              {u.email || u.phone || u.id}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {donorMode === "NEW" && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">
                  سيتم إنشاء حساب متبرع جديد. الاسم مطلوب — البريد والهاتف اختياريان.
                  إذا أدخلت بريدًا موجودًا، سيُربط التبرع بالمتبرع الحالي تلقائيًا.
                </p>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-600">الاسم *</label>
                  <Input
                    value={newDonorName}
                    onChange={(e) => setNewDonorName(e.target.value)}
                    placeholder="مثال: أحمد محمد"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600">الهاتف</label>
                    <Input
                      value={newDonorPhone}
                      onChange={(e) => setNewDonorPhone(e.target.value)}
                      placeholder="+90..."
                      dir="ltr"
                      className="h-8 text-xs text-right"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600">البريد</label>
                    <Input
                      value={newDonorEmail}
                      onChange={(e) => setNewDonorEmail(e.target.value)}
                      placeholder="name@example.com"
                      dir="ltr"
                      className="h-8 text-xs text-right"
                    />
                  </div>
                </div>
              </div>
            )}

            {donorMode === "UNKNOWN" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">سيتم تسجيل التبرع باسم "متبرع غير معروف".</p>
                  <p>
                    جميع التبرعات غير المعروفة تُسجَّل تحت نفس الحساب الموحد، فلا
                    يمكن تخصيصها لشخص لاحقًا. استخدم هذا الخيار للتبرعات النقدية
                    التي لا توجد لها معلومات متبرع.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Currency + payment + team support */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">العملة</label>
              <Select value={currency} onValueChange={(v) => setCurrency(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">طريقة الدفع</label>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as "BANK" | "PAYFOR" | "ALBARAKA" | "STRIPE")}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK" className="text-xs">حساب بنكي</SelectItem>
                  <SelectItem value="PAYFOR" className="text-xs">Ziraat Payfor</SelectItem>
                  <SelectItem value="ALBARAKA" className="text-xs">Albaraka Türk</SelectItem>
                  <SelectItem value="STRIPE" className="text-xs">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">دعم الفريق</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={teamSupport}
                onChange={(e) => setTeamSupport(e.target.value)}
                dir="ltr"
                className="w-full h-8 rounded-md border border-slate-300 px-2 text-xs text-right"
              />
            </div>
          </div>

          {/* Line items */}
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
                  disabled={loadingFilters}
                >
                  <Plus className="h-3 w-3 ms-1" /> مشروع
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => addLine("category")}
                  disabled={loadingFilters}
                >
                  <Plus className="h-3 w-3 ms-1" /> حملة
                </Button>
              </div>
            </div>

            {editableItems.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                أضف على الأقل مشروعًا أو حملة واحدة.
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
                          <SelectValue
                            placeholder={it.kind === "campaign" ? "اختر مشروعًا" : "اختر حملة"}
                          />
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
              <span className="text-slate-600">إجمالي العناصر</span>
              <span className="font-bold text-slate-900" dir="ltr">
                {amountSum + teamSupportNumber} {currency}
              </span>
            </div>

            {hasDuplicateLine && (
              <p className="text-[11px] text-rose-600">
                يوجد سطران للمشروع/الحملة نفسها — ادمجهما في سطر واحد.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">ملاحظة (اختياري)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تحويل بنكي تم تأكيده يدويًا"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="!justify-between flex-row-reverse">
          <Button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!canSave}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            تسجيل التبرع
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
        </DialogFooter>

        {showConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl text-right" dir="rtl">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">تأكيد إضافة التبرع</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    سيتم تسجيل التبرع كناجح وإضافة قيمته إلى إجماليات
                    المشاريع/الحملات. هل أنت متأكد؟
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-between gap-2">
                <Button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin ms-2" />
                      جاري التسجيل...
                    </>
                  ) : (
                    "نعم، سجّل التبرع"
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
