'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { ContentPicker, type ContentOption } from './ContentPicker';
import { BlocksEditor, emptyBlock, type BlockRow } from './BlocksEditor';

export const SUPER_CATEGORY_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'subtitle', label: 'العنوان الفرعي' },
  { name: 'intro', label: 'المقدمة', multiline: true },
  { name: 'verseTranslation', label: 'ترجمة معنى الآية', multiline: true },
  { name: 'verseAttribution', label: 'نسبة الترجمة' },
  { name: 'logoImage', label: 'شعار خاص بهذه اللغة (رابط)' },
  { name: 'ctaPrimaryLabel', label: 'زر أول' },
  { name: 'ctaSecondaryLabel', label: 'زر ثانٍ' },
  { name: 'ctaTertiaryLabel', label: 'زر ثالث' },
  { name: 'metaTitle', label: 'عنوان محركات البحث' },
  { name: 'metaDescription', label: 'وصف محركات البحث', multiline: true },
];

/** Kinds in the order the picker shows them, with their Arabic labels. */
export const ITEM_KINDS: ReadonlyArray<{ kind: string; label: string; hint: string }> = [
  { kind: 'CAMPAIGN', label: 'المشاريع', hint: 'تظهر كبطاقات تبرع في قسم «المشاريع المرتبطة».' },
  { kind: 'POST', label: 'المقالات', hint: 'مقالات المدونة المرتبطة بهذا القسم.' },
  { kind: 'VIDEO', label: 'الفيديوهات', hint: 'من مكتبة الفيديوهات (إنجازات، تزكيات، ميدان).' },
  { kind: 'PLAYLIST', label: 'البرامج والسلاسل', hint: 'قوائم التشغيل المرتبطة.' },
  { kind: 'COURSE', label: 'الدورات', hint: 'الدورات والندوات المرتبطة.' },
  { kind: 'REPORT', label: 'التقارير', hint: 'ملفات التقارير المنشورة.' },
  { kind: 'BOOKLET', label: 'الكتيبات', hint: 'كتيبات المؤسسة.' },
];

export type ItemsMap = Record<string, string[]>;

export interface SuperCategoryFormValues {
  slug: string;
  title: string;
  subtitle: string;
  intro: string;
  verseArabic: string;
  verseTranslation: string;
  verseAttribution: string;
  heroImage: string;
  logoImage: string;
  accentColor: string;
  heroVideoId: string;
  heroVideoLocales: string[];
  ctaPrimaryLabel: string;
  ctaPrimaryHref: string;
  ctaSecondaryLabel: string;
  ctaSecondaryHref: string;
  ctaTertiaryLabel: string;
  ctaTertiaryHref: string;
  metaTitle: string;
  metaDescription: string;
  isActive: boolean;
  translations: TranslationMap;
  items: ItemsMap;
  blocks: BlockRow[];
}

export function emptySuperCategory(): SuperCategoryFormValues {
  return {
    slug: '',
    title: '',
    subtitle: '',
    intro: '',
    verseArabic: '',
    verseTranslation: '',
    verseAttribution: '',
    heroImage: '',
    logoImage: '',
    accentColor: '#7C2318',
    heroVideoId: '',
    heroVideoLocales: [],
    ctaPrimaryLabel: '',
    ctaPrimaryHref: '',
    ctaSecondaryLabel: '',
    ctaSecondaryHref: '',
    ctaTertiaryLabel: '',
    ctaTertiaryHref: '',
    metaTitle: '',
    metaDescription: '',
    isActive: true,
    translations: emptyTranslations(SUPER_CATEGORY_TRANSLATION_FIELDS),
    items: Object.fromEntries(ITEM_KINDS.map((k) => [k.kind, [] as string[]])),
    blocks: [emptyBlock('CAMPAIGNS')],
  };
}

type OptionsMap = Record<string, ContentOption[]>;

