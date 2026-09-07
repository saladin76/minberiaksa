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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Globe, Languages, Pencil } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  initialData: any;
  postId: string;
};

const TitleForm = ({ initialData, postId }: Props) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("ar");

  const toggleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsEditing((current) => !current);
  };

  const formSchema = z.object({
    titleAR: z.string().min(1, {
      message: "العنوان بالعربية مطلوب",
    }),
    titleEN: z.string().optional(),
    titleFR: z.string().optional(),
  });

  // Map initial data to new structure, prefer translations if available
  const trEn = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'en') : null;
  const trFr = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'fr') : null;

  const mappedInitialData = {
    titleAR: initialData?.titleAR || initialData?.title || "",
    titleEN: trEn?.title || initialData?.titleEN || "",
    titleFR: trFr?.title || initialData?.titleFR || "",
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: mappedInitialData,
  });

  const { isSubmitting, isValid } = form.formState;

  async function onSubmit() {
    const values = form.getValues();
    try {
      const payload: any = { title: values.titleAR };
      const translations: any = {};
      if (values.titleEN) translations.en = { ...(translations.en || {}), title: values.titleEN };
      if (values.titleFR) translations.fr = { ...(translations.fr || {}), title: values.titleFR };
      if (Object.keys(translations).length > 0) payload.translations = translations;
      await axios.patch(`/api/posts/${postId}`, payload);
      toast.success("تم تحديث معلومات المقال");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update the blog", error);
      toast.error("حدث خطأ");
    }
  }

  const displayTitle = (language: string) => {
    const trEn = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'en') : null;
    const trFr = Array.isArray(initialData?.translations) ? initialData.translations.find((t:any) => t.locale === 'fr') : null;
    if (language === "ar") {
      return initialData?.titleAR || initialData?.title || "لا يوجد عنوان بالعربية";
    }
    if (language === "en") {
      return trEn?.title || initialData?.titleEN || "No English title available";
    }
    return trFr?.title || initialData?.titleFR || "No French title available";
  };

  return (
    <Card className="mt-6 border bg-slate-100 rounded-md">
      <div className="p-3">
        <div className="font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>عنوان المقال</span>
          </div>
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
                {displayTitle("ar")}
              </div>
            </TabsContent>
            <TabsContent value="fr" className="mt-2">
              <div className="p-3 bg-slate-50 rounded-md">
                {displayTitle("fr")}
              </div>
            </TabsContent>
            <TabsContent value="en" className="mt-2">
              <div className="p-3 bg-slate-50 rounded-md">
                {displayTitle("en")}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Form {...form}>
            <div className="space-y-4 mt-4 w-full">
              <Tabs defaultValue="ar" onValueChange={setActiveTab}>
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
                  <div dir="rtl">
                    <FormField
                      control={form.control}
                      name="titleAR"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              disabled={isSubmitting}
                              placeholder="عنوان المقال بالعربية"
                              className="text-right"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-right">
                            ماذا ستقدم من خلال هذا المقال؟
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
                    name="titleFR"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            disabled={isSubmitting}
                            placeholder="Titre de l'article en français"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Quel est le sujet de votre article?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                <TabsContent value="en" className="mt-2">
                  <FormField
                    control={form.control}
                    name="titleEN"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            disabled={isSubmitting}
                            placeholder="Article title in English"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          What will you present in this article?
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
    </Card>
  );
};

export default TitleForm;