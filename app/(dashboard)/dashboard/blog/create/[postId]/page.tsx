import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadBlogEditEditorData } from "@/lib/blog/admin-editor-data";
import LanguageTabs from "../_components/LanguageTabs";

export const revalidate = 0;

type PostWithRelations = Awaited<ReturnType<typeof loadBlogEditEditorData>>["post"];
type TranslationRow = {
  locale: string;
  title?: string | null;
  description?: string | null;
  content?: string | null;
  image?: string | null;
};

function getTranslations(post: PostWithRelations): TranslationRow[] {
  if (!post || !("translations" in post)) return [];
  const translations = (post as { translations?: TranslationRow[] }).translations;
  return Array.isArray(translations) ? translations : [];
}

export default async function PostEditorPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  const { post, categories, campaigns } = await loadBlogEditEditorData(postId);

  if (!post) return notFound();

  const translations = getTranslations(post);
  const trEn = translations.find((translation) => translation.locale === "en");
  const trFr = translations.find((translation) => translation.locale === "fr");

  const category = post.category
    ? { id: post.category.id, name: (post.category as { name?: string }).name ?? "" }
    : null;

  const editorPost = {
    id: post.id,
    slug: (post as { slug?: string | null }).slug ?? null,
    title: post.title ?? null,
    description: post.description ?? null,
    content: post.content ?? null,
    image: post.image ?? null,
    published: post.published,
    categoryId: post.categoryId ?? null,
    category_id: post.categoryId ?? undefined,
    campaignIds: Array.isArray((post as { campaignIds?: string[] }).campaignIds)
      ? (post as { campaignIds: string[] }).campaignIds
      : [],
    campaignId: null,
    campaign_id: undefined,
    category,
    titleAR: post.title ?? undefined,
    titleEN: trEn?.title ?? undefined,
    titleFR: trFr?.title ?? undefined,
    descriptionAR: post.description ?? undefined,
    descriptionEN: trEn?.description ?? undefined,
    descriptionFR: trFr?.description ?? undefined,
    contentAR: post.content ?? undefined,
    contentEN: trEn?.content ?? undefined,
    contentFR: trFr?.content ?? undefined,
    imageAR: post.image ?? undefined,
    imageEN: trEn?.image ?? undefined,
    imageFR: trFr?.image ?? undefined,
    translations: translations.map((translation) => ({
      locale: translation.locale,
      title: translation.title ?? null,
      description: translation.description ?? null,
      content: translation.content ?? null,
      image: translation.image ?? null,
    })),
  };

  const categoryOptions = categories.map((categoryOption) => ({
    label: categoryOption.name,
    value: categoryOption.id,
  }));
  const campaignOptions = campaigns.map((campaign) => ({
    label: campaign.title,
    value: campaign.id,
  }));

  return (
    <div className="container mx-auto">
      <Card className="w-full mx-auto shadow-lg">
        <CardHeader className="bg-gray-50 border-b border-gray-200 py-6 px-6">
          <CardTitle className="text-2xl font-bold text-gray-800">
            تحرير المقال
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <LanguageTabs
            post={editorPost}
            categories={categoryOptions}
            campaignOptions={campaignOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