export function SuperCategoryForm({
  mode,
  superCategoryId,
  initial,
}: {
  mode: 'create' | 'edit';
  superCategoryId?: string;
  initial: SuperCategoryFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SuperCategoryFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<OptionsMap>({});

  /* Everything this page can link, fetched once. The picker only stores ids, so
     without this it could not show a name for anything already chosen. */
  useEffect(() => {
    let live = true;
    axios
      .get('/api/super-categories/content-options')
      .then((res) => { if (live) setOptions(res.data ?? {}); })
      .catch((e) => { if (live) toast.error(errorMessage(e, 'تعذّر تحميل قوائم المحتوى')); });
    return () => { live = false; };
  }, []);

  const set = <K extends keyof SuperCategoryFormValues>(key: K, v: SuperCategoryFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error('العنوان بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');

    setSaving(true);
    try {
      const payload = {
        ...values,
        slug: values.slug.trim(),
        title: values.title.trim(),
        /* Posted whole; the API replaces both stored lists with exactly these. */
        items: values.items,
        blocks: values.blocks.map((b) => ({
          ...b,
          maxItems: b.maxItems.trim() ? Number(b.maxItems) : null,
        })),
      };

      if (mode === 'create') {
        await axios.post('/api/super-categories', payload);
        toast.success('تم إنشاء القسم الكبير');
      } else {
        await axios.put(`/api/super-categories/${superCategoryId}`, payload);
        toast.success('تم حفظ القسم الكبير');
      }
      router.push('/dashboard/super-categories');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, mode === 'create' ? 'فشل في الإنشاء' : 'فشل في الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const translated = filledLocaleCount(values.translations, 'title');
  const linkedTotal = Object.values(values.items).reduce((sum, ids) => sum + ids.length, 0);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/super-categories')}>
          <ArrowRight className="ml-1 h-4 w-4" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? 'قسم كبير جديد' : 'تعديل القسم الكبير'}</h1>
      </div>

      {/* ── Identity ─────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-bold">التعريف</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">العنوان (بالعربية) *</span>
            <Input value={values.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المعرّف (slug) *</span>
            <Input dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
            <span className="block text-[11px] text-slate-500">
              الصفحة تصبح على الرابط <span dir="ltr">/{'{lang}'}/المشاريع/{values.slug || 'slug'}</span>
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">العنوان الفرعي</span>
            <Input value={values.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">لون القسم</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(values.accentColor) ? values.accentColor : '#7C2318'}
                onChange={(e) => set('accentColor', e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input dir="ltr" value={values.accentColor} onChange={(e) => set('accentColor', e.target.value)} />
            </div>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">المقدمة (بالعربية)</span>
            <Textarea rows={3} value={values.intro} onChange={(e) => set('intro', e.target.value)} />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <span className="text-sm">منشور</span>
        </label>
      </Card>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-bold">الواجهة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ImageUploadField label="صورة الواجهة" value={values.heroImage} onChange={(url) => set('heroImage', url)} previewClass="w-48 h-28" />
          <ImageUploadField label="شعار المشروع" value={values.logoImage} onChange={(url) => set('logoImage', url)} previewClass="w-40 h-24" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">الآية (تُعرض بالعربية دائمًا)</span>
            <Textarea dir="rtl" rows={2} value={values.verseArabic} onChange={(e) => set('verseArabic', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">ترجمة معنى الآية (للعربية تُترك فارغة)</span>
            <Textarea rows={2} value={values.verseTranslation} onChange={(e) => set('verseTranslation', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">نسبة الترجمة</span>
            <Input value={values.verseAttribution} onChange={(e) => set('verseAttribution', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">فيديو الواجهة (رابط أو معرّف يوتيوب)</span>
            <Input dir="ltr" value={values.heroVideoId} onChange={(e) => set('heroVideoId', e.target.value)} />
          </label>
        </div>

        <LocaleChips
          value={values.heroVideoLocales}
          onChange={(next) => set('heroVideoLocales', next)}
          hint="اللغات التي يظهر فيها فيديو الواجهة. اتركها فارغة ليظهر في كل اللغات — وحدّدها إذا كان التسجيل بلغة واحدة بلا ترجمة."
        />

        <div className="grid gap-4 md:grid-cols-2">
          {([
            ['ctaPrimaryLabel', 'ctaPrimaryHref', 'الزر الأول'],
            ['ctaSecondaryLabel', 'ctaSecondaryHref', 'الزر الثاني'],
            ['ctaTertiaryLabel', 'ctaTertiaryHref', 'الزر الثالث'],
          ] as const).map(([labelKey, hrefKey, title]) => (
            <div key={labelKey} className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">{title} — النص</span>
                <Input value={values[labelKey]} onChange={(e) => set(labelKey, e.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">الوجهة</span>
                <Input dir="ltr" placeholder="#bundle" value={values[hrefKey]} onChange={(e) => set(hrefKey, e.target.value)} />
              </label>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          الوجهة يمكن أن تكون ارتساءً داخل الصفحة مثل <span dir="ltr">#bundle</span> — وهو مُعرّف الارتساء المكتوب في القسم — أو رابطًا كاملًا.
        </p>
      </Card>

      {/* ── Linked content ───────────────────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">المحتوى المرتبط</h2>
          <span className="text-xs text-slate-500">{linkedTotal} عنصر</span>
        </div>
        <p className="text-xs text-slate-500">
          اختر المحتوى الذي يخص هذا القسم. ما يظهر منه على الصفحة — وبأي ترتيب بين الأقسام — تحدده أقسام الصفحة بالأسفل.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {ITEM_KINDS.map(({ kind, label, hint }) => (
            <ContentPicker
              key={kind}
              label={label}
              description={hint}
              options={options[kind] ?? []}
              value={values.items[kind] ?? []}
              onChange={(next) => set('items', { ...values.items, [kind]: next })}
            />
          ))}
        </div>
      </Card>

      {/* ── Page sections ────────────────────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">أقسام الصفحة</h2>
          <span className="text-xs text-slate-500">{values.blocks.length} قسم</span>
        </div>
        <p className="text-xs text-slate-500">
          تُعرض بالترتيب الظاهر هنا، أسفل الواجهة مباشرة.
        </p>
        <BlocksEditor
          rows={values.blocks}
          onChange={(next) => set('blocks', next)}
          playlists={options.PLAYLIST ?? []}
        />
      </Card>

      {/* ── SEO ──────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-bold">محركات البحث</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">عنوان الصفحة</span>
            <Input value={values.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">وصف الصفحة</span>
            <Textarea rows={2} value={values.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">يُستخدم العنوان والمقدمة تلقائيًا عند ترك هذين الحقلين فارغين.</p>
      </Card>

      {/* ── Translations ─────────────────────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={SUPER_CATEGORY_TRANSLATION_FIELDS}
          requiredField="title"
          value={values.translations}
          onChange={(next) => set('translations', next)}
        />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          {mode === 'create' ? 'إنشاء' : 'حفظ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/super-categories')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
