"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { PostCard } from "../../../_components/MainPostCard";
import { useLocale } from "next-intl"; // or use your i18n library

// Improved type definitions
interface Category {
  id: string;
  title: string;
  description: string;
  image?: string;
  posts: any[];
}

const MainPage: React.FC<CategoryProps> = ({ id }:{id:string}) => {
  const locale = useLocale(); // Get the current locale (ar or en)
  const [category, setCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get<any>(`/api/post-categories/${id}`, { params: { locale } });
        setCategory(response.data);
      } catch (err: unknown) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : "Failed to load content");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id, locale]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 text-xl mt-10">
        Error: {error}
      </div>
    );
  }

  if (!category) {
    return null;
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Hero Section */}
      <section
        className="relative bg-cover bg-center text-white py-24 overflow-hidden shadow-md"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${
            category.image || "/colorfulbg.webp"
          })`,
          backgroundBlendMode: "multiply",
        }}
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-y-12 md:gap-y-0">
            <div className="md:w-full text-center flex flex-col gap-y-6">
              <div className="flex flex-col gap-y-4">
                <h1 className="text-5xl font-extrabold tracking-tight leading-tight drop-shadow-lg">
                  {category.title}
                </h1>
                <blockquote className="text-xl border-b-4 border-sky-300 pb-4 max-w-3xl mx-auto">
                  {category.description}
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Posts Section */}
      <section className="bg-white py-10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {category.posts.map((blog) => (
              <PostCard key={blog.id} post={blog} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default MainPage;