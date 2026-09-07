"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { toast } from "react-hot-toast";
import * as z from "zod";

import { Check, ChevronsUpDown, Loader2, Upload, X } from "lucide-react";
import Image from "next/image";

// UI Components
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

// Custom components and config
import WysiwygEditor from "./wysiwyg/wysiwyg-editor";
import { defaultEditorContent } from "./wysiwyg/default-content";
import { useCreateTranslations } from "@/app/(dashboard)/dashboard/blog/create/_components/CreateTranslationsContext";
import { SmartSeoAuditCard } from "@/app/(dashboard)/dashboard/_components/SmartSeoAuditCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const postEditFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  image: z.string().optional(),
  categoryId: z.string().optional(),
  campaignIds: z.tuple([z.string().optional(), z.string().optional(), z.string().optional()]),
});

const protectedEditorConfig = {
  generalTitle: "المعلومات العامة",
  generalDescription: "قدم التفاصيل الأساسية لمقالك",
  formTitle: "العنوان",
  placeHolderTitle: "أدخل عنوان المقال",
  categoryTitle: "التصنيف",
  categoryDescription: "اختر تصنيفاً لمقالك",
  campaignTitle: "الحملات ذات الصلة",
  campaignDescription: "اختر حتى 3 حملات إذا كان المقال يتحدث عنها (اختياري)",
  campaignSlotLabel: (n) => `حملة ${n}`,
  campaignSearchPlaceholder: "بحث عن حملة...",
  campaignEmpty: "لا توجد حملة",
  coverImageTitle: "الصورة الرئيسية",
  placeholderDescription: "أدخل وصف المقال",
  shortDescriptionTitle: "الوصف القصير",
  submit: "حفظ",
  delete: "مسح",
  cancel: "إلغاء",
  successMessage: "تم تحديث المقال بنجاح",
  errorMessage: "فشل تحديث المقال",
  successMessageImageUpload: "تم رفع الصورة بنجاح",
  errorMessageImageUpload: "فشل رفع الصورة",
  placeholderContent: "أدخل محتوى المقال",
};

const protectedPostConfig = {
  pleaseWait: "برجاء الانتظار ...",
};

