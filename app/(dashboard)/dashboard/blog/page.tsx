"use client"

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
        title: "خطأ",
        description: "فشل تحميل المقالات. يرجى المحاولة مرة أخرى.",
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
        title: "تم الحذف",
        description: "تم حذف المقال بنجاح.",
      })
      setBlogs((prev) => prev.filter((b) => b.id !== id))
    } catch (error) {
      console.error("Error deleting post:", error)
      toast({
        title: "خطأ",
        description: "فشل حذف المقال. تأكد أنك مسجل كمسؤول.",
        variant: "destructive",
      })
      throw error
    }
  }, [])

  const columns = useMemo(
    () => getBlogColumns(handleDeletePost),
    [handleDeletePost]
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <BlogHealthCard />
      <ContentLocalizationAuditCard section="blog" />

      <Card className="p-8">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>إدارة المقالات</CardTitle>
            <DashboardLocaleSwitcher value={activeLocale} onChange={setActiveLocale} />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            createLink="/dashboard/blog/create"
            columns={columns}
            data={blogs}
            searchPlaceholder="ابحث في المقالات ..."
            createLabel="مقال جديد"
            noResultsLabel="لا يوجد مقال"
          />
        </CardContent>
      </Card>
    </div>
  )
}
