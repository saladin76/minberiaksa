"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "@/i18n/routing";
import { toast } from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Share2, ChevronUp } from "lucide-react";
import { ar } from "date-fns/locale";
import { useLocale } from "next-intl";

import { Post as PrismaPost, Category as PrismaCategory } from "@prisma/client";

import { defaultEditorContent } from "../../_components/wysiwyg/default-content";
import WysiwygEditor from "../../_components/wysiwyg/wysiwyg-editor";

interface ExtendedPost extends PrismaPost {
  category_name: string;
  category?: Partial<PrismaCategory> | null;
}

interface BlogPostProps {
  params: {
    postId: string;
  };
}

const MainPage: React.FC<BlogPostProps> = ({ id }: { id: string }) => {
  const locale = useLocale(); // Get the current locale (ar or en)
  const [loading, setLoading] = useState<boolean>(true);
  const [post, setPost] = useState<ExtendedPost | null>(null);
  const [similarPosts, setSimilarPosts] = useState<ExtendedPost[]>([]);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  const router = useRouter();

  // Fetch post data
  const fetchPostData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/posts/${id}`, { params: { locale } });
      console.log(response.data);
      setPost(response.data.post);
      setSimilarPosts(response.data.similarPosts);
    } catch (error) {
      router.push("/404");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPostData();
  }, [id, locale, router]);

  // Scroll progress tracking
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      const progress = (window.scrollY / totalHeight) * 100;
      setScrollProgress(progress);
      setShowScrollTop(window.scrollY > 300);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll to top functionality
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Share functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: post?.title || "",
          text: post?.description || "",
          url: window.location.href,
        })
        .catch(console.error);
    } else {
      // Fallback for browsers that don't support Web Share API
      navigator.clipboard.writeText(window.location.href).then(() => {
        toast.success("Link copied to clipboard");
      });
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>{locale === "ar" ? "برجاء الانتظار" : "Please wait..."}</p>
      </div>
    );
  }

  // Additional null check for post
  if (!post) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 relative pt-24">
      {/* Scroll Progress Bar */}
      <Progress
        value={scrollProgress}
        className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent"
      />

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <Button
          className="fixed bottom-4 right-4 rounded-full p-2 bg-primary text-primary-foreground shadow-lg transition-opacity duration-300"
          onClick={scrollToTop}
        >
          <ChevronUp className="h-6 w-6" />
        </Button>
      )}

      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {post.category?.name || "Uncategorized"}
                  </Badge>
                  <div className="text-sm text-gray-500">
                    {post.createdAt
                      ? formatDistanceToNow(post.createdAt, {
                          addSuffix: true,
                          locale: locale === "ar" ? ar : undefined, // Use Arabic locale if lang is ar
                        })
                      : ""}
                  </div>
                </div>
                <CardTitle className="text-3xl font-bold">
                  {post.title}
                </CardTitle>
              </CardHeader>
              {post.image && (
                <Image
                  src={post.image}
                  alt={post.title || "Post Image"}
                  width={800}
                  height={400}
                  className="w-full object-cover"
                />
              )}
              <CardContent className="prose max-w-none p-6">
                {post.description && <p className="lead">{post.description}</p>}
                <Separator className="my-6" />
                {post.content && (
                  <WysiwygEditor
                    defaultValue={
                      post.content
                        ? JSON.parse(post.content)
                        : defaultEditorContent
                    }
                    onDebouncedUpdate={(editor) => {
                      console.log("لا اله الا الله");
                    }}
                    isEditable={false}
                  />
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={handleShare}>
                  <Share2 className="mx-2 h-4 w-4" />
                  {locale === "ar" ? "شارك المقال" : "Share Post"}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Similar Posts Section */}
          {similarPosts.length > 0 && (
            <div>
              <Card className="sticky top-[5.5rem]">
                <CardHeader>
                  <CardTitle>
                    {locale === "ar" ? "مقالات مشابهة" : "Similar Posts"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {similarPosts.map((similarPost) => (
                      <Link
                        key={similarPost.id}
                        href={`/blog/${(similarPost as any).slug || similarPost.id}`}
                        className="block"
                      >
                        <div className="group relative overflow-hidden rounded-lg">
                          {similarPost.image && (
                            <Image
                              src={similarPost.image}
                              alt={similarPost.title || "Post Image"}
                              width={200}
                              height={100}
                              className="w-full transition-transform duration-300 ease-in-out group-hover:scale-105"
                            />
                          )}
                          <div className="absolute inset-0 bg-black bg-opacity-40 transition-opacity duration-300 ease-in-out group-hover:bg-opacity-50" />
                          <div className="absolute inset-0 flex items-center justify-center p-4">
                            <h3 className="text-center text-sm font-medium text-white">
                              {similarPost.title}
                            </h3>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainPage;
