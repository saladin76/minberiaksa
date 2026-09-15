"use client";

import ReactCountryFlag from "react-country-flag";
import { TRANSLATION_LOCALES, localeFlag, localeNativeLabel } from "../../../_components/locale-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2 } from "lucide-react";
import BlogEditor from "@/app/[locale]/blog/_components/BlogEditor";
import BlogLocaleEditor from "./BlogLocaleEditor";
import BlogLocaleBufferEditor from "./BlogLocaleBufferEditor";
import { CreateTranslationsProvider } from "./CreateTranslationsContext";

interface LanguageTabsProps {
  post: {
    id: string;
    title?: string | null;
    description?: string | null;
    content?: string | null;
    image?: string | null;
    categoryId?: string | null;
    category_id?: string;
    category?: { id: string; name: string } | null;
    campaignIds?: string[];
    campaignId?: string | null;
    campaign_id?: string;
    translations?: Array<{
      locale: string;
      title?: string | null;
      description?: string | null;
      content?: string | null;
      image?: string | null;
    }>;
    titleAR?: string;
    titleEN?: string;
    titleFR?: string;
    descriptionAR?: string;
    descriptionEN?: string;
    descriptionFR?: string;
    contentAR?: string | null;
    contentEN?: string | null;
    contentFR?: string | null;
    imageAR?: string;
    imageEN?: string;
    imageFR?: string;
  };
  categories: { label: string; value: string }[];
  campaignOptions?: { label: string; value: string }[];
  mode?: "create" | "edit";
}

export default function LanguageTabs({ post, categories, campaignOptions = [], mode = "edit" }: LanguageTabsProps) {
  const isCreate = mode === "create" || post.id === "new";

  const translationFor = (code: string) => post.translations?.find((t) => t.locale === code);
  const hasLocale = (code: string) => {
    const t = translationFor(code);
    return Boolean(t && (t.title || t.description || t.content));
  };
  const localeRevisionKey = (code: string) => {
    const t = translationFor(code);
    return [post.id, code, t?.title || "", t?.description || "", t?.content || "", t?.image || ""].join(":");
  };

  const flag = (code: string) => <ReactCountryFlag countryCode={localeFlag(code)} svg style={{ width: '1.2em', height: '1.2em' }} />;
  const localeTabs = [
    { value: "ar", label: <>{flag("ar")} العربية</>, required: true, has: false },
    ...TRANSLATION_LOCALES.map((code) => ({
      value: code,
      label: <>{flag(code)} {localeNativeLabel(code)}</>,
      required: code === "en",
      has: hasLocale(code),
    })),
  ];

  const tabsTree = (
    <Tabs defaultValue="ar" className="w-full">
      <TabsList className="flex flex-wrap gap-1 mb-6" dir="rtl">
        {localeTabs.map(({ value, label, required, has }) => (
          <TabsTrigger key={value} value={value} className="gap-2 px-4">
            {label}
            {required && <span className="text-xs text-red-600">*</span>}
            {has && <CheckCircle2 className="w-3 h-3 text-green-600" />}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="ar" className="mt-0">
        <BlogEditor
          key={`blog-ar-${post.id}-${post.title || ""}-${post.description || ""}-${post.content || ""}`}
          post={post}
          categories={categories}
          campaignOptions={campaignOptions}
          userId={undefined}
          redirectAfterCreate={"/blog"}
          isCreate={isCreate}
        />
      </TabsContent>

      {TRANSLATION_LOCALES.map((loc) => (
        <TabsContent key={loc} value={loc} className="mt-0">
          {isCreate ? (
            <BlogLocaleBufferEditor key={`buffer-${loc}`} locale={loc} />
          ) : (
            <BlogLocaleEditor key={localeRevisionKey(loc)} post={post} locale={loc} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );

  if (isCreate) return <CreateTranslationsProvider>{tabsTree}</CreateTranslationsProvider>;
  return tabsTree;
}
