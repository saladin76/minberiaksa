"use client";

import { useId, useState } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserProfileCardData } from "@/lib/dashboard/user-profile-card";
import { normalizeGender } from "@/lib/dashboard/user-demographics";
import { LOCALE_LABELS } from "@/lib/locales";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import { useDashboardUnsavedChanges } from "@/hooks/useDashboardUnsavedChanges";

export function DonorProfileEditor({ user, canEditEmail, onClose, onSaved }: {
  user: UserProfileCardData; canEditEmail: boolean; onClose: () => void; onSaved: () => void;
}) {
  const formId = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: user.name ?? "", email: user.email ?? "", phone: user.phone ?? "",
    countryCode: user.countryCode ?? "", countryName: user.countryName ?? user.country ?? "",
    region: user.region ?? "", city: user.city ?? "", birthdate: user.birthdate ?? "",
    gender: normalizeGender(user.gender) ?? "", preferredLang: user.preferredLang ?? "",
  });
  useDashboardUnsavedChanges(saving || draft.name !== (user.name ?? "") || draft.email !== (user.email ?? "") || draft.phone !== (user.phone ?? "") || draft.countryCode !== (user.countryCode ?? "") || draft.countryName !== (user.countryName ?? user.country ?? "") || draft.region !== (user.region ?? "") || draft.city !== (user.city ?? "") || draft.birthdate !== (user.birthdate ?? "") || draft.gender !== (normalizeGender(user.gender) ?? "") || draft.preferredLang !== (user.preferredLang ?? ""));
  const update = (key: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const { email, ...fields } = draft;
      const response = await fetch(`/api/dashboard/donors/${user.id}/profile`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, countryCode: draft.countryCode.trim() || null,
          ...(canEditEmail && email.trim() ? { email } : {}), updatedAt: user.updatedAt }),
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error === "PROFILE_CONFLICT" ? dt("تغيرت البيانات. أغلق النافذة وحدّث القائمة ثم حاول مجددًا.")
          : data.error === "EMAIL_EXISTS" ? dt("البريد الإلكتروني مستخدم بالفعل") : dt("تعذّر حفظ البيانات. راجع الحقول وحاول مجددًا.");
        setError(message); return;
      }
      toast.success(dt("تم تحديث بيانات المتبرع")); onSaved(); onClose();
    } catch { setError(dt("تعذّر حفظ البيانات. راجع الحقول وحاول مجددًا.")); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent dir={dashDir()} className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <DialogHeader className="shrink-0 sm:text-start"><DialogTitle>{dt("تعديل بيانات المتبرع")}</DialogTitle>
        <DialogDescription>{user.name ?? user.email}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="min-h-0 overflow-y-auto pe-1">
        <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            ["name", dt("الاسم"), "text"], ["email", dt("البريد الإلكتروني"), "email"],
            ["phone", dt("رقم الهاتف"), "tel"], ["countryCode", dt("رمز الدولة"), "text"],
            ["countryName", dt("الدولة"), "text"], ["region", dt("المنطقة"), "text"],
            ["city", dt("المدينة"), "text"], ["birthdate", dt("تاريخ الميلاد"), "date"],
          ] as const).map(([key, label, type]) => <label key={key} className="space-y-1 text-sm">
            <span>{label}</span><Input name={key} type={type} value={draft[key]} onChange={event => update(key, event.target.value)}
              required={key === "name"} maxLength={key === "countryCode" ? 2 : key === "name" ? 160 : key === "email" ? 254 : undefined}
              disabled={key === "email" && !canEditEmail} dir={["email", "phone", "countryCode", "birthdate"].includes(key) ? "ltr" : undefined} />
          </label>)}
          <div className="space-y-1 text-sm"><label htmlFor={`${formId}-gender`}>{dt("الجنس")}</label><select id={`${formId}-gender`} name="gender" className="h-10 w-full rounded-md border bg-background px-3" value={draft.gender} onChange={event => update("gender", event.target.value)}>
            <option value="">{dt("غير محدد")}</option><option value="male">{dt("ذكر")}</option><option value="female">{dt("أنثى")}</option>
          </select></div>
          <div className="space-y-1 text-sm"><label htmlFor={`${formId}-preferredLang`}>{dt("اللغة المفضلة")}</label><select id={`${formId}-preferredLang`} name="preferredLang" className="h-10 w-full rounded-md border bg-background px-3" value={draft.preferredLang} onChange={event => update("preferredLang", event.target.value)}>
            <option value="">{dt("غير محدد")}</option>{Object.entries(LOCALE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select></div>
        </fieldset>
        </div>
        {error && <p role="alert" className="shrink-0 text-sm text-rose-700">{error}</p>}
        <div className="flex shrink-0 justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>{dt("إلغاء")}</Button>
          <Button type="submit" disabled={saving}>{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{dt("حفظ")}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
