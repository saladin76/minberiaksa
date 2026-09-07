"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface DeleteDonationRow {
  id: string;
  amount: number;
  totalAmount: number;
  currency: string;
  status: string;
  donor?: { name?: string | null; email?: string | null } | null;
}

interface Props {
  row: DeleteDonationRow;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Hard-confirm delete: the admin must type the donation's exact `amount` to
 * unlock the delete button. We compare against `totalAmount` because deleting
 * removes the entire collected charge, including support/covered fees.
 */
export function DeleteDonationDialog({ row, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTyped("");
  }, [row.id]);

  // Stringify the amount the same way the row renders it — strip trailing zeros
  // so 100 matches "100" not "100.00". User can also type the full numeric.
  const expected = formatExpected(row.totalAmount ?? row.amount);
  const matches = normalizeNumericInput(typed) === expected;

  const handleDelete = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await axios.delete(`/api/donations/${row.id}`);
      toast.success("تم حذف التبرع وتحديث الإجماليات");
      onDeleted();
      onClose();
    } catch (err) {
      console.error("[Donation Delete] failed:", err);
      toast.error("فشل في حذف التبرع");
    } finally {
      setSubmitting(false);
    }
  };

  const donor = row.donor?.name?.trim() || row.donor?.email || "—";

  return (
    <AlertDialog open onOpenChange={(open) => (!open && !submitting ? onClose() : null)}>
      <AlertDialogContent className="max-w-md" dir="rtl">
        <AlertDialogHeader className="text-right sm:text-right">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-rose-900">
            تأكيد حذف التبرع
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 leading-relaxed">
            هذا الإجراء لا يمكن التراجع عنه. سيتم حذف هذا التبرع نهائيًا وخصم
            قيمته من إجماليات المشاريع والحملات إن كان مُساهمًا فيها.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-right">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">المتبرع</span>
              <span className="font-medium text-slate-800">{donor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">إجمالي التحصيل</span>
              <span className="font-bold text-slate-900" dir="ltr">
                {expected} {row.currency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الحالة</span>
              <span className="font-medium text-slate-800">{row.status}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              للتأكيد، اكتب قيمة التبرع تمامًا (<span dir="ltr">{expected}</span>):
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              dir="ltr"
              placeholder={expected}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-right focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
              disabled={submitting}
            />
            {typed && !matches && (
              <p className="text-[11px] text-rose-600">القيمة المُدخلة لا تطابق قيمة التبرع.</p>
            )}
          </div>
        </div>

        <AlertDialogFooter className="!justify-between flex-row-reverse">
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || submitting}
            onClick={handleDelete}
            className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ms-2" />
                جاري الحذف...
              </>
            ) : (
              "حذف نهائيًا"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Render a number the same way the input is parsed back (no trailing zeros). */
function formatExpected(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Show up to 2 decimals; trim trailing zeros and dangling dot.
  return n
    .toFixed(2)
    .replace(/\.?0+$/, "");
}

function normalizeNumericInput(s: string): string {
  const normalized = s.trim().replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? formatExpected(n) : normalized;
}
