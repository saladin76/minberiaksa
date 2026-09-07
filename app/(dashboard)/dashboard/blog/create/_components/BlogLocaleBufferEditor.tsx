"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Loader2, Upload, X } from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import WysiwygEditor from "@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor";
import { defaultEditorContent } from "@/app/[locale]/blog/_components/wysiwyg/default-content";
import { useCreateTranslations, type BufferedLocale } from "./CreateTranslationsContext";
import { SmartSeoAuditCard } from "../../../_components/SmartSeoAuditCard";

const localeMeta: Record<BufferedLocale, { name: string; required: boolean; dir: "ltr" | "rtl" }> = {
  en: { name: "English", required: true, dir: "ltr" },
  fr: { name: "Français", required: false, dir: "ltr" },
  tr: { name: "Türkçe", required: false, dir: "ltr" },
  id: { name: "Bahasa Indonesia", required: false, dir: "ltr" },
  pt: { name: "Português", required: false, dir: "ltr" },
  es: { name: "Español", required: false, dir: "ltr" },
  de: { name: "Deutsch", required: false, dir: "ltr" },
};

export default function BlogLocaleBufferEditor({ locale }: { locale: BufferedLocale }) {
  const ctx = useCreateTranslations();
  const seed = ctx?.translations[locale];

  const [title, setTitle] = useState(seed?.title ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [content, setContent] = useState<string | null>(seed?.content ?? null);
  const [image, setImage] = useState(seed?.image ?? "");
  const [uploading, setUploading] = useState(false);

  const meta = localeMeta[locale];

  useEffect(() => {
    ctx?.updateLocale(locale, { title, description, content, image });
  }, [ctx, locale, title, description, content, image]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("/api/upload", formData);
      setImage(response.data?.url ?? "");
      toast.success("تم رفع الصورة بنجاح");
    } catch (err) {
      console.error("Image upload error:", err);
      toast.error("فشل رفع الصورة");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    if (image) {
      const publicId = image.split("/").slice(-1)[0].split(".")[0];
      if (publicId) {
        axios.delete(`/api/upload?publicId=${publicId}`).catch(() => {});
      }
    }
    setImage("");
  };

  return (
    <div className="space-y-6" dir={meta.dir}>
      <Card>
        <CardHeader dir={meta.dir}>
          <CardTitle>Translation — {meta.name}</CardTitle>
          <CardDescription>
            This {meta.name} version will be saved together with the Arabic post when you click <strong>Save</strong> in the Arabic tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Title{meta.required ? " *" : ""}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Title in ${meta.name}`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Short description{meta.required ? " *" : ""}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Description in ${meta.name}`}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Cover image (optional)</label>
            {image ? (
              <div className="relative group">
                <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted">
                  <Image
                    src={image}
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
                  id={`buffered-image-${locale}`}
                  disabled={uploading}
                />
                <label
                  htmlFor={`buffered-image-${locale}`}
                  className={`flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors ${
                    uploading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-400" />
                      <span className="mt-2 text-sm text-gray-500">Click to upload cover</span>
                    </>
                  )}
                </label>
              </>
            )}
            <p className="text-xs text-amber-700">
              Recommended size: <strong>1200×675 px</strong> (16:9), JPG/PNG, max 2MB.
            </p>
          </div>
        </CardContent>
      </Card>

      <SmartSeoAuditCard
        key={`blog-buffer-seo-${locale}`}
        type="blog"
        locale={locale}
        title={title}
        description={`${description || ""}\n${content || ""}`}
        imageCount={image ? 1 : 0}
      />

      <Card>
        <CardHeader dir={meta.dir}>
          <CardTitle>Body</CardTitle>
          <CardDescription>Article body in {meta.name}.</CardDescription>
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
    </div>
  );
}