"use client";

import ReactCountryFlag from "react-country-flag";
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

  const localeTabs = [
    { value: "ar", label: <><ReactCountryFlag countryCode="SA" svg style={{ width: '1.2em', height: '1.2em' }} /> العربية</>, required: true },
    { value: "en", label: <><ReactCountryFlag countryCode="GB" svg style={{ width: '1.2em', height: '1.2em' }} /> English</>, required: true, has: hasLocale("en") },
    { value: "fr", label: <><ReactCountryFlag countryCode="FR" svg style={{ width: '1.2em', height: '1.2em' }} /> Français</>, has: hasLocale("fr") },
    { value: "tr", label: <><ReactCountryFlag countryCode="TR" svg style={{ width: '1.2em', height: '1.2em' }} /> Türkçe</>, has: hasLocale("tr") },
    { value: "id", label: <><ReactCountryFlag countryCode="ID" svg style={{ width: '1.2em', height: '1.2em' }} /> Bahasa</>, has: hasLocale("id") },
    { value: "pt", label: <><ReactCountryFlag countryCode="PT" svg style={{ width: '1.2em', height: '1.2em' }} /> Português</>, has: hasLocale("pt") },
    { value: "es", label: <><ReactCountryFlag countryCode="ES" svg style={{ width: '1.2em', height: '1.2em' }} /> Español</>, has: hasLocale("es") },
    { value: "de", label: <><ReactCountryFlag countryCode="DE" svg style={{ width: '1.2em', height: '1.2em' }} /> Deutsch</>, has: hasLocale("de") },
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

      {(["en", "fr", "tr", "id", "pt", "es", "de"] as const).map((loc) => (
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
