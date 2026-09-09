'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import ReactCountryFlag from 'react-country-flag';
import { Loader2, Save, Search, Share2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PROJECT_LANGUAGES, type ProjectLocale } from '@/lib/campaign/project-language-config';
import type { ProjectSeoFields } from '@/lib/campaign/project-seo';

type SeoApiResponse = {
  campaignId: string;
  locale: ProjectLocale;
  defaultSeo: ProjectSeoFields;
  localeSeo: ProjectSeoFields;
  hasTranslation: boolean;
};

const emptySeo: ProjectSeoFields = {
  seoTitle: '',
  seoDescription: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
};

const safeValue = (value?: string | null) => value || '';

export function SeoPanel({ campaignId }: { campaignId: string }) {
  const [activeLocale, setActiveLocale] = useState<ProjectLocale>('ar');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasTranslation, setHasTranslation] = useState(true);
  const [fields, setFields] = useState<ProjectSeoFields>(emptySeo);

  const language = useMemo(
    () => PROJECT_LANGUAGES.find((item) => item.locale === activeLocale) || PROJECT_LANGUAGES[0],
    [activeLocale],
  );

  const fetchSeo = async (locale: ProjectLocale) => {
    setLoading(true);
    try {
      const response = await axios.get<SeoApiResponse>(`/api/campaigns/${campaignId}/seo`, {
        params: { locale },
      });
      setFields({
        seoTitle: safeValue(response.data.localeSeo.seoTitle),
        seoDescription: safeValue(response.data.localeSeo.seoDescription),
        ogTitle: safeValue(response.data.localeSeo.ogTitle),
        ogDescription: safeValue(response.data.localeSeo.ogDescription),
        ogImage: safeValue(response.data.localeSeo.ogImage),
      });
      setHasTranslation(response.data.hasTranslation);
    } catch (error) {
      console.error('SEO fetch error:', error);
      toast.error('فشل تحميل SEO لهذه اللغة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeo(activeLocale);
  }, [activeLocale, campaignId]);

  const updateField = (key: keyof ProjectSeoFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const saveSeo = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/campaigns/${campaignId}/seo`, {
        locale: activeLocale,
        fields,
      });
      toast.success('تم حفظ SEO بنجاح');
      await fetchSeo(activeLocale);
    } catch (error: any) {
      console.error('SEO save error:', error);
      const message = error?.response?.data?.error || 'فشل حفظ SEO';
      toast.error(message === 'Create the language translation before saving SEO for this locale'
        ? 'يجب إنشاء محتوى هذه اللغة أولًا قبل حفظ SEO لها'
        : message);
    } finally {
      setSaving(false);
    }
  };

  const googleTitle = safeValue(fields.seoTitle) || `عنوان ${language.labelAr}`;
  const googleDescription = safeValue(fields.seoDescription) || 'وصف مختصر يظهر في نتائج البحث لهذه اللغة.';
  const socialTitle = safeValue(fields.ogTitle) || safeValue(fields.seoTitle) || googleTitle;
  const socialDescription = safeValue(fields.ogDescription) || safeValue(fields.seoDescription) || googleDescription;
  const socialImage = safeValue(fields.ogImage);

  return (
    <Card className="space-y-5 p-5" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-brand" />
            <h3 className="text-lg font-semibold text-gray-900">5. SEO</h3>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            إعدادات SEO مستقلة لكل لغة، مع معاينة Google ومعاينة المشاركة الاجتماعية.
          </p>
        </div>
        <Button type="button" onClick={saveSeo} disabled={saving || loading || !hasTranslation} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ SEO
        </Button>
      </div>

      <Tabs value={activeLocale} onValueChange={(value) => setActiveLocale(value as ProjectLocale)}>
        <TabsList className="flex flex-wrap gap-1" dir="rtl">
          {PROJECT_LANGUAGES.map((item) => (
            <TabsTrigger key={item.locale} value={item.locale} className="gap-2">
              <ReactCountryFlag countryCode={item.countryCode} svg style={{ width: '1em', height: '1em' }} />
              {item.labelAr}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeLocale} className="mt-5 space-y-5">
          {!hasTranslation && activeLocale !== 'ar' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              هذه اللغة ليس لها محتوى محفوظ بعد. أضف عنوان ووصف هذه اللغة في صفحة تعديل المشروع، ثم احفظ SEO لها.
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              جار تحميل SEO...
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>SEO Title</Label>
                  <Input
                    value={safeValue(fields.seoTitle)}
                    onChange={(event) => updateField('seoTitle', event.target.value)}
                    placeholder="عنوان يظهر في Google"
                    maxLength={70}
                  />
                  <p className="text-xs text-gray-500">{safeValue(fields.seoTitle).length}/70</p>
                </div>

                <div className="grid gap-2">
                  <Label>SEO Description</Label>
                  <Textarea
                    value={safeValue(fields.seoDescription)}
                    onChange={(event) => updateField('seoDescription', event.target.value)}
                    placeholder="وصف مختصر لنتائج البحث"
                    maxLength={170}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500">{safeValue(fields.seoDescription).length}/170</p>
                </div>

                <div className="grid gap-2">
                  <Label>Open Graph Title</Label>
                  <Input
                    value={safeValue(fields.ogTitle)}
                    onChange={(event) => updateField('ogTitle', event.target.value)}
                    placeholder="عنوان المشاركة في واتساب وفيسبوك"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Open Graph Description</Label>
                  <Textarea
                    value={safeValue(fields.ogDescription)}
                    onChange={(event) => updateField('ogDescription', event.target.value)}
                    placeholder="وصف المشاركة الاجتماعية"
                    rows={3}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Open Graph Image</Label>
                  <Input
                    value={safeValue(fields.ogImage)}
                    onChange={(event) => updateField('ogImage', event.target.value)}
                    placeholder="رابط صورة المشاركة"
                    dir="ltr"
                    className="text-left"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4" dir="ltr">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700" dir="rtl">
                    <Search className="h-4 w-4" />
                    معاينة Google
                  </div>
                  <div className="text-xs text-green-700">minberiaksa.org › campaigns › ...</div>
                  <div className="mt-1 line-clamp-2 text-lg text-blue-700">{googleTitle}</div>
                  <div className="mt-1 line-clamp-3 text-sm text-gray-600">{googleDescription}</div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {socialImage ? (
                    <img src={socialImage} alt="Open Graph" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-gray-100 text-sm text-gray-500">
                      لا توجد صورة مشاركة مخصصة
                    </div>
                  )}
                  <div className="space-y-1 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Share2 className="h-4 w-4" />
                      معاينة المشاركة
                    </div>
                    <div className="line-clamp-2 font-semibold text-gray-900">{socialTitle}</div>
                    <div className="line-clamp-3 text-sm text-gray-600">{socialDescription}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
