"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Link2, Plus, BarChart3, Infinity, Pencil, MoreHorizontal } from "lucide-react";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  getMinCookieExpiryDaysForEdit,
  getReferralCookieSettingsWindow,
} from "@/lib/referral-cookie-settings";

interface ReferralRow {
  id: string;
  code: string;
  name: string | null;
  cookieExpiryDays?: number;
  createdAt: string;
  donationsCount: number;
}

export default function ReferralsPage() {
  const [list, setList] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [cookieExpiryDays, setCookieExpiryDays] = useState(30);
  const [cookieUnlimited, setCookieUnlimited] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<ReferralRow | null>(null);
  const [editCookieExpiryDays, setEditCookieExpiryDays] = useState(30);
  const [editCookieUnlimited, setEditCookieUnlimited] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const editMinCookieDays = useMemo(
    () => (editingReferral ? getMinCookieExpiryDaysForEdit(editingReferral.createdAt) : 1),
    [editingReferral]
  );

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/referrals");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to load");
      }
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch {
      toast.error("فشل في تحميل قائمة الإحالات");
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = createCode.trim();
    if (!code) {
      toast.error("أدخل رمز التتبع");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: createName.trim() || undefined,
          cookieExpiryDays: cookieUnlimited ? 0 : (cookieExpiryDays > 0 ? cookieExpiryDays : 30),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "فشل في إنشاء الرابط");
        return;
      }
      toast.success("تم إنشاء الرابط");
      setCreateCode("");
      setCreateName("");
      setCookieExpiryDays(30);
      setCookieUnlimited(false);
      setDialogOpen(false);
      fetchList();
    } finally {
      setCreating(false);
    }
  };

  const openEditCookie = (r: ReferralRow) => {
    const minDays = getMinCookieExpiryDaysForEdit(r.createdAt);
    const days = r.cookieExpiryDays ?? 30;
    setEditingReferral(r);
    setEditCookieUnlimited(days === 0);
    setEditCookieExpiryDays(days === 0 ? minDays : Math.max(minDays, days));
    setEditDialogOpen(true);
  };

  const handleSaveCookieExpiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferral) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/referrals/${editingReferral.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cookieExpiryDays: editCookieUnlimited
            ? 0
            : Math.max(
                getMinCookieExpiryDaysForEdit(editingReferral.createdAt),
                editCookieExpiryDays
              ),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "فشل في حفظ المدة");
        return;
      }
      toast.success("تم تحديث مدة الكوكي");
      setEditDialogOpen(false);
      setEditingReferral(null);
      fetchList();
    } finally {
      setSavingEdit(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const localePrefix = "/ar";

  return (
    <div className="min-h-0" dir="rtl">
      <div className="p-0 sm:p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
        <Card className="border-border shadow-sm overflow-hidden">
          {/* Table header: title + add button */}
          <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/40 px-4 sm:px-6 py-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Link2 className="w-4 h-4 text-muted-foreground" />
              قائمة الروابط
            </h2>
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="h-9 gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              إضافة رابط
            </Button>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-muted-foreground mb-4">لا توجد إحالات بعد.</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  إضافة رابط
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-right py-3.5 px-4 font-medium text-muted-foreground">الرمز</th>
                      <th className="text-right py-3.5 px-4 font-medium text-muted-foreground">الاسم</th>
                      <th className="text-right py-3.5 px-4 font-medium text-muted-foreground">
                        صلاحية الكوكي / المتبقي
                      </th>
                      <th className="text-right py-3.5 px-4 font-medium text-muted-foreground">عدد التبرعات</th>
                      <th className="text-right py-3.5 px-4 font-medium text-muted-foreground">التاريخ</th>
                      <th className="text-center py-3.5 px-2 font-medium text-muted-foreground w-12">
                        <span className="sr-only">إجراءات</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const cookieDays = r.cookieExpiryDays ?? 30;
                      const { daysLeft, canEditCookieExpiry } = getReferralCookieSettingsWindow(
                        r.createdAt,
                        cookieDays
                      );
                      return (
                      <tr
                        key={r.id}
                        className="border-b border-border/60 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-2 px-4 font-mono font-medium">
                          {r.code}
                        </td>
                        <td className="py-2 px-4 text-foreground">
                          {r.name || "—"}
                        </td>
                        <td className="py-2 px-4 text-muted-foreground">
                          <div className="flex flex-col gap-1.5 items-start">
                            <div>
                              {cookieDays === 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <Infinity className="w-3.5 h-3.5" />
                                  غير محدود
                                </span>
                              ) : (
                                `${cookieDays} يوم`
                              )}
                            </div>
                            {cookieDays === 0 ? (
                              <span className="text-xs text-muted-foreground/80">
                                
                              </span>
                            ) : daysLeft !== null && daysLeft > 0 ? (
                              <span className="text-xs font-medium text-brand">
                                متبقي {daysLeft} {daysLeft === 1 ? "يوم" : "يوم"}
                              </span>
                            ) : (
                              <span className="text-xs text-brand-orange">
                                انتهت صلاحية التتبع
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-4 font-medium tabular-nums">
                          {r.donationsCount}
                        </td>
                        <td className="py-2 px-4 text-muted-foreground tabular-nums">
                          {new Date(r.createdAt).toLocaleDateString("ar-EG", {
                            dateStyle: "medium",
                          })}
                        </td>
                        <td className="py-2 px-2 text-center align-middle">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <span className="sr-only">إجراءات</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rtl">
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link
                                  href={`/dashboard/referrals/${r.id}`}
                                  className={cn(
                                    "flex w-full items-center justify-end gap-2 text-foreground",
                                    "focus:text-foreground"
                                  )}
                                >
                                  تحليلات
                                  <BarChart3 className="h-4 w-4 shrink-0 opacity-70" />
                                </Link>
                              </DropdownMenuItem>
                              {canEditCookieExpiry && (
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center justify-end gap-2"
                                  onSelect={() => openEditCookie(r)}
                                >
                                  تعديل المدة
                                  <Pencil className="h-4 w-4 shrink-0 opacity-70" />
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hint below table */}
        {list.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            الرابط: أي صفحة + <code className="bg-muted px-1.5 py-0.5 rounded text-foreground/80">?ref=الرمز</code>
            {" — "}
            مثال: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground/80 dir-ltr" >{baseUrl}{localePrefix}/?ref=ahmed</code>
          </p>
        )}
      </div>

      {/* Add link dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-right">إضافة رابط تتبع</DialogTitle>
            <DialogDescription className="text-right">
              أنشئ رمز تتبع جديد. الرابط سيكون: أي صفحة + <code className="bg-muted px-1 rounded">?ref=الرمز</code>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4 py-2">
            <div className="space-y-2 text-right">
              <label className="text-sm font-medium text-foreground">
                رمز التتبع <span className="text-destructive">*</span>
              </label>
              <Input
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                className="h-10 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-2 text-right">
              <label className="text-sm font-medium text-foreground">
                الاسم (اختياري)
              </label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div className="space-y-3 text-right">
              <label className="text-sm font-medium text-foreground block">
                مدة صلاحية الكوكي
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {!cookieUnlimited && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={cookieExpiryDays}
                      onChange={(e) => setCookieExpiryDays(Math.max(1, parseInt(e.target.value, 10) || 30))}
                      className="h-10 w-24 text-sm"
                      dir="ltr"
                    />
                    <span className="text-sm text-muted-foreground">يوم</span>
                  </div>
                )}
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cookieUnlimited}
                    onChange={(e) => setCookieUnlimited(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm text-muted-foreground">غير محدود</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                المدة التي يبقى فيها رابط التتبع في جهاز الزائر. الافتراضي 30 يوم.
              </p>
            </div>
            <DialogFooter className="gap-2 flex-row-reverse">
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "إنشاء"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit cookie duration (only while edit window is open) */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingReferral(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-right">تعديل مدة صلاحية الكوكي</DialogTitle>
            <DialogDescription className="text-right">
              الرمز:{" "}
              <code className="bg-muted px-1 rounded font-mono">{editingReferral?.code}</code>
              <br />
              <span className="text-xs mt-2 block text-muted-foreground">
                تُحتسب نافذة التعديل من تاريخ إنشاء الرابط ولمدة مساوية لأيام الكوكي الحالية.
                الزوار الجدد يحصلون على كوكي بالمدة التي تحفظها هنا. الحد الأدنى للمدة هو عدد
                أيام الانقضاء منذ الإنشاء + 1 (حاليًا: {editMinCookieDays} يومًا).
              </span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCookieExpiry} className="grid gap-4 py-2">
            <div className="space-y-3 text-right">
              <label className="text-sm font-medium text-foreground block">
                مدة صلاحية الكوكي للزوار
              </label>
              <div className="flex flex-wrap items-center gap-3">
                {!editCookieUnlimited && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={editMinCookieDays}
                      max={3650}
                      value={editCookieExpiryDays}
                      onChange={(e) =>
                        setEditCookieExpiryDays(
                          Math.max(
                            editMinCookieDays,
                            parseInt(e.target.value, 10) || editMinCookieDays
                          )
                        )
                      }
                      className="h-10 w-24 text-sm"
                      dir="ltr"
                    />
                    <span className="text-sm text-muted-foreground">يوم</span>
                  </div>
                )}
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCookieUnlimited}
                    onChange={(e) => setEditCookieUnlimited(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm text-muted-foreground">غير محدود</span>
                </label>
              </div>
            </div>
            <DialogFooter className="gap-2 flex-row-reverse">
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setEditingReferral(null);
                }}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
