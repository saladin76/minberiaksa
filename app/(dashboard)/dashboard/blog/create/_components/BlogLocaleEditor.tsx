"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { toast } from "react-hot-toast";
import * as z from "zod";
import { Loader2 as SpinnerIcon, Upload, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import WysiwygEditor from "@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor";
import { defaultEditorContent } from "@/app/[locale]/blog/_components/wysiwyg/default-content";
import { SmartSeoAuditCard } from "../../../_components/SmartSeoAuditCard";
import { SaveStatusNotice, type SaveStatusState } from "../../../_components/SaveStatusNotice";

const schemaFor = (locale: string) =>
  locale === "en"
    ? z.object({
        title: z.string().min(1, "English title is required"),
        description: z.string().min(1, "English description is required"),
        image: z.string().optional(),
      })
    : z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
      });

const config = {
  save: "حفظ",
  cancel: "إلغاء",
  success: "تم تحديث الترجمة بنجاح",
  error: "فشل تحديث الترجمة",
  pleaseWait: "برجاء الانتظار ...",
  generalTitle: "محتوى الترجمة",
  generalDescription: "عدّل العنوان والوصف والمحتوى لهذه اللغة",
  titleLabel: "العنوان",
  descriptionLabel: "الوصف المختصر",
  imageLabel: "رابط الصورة",
};

type Locale = "en" | "fr" | "tr" | "id" | "pt" | "es" | "de";

interface BlogLocaleEditorProps {
  post: {
    id: string;
    translations?: Array<{
      locale: string;
      title?: string | null;
      description?: string | null;
      content?: string | null;
      image?: string | null;
    }>;
  };
  locale: Locale;
}

export default function BlogLocaleEditor({ post, locale }: BlogLocaleEditorProps) {
  const router = useRouter();
  const trans = post.translations?.find((t) => t.locale === locale);

  const [isSaving, setIsSaving] = useState(false);
  const [showLoadingAlert, setShowLoadingAlert] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatusState | null>(null);
  const [content, setContent] = useState<string | null>(trans?.content ?? null);

  const schema = schemaFor(locale);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: trans?.title ?? "",
      description: trans?.description ?? "",
      image: trans?.image ?? "",
    },
    mode: "onChange",
  });

  const watchedTitle = form.watch("title");
  const watchedDescription = form.watch("description");
  const watchedImage = form.watch("image");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("/api/upload", formData);
      form.setValue("image", response.data?.url ?? "");
      toast.success("تم رفع الصورة بنجاح");
    } catch (err) {
      console.error("Image upload error:", err);
      toast.error("فشل رفع الصورة");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    const current = form.getValues("image");
    if (current) {
      axios.delete(`/api/upload?publicId=${current.split("/").slice(-1)[0].split(".")[0]}`).catch(() => {});
    }
    form.setValue("image", "");
  };

  const isContentEmpty = (json: string | null) => {
    if (!json) return true;
    try {
      const doc = JSON.parse(json);
      if (!doc?.content?.length) return true;
      return doc.content.every(
        (n: { type: string; content?: unknown[] }) =>
          n.type === "paragraph" && (!n.content || n.content.length === 0)
      );
    } catch {
      return true;
    }
  };

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (locale === "en" && isContentEmpty(content)) {
      const message = "English content is required";
      setSaveStatus({ type: "error", message, detail: "لم يتم حفظ الترجمة" });
      toast.error(message);
      return;
    }
    setShowLoadingAlert(true);
    setIsSaving(true);
    setSaveStatus({ type: "saving", message: "جاري حفظ الترجمة...", detail: "سيتم تحديث هذه اللغة فقط" });
    try {
      await axios.patch(`/api/posts/${post.id}`, {
        translations: {
          [locale]: {
            title: data.title || undefined,
            description: data.description || undefined,
            content: content || undefined,
            image: data.image || undefined,
          },
        },
      });
      setSaveStatus({ type: "success", message: "تم تحديث الترجمة بنجاح", detail: "أنت ما زلت داخل صفحة التعديل" });
      toast.success(config.success);
      router.refresh();
    } catch (err: any) {
      console.error("Post translation update error:", err);
      const message = err?.response?.data?.error || config.error;
      setSaveStatus({ type: "error", message, detail: "راجع البيانات ثم حاول مرة أخرى" });
      toast.error(message);
    } finally {
      setIsSaving(false);
      setShowLoadingAlert(false);
    }
  };

  const onInvalid = () => {
    const message = "راجع الحقول المطلوبة قبل الحفظ";
    setSaveStatus({ type: "error", message, detail: "لم يتم إرسال البيانات للحفظ" });
    toast.error(message);
  };

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
            }
          }}
          className="space-y-6"
        >
          <div className="mb-2" dir="rtl">
            <SaveStatusNotice status={saveStatus} />
          </div>

          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>{config.generalTitle}</CardTitle>
              <CardDescription>{config.generalDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{config.titleLabel}{locale === "en" ? " *" : ""}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{config.descriptionLabel}{locale === "en" ? " *" : ""}</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Description" rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{config.imageLabel}</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {field.value ? (
                          <div className="relative group">
                            <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted">
                              <Image
                                src={field.value}
                                alt="Cover"
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 640px"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={removeImage}
                              className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                              id={`blog-locale-image-${locale}`}
                              disabled={uploadingImage}
                            />
                            <label
                              htmlFor={`blog-locale-image-${locale}`}
                              className={`flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors ${uploadingImage ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {uploadingImage ? (
                                <SpinnerIcon className="w-6 h-6 animate-spin text-brand" />
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="mt-2 text-sm text-gray-500">اضغط لرفع الصورة</span>
                                </>
                              )}
                            </label>
                          </>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      <span className="text-amber-700">
                        Recommended size: <strong>1200×675 px</strong> (16:9 ratio), JPG or PNG, max 2MB.
                      </span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <SmartSeoAuditCard
            key={`blog-seo-${locale}`}
            type="blog"
            locale={locale}
            title={watchedTitle}
            description={`${watchedDescription || ""}\n${content || ""}`}
            imageCount={watchedImage ? 1 : 0}
          />

          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>المحتوى</CardTitle>
              <CardDescription>محتوى المقال بهذه اللغة</CardDescription>
            </CardHeader>
            <CardContent>
              <WysiwygEditor
                defaultValue={(() => {
                  if (!content) return defaultEditorContent;
                  try {
                    return JSON.parse(content);
                  } catch {
                    return defaultEditorContent;
                  }
                })()}
                onDebouncedUpdate={(editor) => {
                  setContent(JSON.stringify(editor?.getJSON()));
                }}
              />
            </CardContent>
          </Card>

          <div className="inline-flex items-center gap-3">
            <Button
              type="submit"
              className="!bg-gray-900 px-10 !text-white hover:!bg-gray-800"
              disabled={isSaving}
            >
              {isSaving && <SpinnerIcon className="w-4 h-4 ml-2 animate-spin" />}
              {config.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSaving}
            >
              {config.cancel}
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={showLoadingAlert} onOpenChange={setShowLoadingAlert}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">{config.pleaseWait}</AlertDialogTitle>
            <AlertDialogDescription className="mx-auto text-center">
              <SpinnerIcon className="h-6 w-6 animate-spin" />
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
