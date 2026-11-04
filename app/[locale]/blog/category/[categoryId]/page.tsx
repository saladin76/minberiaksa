import axios from "axios";
import type { Metadata } from "next";
import MainPage from "./_components/MainPage";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { buildPageMetadata, SITE_URL } from "@/lib/seo";


/**
 * The category shape this page reads off /api/post-categories/[id]. It used to be a bare `Category`
 * with no declaration anywhere  a leftover of a deleted global types module  so the response was
 * untyped and the two `category.title` reads below were unchecked.
 */
interface Category {
  id: string;
  title: string;
  description: string;
  image?: string;
  slug?: string | null;
}

interface CategoryProps {
  params: Promise<{
    locale: string;
    categoryId: string;
  }>;
}

// Generate metadata for the category page
export async function generateMetadata({ params }: CategoryProps): Promise<Metadata> {
  const { locale, categoryId } = await params;
  const fetchCategoryData = async (): Promise<Category> => {
    try {
      const baseUrl = await getServerBaseUrl();
      const response = await axios.get(
        `${baseUrl}/api/post-categories/${encodeURIComponent(categoryId)}`,
        { params: { locale } }
      );
      return response.data;
    } catch (error) {
      console.error("Failed to fetch category data:", error);
      throw new Error("Failed to fetch category data");
    }
  };

  const category = await fetchCategoryData();

  const path = `/blog/category/${encodeURIComponent(category.slug || categoryId)}`;
  const canonical = `${SITE_URL}/${locale}${path}`;
  return buildPageMetadata(locale, {
    title: category.title,
    description: category.description,
    path,
    image: category.image || "/default-category-bg.jpg",
    imageAlt: category.title,
    // Only the current translation's slug is available from this endpoint.
    alternates: { canonical, languages: { [locale]: canonical } },
  });
}

export default async function PostCategoryPage({ params }: CategoryProps) {
  const { categoryId } = await params;
  return <MainPage id={categoryId} />;
}
