"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dt, dashDir } from "@/lib/dashboard/i18n";
type Snapshot = {
  category: { id: string; name: string; editorVersion: string | null };
  projects: {
    id: string;
    title: string;
    isActive: boolean;
    isDeleted: boolean;
    categoryIds: string[];
  }[];
  references: {
    donations: number;
    subscriptions: number;
    programmeReferences: number;
  };
  canDetachAndDelete: boolean;
};
export function CategoryLinkedProjects({
  categoryId,
  admin,
  onClose,
  onDeleted,
}: {
  categoryId: string;
  admin: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/categories/${categoryId}/projects`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(dt("تعذر تحميل المشاريع المرتبطة"));
        setData(await response.json());
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [categoryId]);
  const remove = async () => {
    if (!data || confirmation !== data.category.name || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/categories/${categoryId}/projects`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation,
            editorVersion: data.category.editorVersion,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          dt("تعذر الحذف. تغيّرت بيانات التصنيف أو توجد مراجع تحتاج المراجعة."),
        );
      onDeleted();
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        dir={dashDir()}
        closeClassName={dashDir() === "rtl" ? "left-4 right-auto" : undefined}
        className="flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl flex-col overflow-hidden"
      >
        <DialogHeader className="pe-6 sm:text-start">
          <DialogTitle>
            {dt("كل المشاريع المرتبطة")} · {data?.category.name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-7">
          {dt(
            "تشمل القائمة المشاريع المنشورة والمخفية والمحذوفة ناعمًا. لا تظهر المشاريع المخفية للعامة، لكنها تحتفظ بارتباطاتها وسجلاتها المالية.",
          )}
        </p>
        {error ? (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
        <div className="min-h-0 overflow-auto">
          <table className="w-full min-w-[550px] text-sm">
            <thead>
              <tr>
                <th className="p-2 text-start">{dt("المشروع")}</th>
                <th className="p-2">{dt("الحالة")}</th>
                <th className="p-2">{dt("عدد التصنيفات")}</th>
                <th className="p-2">{dt("الإجراءات")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.projects.map((project) => (
                <tr className="border-t" key={project.id}>
                  <td className="p-2">{project.title}</td>
                  <td className="p-2">
                    {project.isDeleted
                      ? dt("محذوف ناعمًا")
                      : project.isActive
                        ? dt("منشور")
                        : dt("مخفي")}
                  </td>
                  <td className="p-2">{project.categoryIds.length}</td>
                  <td className="p-2">
                    <Link
                      className="underline"
                      href={`/dashboard/campaigns/edit/${project.id}`}
                    >
                      {dt("فتح المشروع")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data ? (
          <p className="text-xs leading-6">
            {dt(
              "مراجع مباشرة للتصنيف: {0} بنود تبرع، {1} بنود اشتراك، {2} مواضع داخل المشاريع الكبرى.",
              [
                data.references.donations,
                data.references.subscriptions,
                data.references.programmeReferences,
              ],
            )}
          </p>
        ) : null}
        {admin && data?.canDetachAndDelete ? (
          <div className="space-y-2 rounded-lg border border-red-200 p-3">
            <p className="text-sm">
              {dt(
                "يمكن حذف التصنيف بعد فك ارتباط مشاريعه. ستبقى المشاريع وروابطها وتبرعاتها واشتراكاتها. هذا الإجراء نهائي.",
              )}
            </p>
            <label className="block text-sm">
              {dt("اكتب اسم التصنيف للتأكيد")}
              <input
                className="mt-1 w-full rounded border p-2"
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button
              disabled={busy || confirmation !== data.category.name}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-40"
              onClick={remove}
            >
              {dt("فك الارتباط وحذف التصنيف")}
            </button>
          </div>
        ) : data ? (
          <p className="text-xs text-amber-800">
            {dt(
              "الحذف النهائي متاح للإدارة للتصنيفات المؤرشفة الخالية من المراجع المالية ومراجع الصفحات.",
            )}
          </p>
        ) : !error ? (
          <p>{dt("جار التحميل…")}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
