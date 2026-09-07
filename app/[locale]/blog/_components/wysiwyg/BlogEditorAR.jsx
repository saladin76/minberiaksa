"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { toast } from "react-hot-toast";
import { v4 } from "uuid";
import slugify from "react-slugify";
import * as z from "zod";

// Uppy imports
import Uppy from "@uppy/core";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import { DashboardModal } from "@uppy/react";
import Tus from "@uppy/tus";

import {
  SparklesIcon,
  PaperclipIcon,
  Loader2 as SpinnerIcon,
} from "lucide-react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Custom components and config
import WysiwygEditor from "./wysiwyg/wysiwyg-editor";
import { mainCategoryConfig } from "@/lib/blog";
import { defaultEditorContent } from "./wysiwyg/default-content";

// Custom upload components
import ImageForm from "./_components/image-form";
import CategoryForm from "./_components/category-form";
import TitleForm from "./_components/title-form";
import DescriptionForm from "./_components/description-form";

// Validation schema
const postEditFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  image: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  content: z.string().optional(),
});

// Configuration
const protectedEditorConfig = {
  generalTitle: "المعلومات العامة",
  generalDescription: "قدم التفاصيل الأساسية لمقالك",
  formTitle: "العنوان",
  placeHolderTitle: "أدخل عنوان المقال",
  placeholderSlug: "أدخل رابط المقال",
  generateSlug: "توليد الرابط",
  categoryTitle: "التصنيف",
  categoryDescription: "اختر تصنيفاً لمقالك",
  coverImageTitle: "الصورة الرئيسية",
  coverImageDescription: "قم برفع صورة رئيسية لمقالك",
  placeholderImage: "رابط الصورة الرئيسية",
  formCoverImageUploadFile: "رفع الصورة الرئيسية",
  galleryImageTitle: "صور المعرض",
  galleryImageDescription: "يمكنك رفع حتى ",
  chooseFile: "اختر الملفات",
  shortDescriptionTitle: "الوصف القصير",
  shortDescriptionDescription: "قدم وصفاً مختصراً لمقالك",
  placeholderDescription: "أدخل وصف المقال",
  submit: "حفظ",
  delete: "مسح",
  cancel: "إلغاء",
  successMessage: "تم تحديث المقال بنجاح",
  errorMessage: "فشل تحديث المقال",
  successMessageImageUpload: "تم رفع الصورة بنجاح",
  errorMessageImageUpload: "فشل رفع الصورة",
  formImageNote: "الصور حتى حجم 6 ميجابايت، بصيغة JPG/PNG",
  placeholderContent: "أدخل محتوى المقال",
};

const protectedPostConfig = {
  pleaseWait: "برجاء الانتظار ...",
};