const BlogEditor = ({ post, categories, campaignOptions = [], redirectAfterCreate, isCreate: isCreateProp }) => {
  const router = useRouter();
  const isCreate = isCreateProp || !post?.id || post.id === "new";
  const createTranslationsCtx = useCreateTranslations();

  const [isSaving, setIsSaving] = useState(false);
  const [showLoadingAlert, setShowLoadingAlert] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [contentAR, setContentAR] = useState(post?.contentAR || null);

  const NO_CAMPAIGN_VALUE = "__none__";
  const padCampaignIds = () => {
    const raw = Array.isArray(post?.campaignIds) && post.campaignIds.length
      ? post.campaignIds.filter(Boolean).slice(0, 3)
      : post?.campaign_id || post?.campaignId
        ? [post.campaign_id || post.campaignId]
        : [];
    const padded = [...raw];
    while (padded.length < 3) padded.push(NO_CAMPAIGN_VALUE);
    return padded.slice(0, 3);
  };

  const defaultValues = {
    title: post?.titleAR || post?.title || "",
    description: post?.descriptionAR || post?.description || "",
    image: post?.imageAR || post?.image || "",
    categoryId: post?.category_id || post?.categoryId || "",
    campaignIds: padCampaignIds(),
  };

  const form = useForm({
    resolver: zodResolver(postEditFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const watchedTitle = form.watch("title");
  const watchedDescription = form.watch("description");
  const watchedImage = form.watch("image");

  const onSubmit = async (data) => {
    setShowLoadingAlert(true);
    setIsSaving(true);
    const toastId = toast.loading(isCreate ? "جاري إنشاء المقال..." : "جاري حفظ تحديثات المقال...");

    try {
      const buffered = isCreate && createTranslationsCtx ? createTranslationsCtx.translations : {};
      const translationsPayload = {};
      for (const [loc, t] of Object.entries(buffered)) {
        if (!t) continue;
        const title = (t.title || "").trim();
        const description = (t.description || "").trim();
        const content = t.content || "";
        const image = (t.image || "").trim();
        if (title || description || content || image) {
          translationsPayload[loc] = { title, description, content, image };
        }
      }

      const rawIds = (data.campaignIds || []).filter((id) => id && id !== NO_CAMPAIGN_VALUE);
      const seen = new Set();
      const campaignIds = [];
      for (const id of rawIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        campaignIds.push(id);
        if (campaignIds.length >= 3) break;
      }

      const payload = {
        title: data.title,
        description: data.description || "",
        content: contentAR || "",
        image: data.image || "",
        categoryId: data.categoryId || null,
        campaignIds,
      };
      if (isCreate && Object.keys(translationsPayload).length > 0) payload.translations = translationsPayload;

      let response;
      if (isCreate) {
        response = await axios.post("/api/posts", payload);
        toast.success("تم إنشاء المقال بنجاح", { id: toastId, duration: 9000 });
        const key = response.data.slug || response.data.id;
        router.push(redirectAfterCreate ? `${redirectAfterCreate}/${key}` : `/blog/${key}`);
      } else {
        response = await axios.patch(`/api/posts/${post.id}`, payload);
        toast.success("تم تحديث المقال بنجاح — أنت ما زلت داخل صفحة التعديل", { id: toastId, duration: 9000 });
        router.refresh();
      }
    } catch (error) {
      console.error(isCreate ? "Post create error:" : "Post update error:", error);
      toast.error(error?.response?.data?.error || protectedEditorConfig.errorMessage, { id: toastId, duration: 11000 });
    } finally {
      setIsSaving(false);
      setShowLoadingAlert(false);
    }
  };

  const onInvalid = () => {
    toast.error("راجع عنوان المقال والحقول المطلوبة قبل الحفظ", { duration: 9000 });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("/api/upload", formData);
      form.setValue("image", response.data.url || "");
      toast.success(protectedEditorConfig.successMessageImageUpload);
    } catch (err) {
      console.error("Error uploading image:", err);
      toast.error(protectedEditorConfig.errorMessageImageUpload);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async () => {
    const current = form.getValues("image");
    if (current) {
      try {
        const publicId = current.split("/").slice(-1)[0].split(".")[0];
        if (publicId) await axios.delete(`/api/upload?publicId=${publicId}`);
      } catch (err) {
        console.error("Error removing image:", err);
      }
    }
    form.setValue("image", "");
    toast.success("تم حذف الصورة بنجاح");
  };

  const onDelete = async () => {
    setShowLoadingAlert(true);
    setIsSaving(true);
    try {
      await axios.delete(`/api/posts/${post.id}`);
      router.back();
    } catch (error) {
      console.error("Post delete error:", error);
      toast.error(error?.response?.data?.error || protectedEditorConfig.errorMessage);
    } finally {
      setIsSaving(false);
      setShowLoadingAlert(false);
    }
  };

  return (
    <>
      <Form {...form} dir="rtl">
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target?.tagName === "INPUT") e.preventDefault();
          }}
          className="space-y-6"
        >
          <Card>
            <CardHeader dir="rtl">
              <CardTitle>{protectedEditorConfig.generalTitle}</CardTitle>
              <CardDescription>{protectedEditorConfig.generalDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>{protectedEditorConfig.formTitle} *</FormLabel>
                  <FormControl><Input placeholder={protectedEditorConfig.placeHolderTitle} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="categoryId" render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>{protectedEditorConfig.categoryTitle}</FormLabel>
                  <Select value={field.value || ""} onValueChange={field.onChange} dir="rtl">
                    <FormControl><SelectTrigger><SelectValue placeholder={protectedEditorConfig.categoryDescription} /></SelectTrigger></FormControl>
                    <SelectContent>{(categories || []).map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormItem dir="rtl">
                <FormLabel>{protectedEditorConfig.campaignTitle}</FormLabel>
                <p className="text-sm text-muted-foreground mb-3">{protectedEditorConfig.campaignDescription}</p>
                <div className="space-y-3">
                  {[0, 1, 2].map((index) => (
                    <FormField key={index} control={form.control} name={`campaignIds.${index}`} render={({ field }) => {
                      const taken = new Set((form.watch("campaignIds") || []).map((v, i) => (i !== index && v && v !== NO_CAMPAIGN_VALUE ? v : null)).filter(Boolean));
                      const campaignChoices = [{ label: "—", value: NO_CAMPAIGN_VALUE }, ...(campaignOptions || []).filter((o) => !taken.has(o.value) || o.value === field.value)];
                      const selectedLabel = campaignChoices.find((o) => o.value === (field.value || NO_CAMPAIGN_VALUE))?.label ?? protectedEditorConfig.campaignDescription;
                      return (
                        <FormItem dir="rtl" className="space-y-1.5">
                          <FormLabel className="text-xs font-normal text-muted-foreground">{protectedEditorConfig.campaignSlotLabel(index + 1)}</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild><FormControl><Button type="button" variant="outline" role="combobox" className={cn("w-full justify-between font-normal", !field.value || field.value === NO_CAMPAIGN_VALUE ? "text-muted-foreground" : "")}>{selectedLabel}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></FormControl></PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder={protectedEditorConfig.campaignSearchPlaceholder} /><CommandEmpty>{protectedEditorConfig.campaignEmpty}</CommandEmpty><CommandList><CommandGroup>{campaignChoices.map((opt) => <CommandItem key={`${index}-${opt.value}`} value={opt.label} onSelect={() => field.onChange(opt.value)}><Check className={cn("mr-2 h-4 w-4", (field.value || NO_CAMPAIGN_VALUE) === opt.value ? "opacity-100" : "opacity-0")} />{opt.label}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      );
                    }} />
                  ))}
                </div>
              </FormItem>

              <FormField control={form.control} name="image" render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>{protectedEditorConfig.coverImageTitle}</FormLabel>
                  <FormControl><div className="space-y-2">{field.value ? (<div className="relative group"><div className="relative w-56 h-56 rounded-lg overflow-hidden bg-muted"><Image src={field.value} alt="Cover" fill className="object-cover" sizes="(max-width: 768px) 100vw, 640px" /></div><button type="button" onClick={removeImage} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button></div>) : (<><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="blog-cover-upload" disabled={uploadingImage} /><label htmlFor="blog-cover-upload" className={`flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors ${uploadingImage ? "opacity-50 cursor-not-allowed" : ""}`}>{uploadingImage ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : <><Upload className="w-6 h-6 text-gray-400" /><span className="mt-2 text-sm text-gray-500">اضغط لرفع الصورة الرئيسية</span></>}</label></>)}</div></FormControl>
                  <FormDescription><span className="text-amber-700">الحجم المُوصى به: <strong>1200×675 px</strong> (نسبة 16:9)، صيغة JPG أو PNG، حجم الملف لا يزيد عن 2MB.</span></FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>{protectedEditorConfig.shortDescriptionTitle}</FormLabel>
                  <FormControl><Textarea placeholder={protectedEditorConfig.placeholderDescription} className="min-h-[160px] resize-y" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <SmartSeoAuditCard
            key="blog-seo-ar"
            type="blog"
            locale="ar"
            title={watchedTitle}
            description={`${watchedDescription || ""}\n${contentAR || ""}`}
            imageCount={watchedImage ? 1 : 0}
          />

          <Card>
            <CardHeader dir="rtl"><CardTitle>المحتوى</CardTitle><CardDescription>{protectedEditorConfig.placeholderContent}</CardDescription></CardHeader>
            <CardContent>
              <WysiwygEditor
                defaultValue={(() => {
                  if (!contentAR) return defaultEditorContent;
                  try { return typeof contentAR === "string" ? JSON.parse(contentAR) : contentAR; } catch { return defaultEditorContent; }
                })()}
                onDebouncedUpdate={(editor) => setContentAR(JSON.stringify(editor?.getJSON()))}
              />
            </CardContent>
          </Card>

          <div className="inline-flex items-center justify-start gap-x-3">
            <Button type="submit" className="flex !bg-gray-900 px-10 !text-white hover:!bg-gray-800" disabled={isSaving}>{isCreate ? "إنشاء" : protectedEditorConfig.submit}</Button>
            {!isCreate && <Button type="button" onClick={onDelete} className="flex !bg-gray-900 px-10 !text-white hover:!bg-gray-800" disabled={isSaving}>{protectedEditorConfig.delete}</Button>}
            <Button type="button" onClick={() => router.back()} className="flex !bg-gray-100 px-10 !text-gray-900 hover:!bg-gray-200" disabled={isSaving}>{protectedEditorConfig.cancel}</Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={showLoadingAlert} onOpenChange={setShowLoadingAlert}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">{protectedPostConfig.pleaseWait}</AlertDialogTitle>
            <AlertDialogDescription className="mx-auto text-center"><Loader2 className="h-6 w-6 animate-spin" /></AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BlogEditor;
