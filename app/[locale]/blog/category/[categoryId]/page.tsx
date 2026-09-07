import axios from "axios";
import { Metadata } from "next";
import MainPage from "./_components/MainPage";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { SITE_URL } from "@/lib/seo";


interface CategoryProps {
  params: {
    locale: string;
    categoryId: string;
  };
}

// Generate metadata for the category page
export async function generateMetadata({ params }: CategoryProps): Promise<Metadata> {
  const fetchCategoryData = async (): Promise<Category> => {
    try {
      const baseUrl = await getServerBaseUrl();
      const locale = params.locale || 'ar';
      const response = await axios.get(
        `${baseUrl}/api/post-categories/${params.categoryId}`,
        { params: { locale } }
      );
      return response.data;
    } catch (error) {
      console.error("Failed to fetch category data:", error);
      throw new Error("Failed to fetch category data");
    }
  };

  const category = await fetchCategoryData();

  return {
    title: `${category.title} - يدي جيهان`,
    description: category.description,
    openGraph: {
      title: `${category.title} - يدي جيهان`,
      description: category.description,
      images: [
        {
          url: category.image || "/default-category-bg.jpg",
          width: 1200,
          height: 630,
          alt: category.title,
        },
      ],
      url: `${SITE_URL}/${params.locale || "ar"}/blog/category/${(category as any)?.slug || params.categoryId}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${category.title} - يدي جيهان`,
      description: category.description,
      images: [category.image || "/default-category-bg.jpg"],
    },
    alternates: {
      canonical: `${SITE_URL}/${params.locale || "ar"}/blog/category/${(category as any)?.slug || params.categoryId}`,
    },
  };
}

export default function PostCategoryPage({ params }: CategoryProps) {
  return <MainPage id={params.categoryId} />;
}