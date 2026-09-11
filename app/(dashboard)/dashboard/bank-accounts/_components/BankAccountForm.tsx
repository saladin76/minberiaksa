'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { AlertTriangle, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { ImageUploadField } from '../../_components/ImageUploadField';
import { LocaleChips } from '../../_components/LocaleChips';

/** Only the words translate; the identifiers live on the parent row alone. */
export const BANK_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'name', label: 'اسم البنك' },
  { name: 'branch', label: 'الفرع' },
  { name: 'holder', label: 'صاحب الحساب' },
];

export interface CurrencyRow {
  id?: string;
  code: string;
  accountNo: string;
  extNo: string;
  iban: string;
}

export interface BankAccountFormValues {
  slug: string;
  name: string;
  branch: string;
  swift: string;
  holder: string;
  logo: string;
  locales: string[];
  isActive: boolean;
  translations: TranslationMap;
  currencies: CurrencyRow[];
}

export function emptyBankAccount(): BankAccountFormValues {
  return {
    slug: '',
    name: '',
    branch: '',
    swift: '',
    holder: '',
    logo: '',
    locales: [],
    isActive: true,
    translations: emptyTranslations(BANK_TRANSLATION_FIELDS),
    currencies: [{ code: '', accountNo: '', extNo: '', iban: '' }],
  };
}

export function BankAccountForm({
  mode,
  accountId,
  initial,
}: {
  mode: 'create' | 'edit';
  accountId?: string;
  initial: BankAccountFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BankAccountFormValues>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof BankAccountFormValues>(key: K, v: BankAccountFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const updateCurrency = (i: number, patch: Partial<CurrencyRow>) =>
    set('currencies', values.currencies.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const usableCurrencies = values.currencies.filter(
    (c) => /^[A-Za-z]{3}$/.test(c.code.trim()) && (c.accountNo.trim() || c.extNo.trim() || c.iban.trim())
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return toast.error('اسم البنك بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');
    if (!values.holder.trim()) return toast.error('اسم صاحب الحساب مطلوب');
    if (usableCurrencies.length === 0) {
      return toast.error('أضف عملة واحدة على الأقل برقم حساب أو IBAN');
    }

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        name: values.name.trim(),
        branch: values.branch.trim(),
        swift: values.swift.trim(),
        holder: values.holder.trim(),
        logo: values.logo,
        locales: values.locales,
        isActive: values.isActive,
        translations: values.translations,
        currencies: values.currencies.map((c) => ({
          code: c.code.trim(),
          accountNo: c.accountNo.trim(),
          extNo: c.extNo.trim(),
          iban: c.iban.trim(),
        })),
      };

      if (mode === 'create') {
        await axios.post('/api/bank-accounts', payload);
        toast.success('تمت إضافة الحساب البنكي');
      } else {
        await axios.put(`/api/bank-accounts/${accountId}`, payload);
        toast.success('تم حفظ الحساب البنكي');
      }
      router.push('/dashboard/bank-accounts');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, mode === 'create' ? 'فشل في الإنشاء' : 'فشل في الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const translated = filledLocaleCount(values.translations, 'name');

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/bank-accounts')}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">
          {mode === 'create' ? 'حساب بنكي جديد' : 'تعديل الحساب البنكي'}
        </h1>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          ما يُدخل هنا يُنشر للمتبرعين كوجهة تحويل حقيقية. أدخل الأرقام من المستندات
          الرسمية فقط، وراجعها مرتين قبل التفعيل.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">اسم البنك (بالعربية) *</span>
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المعرّف (slug) *</span>
            <Input dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">صاحب الحساب (بالعربية) *</span>
            <Input value={values.holder} onChange={(e) => set('holder', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">الفرع</span>
            <Input value={values.branch} onChange={(e) => set('branch', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">SWIFT / BIC</span>
            <Input dir="ltr" placeholder="TVBATR2A" value={values.swift} onChange={(e) => set('swift', e.target.value)} />
          </label>
        </div>

        <ImageUploadField
          label="شعار البنك"
          value={values.logo}
          onChange={(url) => set('logo', url)}
          previewClass="w-32 h-16"
        />

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">اللغات التي يظهر فيها</span>
          <LocaleChips
            value={values.locales}
            onChange={(next) => set('locales', next)}
            hint="اتركها فارغة ليظهر لكل المتبرعين. حدّد لغات ليظهر لهم وحدهم — فالمتبرع التركي والخليجي لا يُعطيان نفس الـIBAN."
          />
        </div>

        <label className="flex items-center gap-2">
          <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <span className="text-sm">مفعّل</span>
        </label>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">العملات والحسابات</h2>
          <span className="text-xs text-slate-500">{usableCurrencies.length} عملة صالحة</span>
        </div>
        <p className="text-xs text-slate-500">
          لكل عملة رقمها وIBAN الخاص بها. يُحفظ الصف إن حمل رمز عملة صحيحًا (ثلاثة أحرف) وواحدًا على الأقل من الأرقام.
        </p>

        {values.currencies.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="rounded-lg border p-3 space-y-2 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">#{i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('currencies', values.currencies.filter((_, idx) => idx !== i))}
                disabled={values.currencies.length === 1}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">العملة *</span>
                <Input
                  dir="ltr"
                  placeholder="USD"
                  maxLength={3}
                  value={c.code}
                  onChange={(e) => updateCurrency(i, { code: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">رقم الحساب</span>
                <Input dir="ltr" value={c.accountNo} onChange={(e) => updateCurrency(i, { accountNo: e.target.value })} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600">الرقم الفرعي</span>
                <Input dir="ltr" value={c.extNo} onChange={(e) => updateCurrency(i, { extNo: e.target.value })} />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-slate-600">IBAN</span>
              <Input
                dir="ltr"
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={c.iban}
                onChange={(e) => updateCurrency(i, { iban: e.target.value })}
              />
            </label>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('currencies', [...values.currencies, { code: '', accountNo: '', extNo: '', iban: '' }])}
        >
          <Plus className="w-4 h-4 ml-1" />
          إضافة عملة
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={BANK_TRANSLATION_FIELDS}
          requiredField="name"
          value={values.translations}
          onChange={(next) => set('translations', next)}
        />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
          {mode === 'create' ? 'إضافة' : 'حفظ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/bank-accounts')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