const BlogEditor = ({ post, userId, categories }) => {
  const router = useRouter();

  // Derive current images
  const galleryImageFileNames =
    post.galleryImages?.map((img) => img.fileName) || [];
  const galleryImagePublicUrls =
    post.galleryImages?.map((img) => img.publicUrl) || [];

  // These are the values that will be used to upload the image
  const allowedNumberOfImages = 9 - galleryImagePublicUrls.length;

  // States
  const [isSaving, setIsSaving] = useState(false);
  const [showLoadingAlert, setShowLoadingAlert] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  // Content state
  const [content, setContent] = useState(post?.content || null);

  // Supabase Upload Configuration
  const bucketNamePosts =
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_POSTS || "posts";
  const bucketNameCoverImage =
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_COVER_IMAGE ||
    "cover-image";
  const bucketNameGalleryImage =
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET_GALLERY_IMAGE ||
    "gallery-image";
  const token = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectId = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID;
  const supabaseUploadURL = `https://${projectId}.supabase.co/storage/v1/upload/resumable`;

  // Uppy instance for cover photo upload
  const uppyCover = new Uppy({
    id: "cover-image",
    autoProceed: false,
    debug: false,
    allowMultipleUploadBatches: true,
    restrictions: {
      maxFileSize: 6000000,
      maxNumberOfFiles: 1,
    },
  }).use(Tus, {
    endpoint: supabaseUploadURL,
    headers: {
      authorization: `Bearer ${token}`,
    },
    chunkSize: 6 * 1024 * 1024,
    allowedMetaFields: [
      "bucketName",
      "objectName",
      "contentType",
      "cacheControl",
    ],
  });

  uppyCover.on("file-added", (file) => {
    file.meta = {
      ...file.meta,
      bucketName: bucketNameCoverImage,
      objectName: `${userId}/${post.id}/${file.name}`,
      contentType: file.type,
    };
  });

  uppyCover.on("complete", async (result) => {
    if (result.successful.length > 0) {
      toast.success(protectedEditorConfig.successMessageImageUpload);
      router.refresh();
    } else {
      toast.error(protectedEditorConfig.errorMessageImageUpload);
    }
    setShowCoverModal(false);
  });

  // Uppy instance for gallery uploads
  const uppyGallery = new Uppy({
    id: "gallery-image",
    autoProceed: false,
    debug: false,
    allowMultipleUploadBatches: true,
    restrictions: {
      maxFileSize: 6000000,
      maxNumberOfFiles: allowedNumberOfImages,
    },
  }).use(Tus, {
    endpoint: supabaseUploadURL,
    headers: {
      authorization: `Bearer ${token}`,
    },
    chunkSize: 6 * 1024 * 1024,
    allowedMetaFields: [
      "bucketName",
      "objectName",
      "contentType",
      "cacheControl",
    ],
  });

  uppyGallery.on("file-added", (file) => {
    file.meta = {
      ...file.meta,
      bucketName: bucketNameGalleryImage,
      objectName: `${userId}/${post.id}/${file.name}`,
      contentType: file.type,
    };
  });

  uppyGallery.on("complete", async (result) => {
    if (result.successful.length > 0) {
      toast.success(protectedEditorConfig.successMessageImageUpload);
      router.refresh();
    } else {
      toast.error(protectedEditorConfig.errorMessageImageUpload);
    }
    setShowGalleryModal(false);
  });

  // Form setup
  const defaultValues = {
    title: post.title || "Untitled",
    image: post.image || "",
    categoryId: post.category_id || "",
    description: post.description || "Post description",
    content: content || protectedEditorConfig.placeholderContent,
  };

  const form = useForm({
    resolver: zodResolver(postEditFormSchema),
    defaultValues,
    mode: "onChange",
  });

  // Submit handler with Axios and Prisma API route
  const onSubmit = async (data) => {
    setShowLoadingAlert(true);
    setIsSaving(true);

    try {
      // Update post using Axios to call Prisma API route
      const response = await axios.patch(`/api/posts/${post.id}`, {
        title: data.title,
        image: data.image,
        description: data.description,
        content: content,
        categoryId: data.categoryId,
      });

      // Success handling
      toast.success(protectedEditorConfig.successMessage);
      router.push(`/blog/${response.data.slug || response.data.id}`);
    } catch (error) {
      // Error handling
      console.error("Post update error:", error);
      toast.error(protectedEditorConfig.errorMessage);
    } finally {
      setIsSaving(false);
      setShowLoadingAlert(false);
    }
  };

  // Delete handler
  const onDelete = async () => {
    setShowLoadingAlert(true);
    setIsSaving(true);

    try {
      // Delete post using Axios to call Prisma API route
      await axios.delete(`/api/posts/${post.id}`);

      // Success handling
      router.back();
    } catch (error) {
      // Error handling
      console.error("Post delete error:", error);
      toast.error(protectedEditorConfig.errorMessage);
    } finally {
      setIsSaving(false);
      setShowLoadingAlert(false);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-8">
          {/* Cards and form fields */}
          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>{protectedEditorConfig.generalTitle}</CardTitle>
              <CardDescription>
                {protectedEditorConfig.generalDescription}
              </CardDescription>
            </CardHeader>
            <Separator className="mb-8" />
            <CardContent className="space-y-4">
              <TitleForm initialData={post} postId={post.id} />
            </CardContent>
          </Card>

          {/* Category */}
          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>{protectedEditorConfig.categoryTitle}</CardTitle>
              <CardDescription>
                {protectedEditorConfig.categoryDescription}
              </CardDescription>
            </CardHeader>
            <Separator className="mb-8" />
            <CardContent className="space-y-4">
              <CategoryForm
                initialData={post}
                postId={post.id}
                options={categories}
              />
            </CardContent>
          </Card>

          {/* Cover Image */}
          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>{protectedEditorConfig.coverImageTitle}</CardTitle>
              <CardDescription>
                {protectedEditorConfig.coverImageDescription}
                <br />
                <span className="text-amber-700">
                  الحجم المُوصى به: <strong>1200×675 px</strong> (نسبة 16:9)، صيغة JPG أو PNG، حجم الملف لا يزيد عن 2MB.
                </span>
              </CardDescription>
            </CardHeader>
            <Separator className="mb-8" />
            <CardContent className="space-y-4">
              <ImageForm initialData={post} postId={post.id} />
            </CardContent>
          </Card>

          {/* Short Description */}
          <Card className="">
            <CardHeader dir="rtl">
              <CardTitle>
                {protectedEditorConfig.shortDescriptionTitle}
              </CardTitle>
              <CardDescription>
                {protectedEditorConfig.shortDescriptionDescription}
              </CardDescription>
            </CardHeader>
            <Separator className="mb-8" />
            <CardContent className="space-y-4">
              <DescriptionForm initialData={post} postId={post.id} />
            </CardContent>
          </Card>

          {/* WYSIWYG Editor */}
          <WysiwygEditor
            defaultValue={content ? JSON.parse(content) : defaultEditorContent}
            onDebouncedUpdate={(editor) => {
              setContent(JSON.stringify(editor?.getJSON()));
            }}
          />

          {/* Form submission buttons */}
          <div className="inline-flex items-center justify-start gap-x-3">
            <Button
              type="submit"
              className="flex !bg-gray-900 px-10 !text-white hover:!bg-gray-800"
              disabled={isSaving}
            >
              {protectedEditorConfig.submit}
            </Button>
            <Button
              type="button"
              onClick={onDelete}
              className="flex !bg-gray-900 px-10 !text-white hover:!bg-gray-800"
              disabled={isSaving}
            >
              {protectedEditorConfig.delete}
            </Button>
            <Button
              type="button"
              onClick={() => router.back()}
              className="flex !bg-gray-100 px-10 !text-gray-900 hover:!bg-gray-200"
              disabled={isSaving}
            >
              {protectedEditorConfig.cancel}
            </Button>
          </div>
        </form>
      </Form>

      {/* Loading Alert Dialog */}
      <AlertDialog open={showLoadingAlert} onOpenChange={setShowLoadingAlert}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              {protectedPostConfig.pleaseWait}
            </AlertDialogTitle>
            <AlertDialogDescription className="mx-auto text-center">
              <SpinnerIcon className="h-6 w-6 animate-spin" />
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default BlogEditor;