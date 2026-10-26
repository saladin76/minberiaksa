"use client"

import { TranslationOverview } from "@/components/dashboard/content-editor/TranslationOverview";
import { useState, useEffect, useMemo, useCallback } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { DataTable } from "../_components/data-table"
import { getBlogColumns, type BlogRow } from "../_components/blogColumns"
import { DashboardLocaleSwitcher } from "../_components/DashboardLocaleSwitcher"
import { useLocale } from "next-intl"
import { ContentLocalizationAuditCard } from "../_components/ContentLocalizationAuditCard"
import { BlogHealthCard } from "./_components/BlogHealthCard"
import { BookOpenCheck, CheckCircle2, FileEdit, FolderOpen } from "lucide-react"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { ContentMetricStrip } from "@/components/dashboard/content-editor/ContentMetricStrip"
import { dt } from "@/lib/dashboard/i18n";

export default function BooksManagement() {
  const locale = useLocale() as string
  const [blogs, setBlogs] = useState<BlogRow[]>([])
  const [activeLocale, setActiveLocale] = useState<string>(locale || "ar")

  const fetchPosts = async (lang: string) => {
    try {
      const response = await axios.get("/api/posts", {
        params: { locale: lang, limit: 500 },
      })
      const items = response.data?.items ?? response.data ?? []
      setBlogs(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error("Error fetching posts:", error)
      toast({
        title: dt("خطأ"),
        description: dt("فشل تحميل المقالات. يرجى المحاولة مرة أخرى."),
        variant: "destructive",
      })
    }
  }

  useEffect(() => {
    fetchPosts(activeLocale)
  }, [activeLocale])

  const handleDeletePost = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/posts/${id}`)
      toast({
        title: dt("تم الحذف"),
        description: dt("تم حذف المقال بنجاح."),
      })
      setBlogs((prev) => prev.filter((b) => b.id !== id))
    } catch (error) {
      console.error("Error deleting post:", error)
      toast({
        title: dt("خطأ"),
        description: dt("فشل حذف المقال. تأكد أنك مسجل كمسؤول."),
        variant: "destructive",
      })
      throw error
    }
  }, [])

  const columns = useMemo(
    () => getBlogColumns(handleDeletePost),
    [handleDeletePost]
  )

  const publishedCount = blogs.filter((post) => post.published).length
  const categoryCount = new Set(blogs.map((post) => post.category?.id).filter(Boolean)).size

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={dt("استوديو المحتوى")}
        title={dt("المقالات")}
        description={dt("راجع المقالات المنشورة والمسودات، وحدّث المحتوى والترجمات من مكان واحد.")}
        icon={BookOpenCheck}
        actions={<DashboardLocaleSwitcher value={activeLocale} onChange={setActiveLocale} />}
      />
      <ContentMetricStrip items={[
        { label: dt("كل المقالات"), value: blogs.length, detail: dt("في اللغة المحددة"), icon: BookOpenCheck, tone: "brand" },
        { label: dt("منشورة"), value: publishedCount, detail: dt("مرئية للزوار"), icon: CheckCircle2, tone: "green" },
        { label: dt("مسودات"), value: blogs.length - publishedCount, detail: dt("تحتاج مراجعة أو نشرًا"), icon: FileEdit, tone: "amber" },
        { label: dt("تصنيفات مستخدمة"), value: categoryCount, detail: dt("في المقالات المعروضة"), icon: FolderOpen, tone: "slate" },
      ]} />
      <TranslationOverview kind="blog">
          <ContentLocalizationAuditCard section="blog" />
          <BlogHealthCard />
        </TranslationOverview>
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>{dt("مكتبة المقالات")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{dt("ابحث، رتّب، وافتح المقال للتحرير أو المعاينة.")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            createLink="/dashboard/blog/create"
            columns={columns}
            data={blogs}
            searchPlaceholder={dt("ابحث في المقالات ...")}
            createLabel={dt("مقال جديد")}
            noResultsLabel={dt("لا يوجد مقال")}
          />
        </CardContent>
      </Card>
    </div>
  )
}
