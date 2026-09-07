"use client";

import * as z from "zod";
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Pencil, Globe, Languages } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Textarea } from "@/components/ui/textarea";
import { Post } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import React from "react";

interface DescriptionFormProps {
  initialData: Post;
  postId: string;
}

const DescriptionForm: React.FC<DescriptionFormProps> = ({
  initialData,
  postId,
}) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("ar");

  const toggleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsEditing((current) => !current);
  };

  const formSchema = z.object({
    descriptionAR: z.string().min(1, {
      message: "الوصف بالعربية مطلوب",
    }),
    descriptionEN: z.string().optional(),
    descriptionFR: z.string().optional(),
  });

  // Map initial data to new structure, prefer translations
  const trEn = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'en') : null;
  const trFr = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'fr') : null;

  const mappedInitialData = {
    descriptionAR: initialData?.descriptionAR || initialData?.description || "",
    descriptionEN: trEn?.description || initialData?.descriptionEN || "",
    descriptionFR: trFr?.description || initialData?.descriptionFR || "",
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: mappedInitialData,
  });

  // Reset form when initialData changes (e.g. translations loaded)
  React.useEffect(() => {
    form.reset(mappedInitialData);
  }, [initialData?.translations]);

  const { isSubmitting, isValid } = form.formState;

  async function onSubmit() {
    const values = form.getValues();
    try {
      const payload:any = { description: values.descriptionAR };
      if (values.descriptionEN) payload.translations = { en: { description: values.descriptionEN } };
      await axios.patch(`/api/posts/${postId}`, payload);
      toast.success("تم تحديث معلومات المقال");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update the blog", error);
      toast.error("حدث خطأ");
    }
  }

  const displayDescription = (language: string) => {
    const trEn = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'en') : null;
    const trFr = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'fr') : null;
    if (language === "ar") {
      return initialData?.descriptionAR || initialData?.description || "لا يوجد وصف بالعربية";
    }
    if (language === "en") return trEn?.description || initialData?.descriptionEN || "No English description available";
    return trFr?.description || initialData?.descriptionFR || "Aucune description en français";
  };

  return (
    <div className="mt-6 border bg-slate-100 rounded-md p-6">
      <div className="font-medium flex items-center justify-between">
        وصف المقال{" "}
        <Button variant="ghost" onClick={toggleEdit}>
          {isEditing ? (
            <>الغاء</>
          ) : (
            <>
              <Pencil className="h-4 w-4 ml-2" />
              تعديل
            </>
          )}
        </Button>
      </div>
      {!isEditing ? (
        <Tabs defaultValue="ar" className="mt-2">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="en" className="flex items-center gap-1">
              <span>English</span>
            </TabsTrigger>
            <TabsTrigger value="fr" className="flex items-center gap-1">
              <span>Français</span>
            </TabsTrigger>
            <TabsTrigger value="ar" className="flex items-center gap-1">
              <span>عربي</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ar" className="mt-2">
            <div className="p-3 bg-slate-50 rounded-md" dir="rtl">
              {displayDescription("ar")}
            </div>
          </TabsContent>
          <TabsContent value="fr" className="mt-2">
            <div className="p-3 bg-slate-50 rounded-md">
              {displayDescription("fr")}
            </div>
          </TabsContent>
          <TabsContent value="en" className="mt-2">
            <div className="p-3 bg-slate-50 rounded-md">
              {displayDescription("en")}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <Form {...form}>
          <div className="space-y-4 mt-4 w-full">
            <Tabs defaultValue="ar" onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="en" className="flex items-center gap-1">
                  <span>English</span>
                </TabsTrigger>
                <TabsTrigger value="ar" className="flex items-center gap-1">
                  <span>عربي</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="ar" className="mt-2">
                <div dir="rtl">
                  <FormField
                    control={form.control}
                    name="descriptionAR"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            disabled={isSubmitting}
                            placeholder="وصف المقال بالعربية"
                            className="text-right"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-right">
                          صف المقال الخاصة بك بشكل ملخص و مفيد
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
              <TabsContent value="fr" className="mt-2">
                <FormField
                  control={form.control}
                  name="descriptionFR"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          disabled={isSubmitting}
                          placeholder="Description de l'article en français"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Fournissez une brève description utile de votre article
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              <TabsContent value="en" className="mt-2">
                <FormField
                  control={form.control}
                  name="descriptionEN"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          disabled={isSubmitting}
                          placeholder="Article description in English"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide a brief and useful description of your article
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>
            
            <div className="flex items-center gap-x-2">
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!isValid || isSubmitting}
                className="flex items-center gap-2"
              >
                <Globe className="h-4 w-4" />
                {activeTab === "ar" ? "تأكيد" : "Confirm"}
              </Button>
            </div>
          </div>
        </Form>
      )}
    </div>
  );
};

export default DescriptionForm;