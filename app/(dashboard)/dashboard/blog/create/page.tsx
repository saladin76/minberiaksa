import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadBlogCreateEditorData } from "@/lib/blog/admin-editor-data";
import LanguageTabs from "./_components/LanguageTabs";

export const revalidate = 0;

const emptyEditorPost = {
  id: "new",
  title: null,
  description: null,
  content: null,
  image: null,
  published: false,
  categoryId: null,
  category_id: undefined,
  category: null,
  campaignIds: [],
  campaignId: null,
  campaign_id: undefined,
  titleAR: undefined,
  titleEN: undefined,
  titleFR: undefined,
  descriptionAR: undefined,
  descriptionEN: undefined,
  descriptionFR: undefined,
  contentAR: undefined,
  contentEN: undefined,
  contentFR: undefined,
  imageAR: undefined,
  imageEN: undefined,
  imageFR: undefined,
  translations: [],
};

export default async function CreateBlogPage() {
  const { categories, campaigns } = await loadBlogCreateEditorData();

  const categoryOptions = categories.map((category) => ({
    label: category.name,
    value: category.id,
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
            إنشاء مقال
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <LanguageTabs
            post={emptyEditorPost}
            categories={categoryOptions}
            campaignOptions={campaignOptions}
            mode="create"
          />
        </CardContent>
      </Card>
    </div>
  );
}
