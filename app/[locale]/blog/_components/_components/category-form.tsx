"use client";

import * as z from "zod";
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Post } from "@prisma/client";
import { cn } from "@/lib/utils";
import Combobox from "@/components/ui/combobox";

interface CategoryFormProps {
  initialData: Post;
  postId: string;
  options: { label: string; value: string }[];
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  initialData,
  postId,
  options = [],
}) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  const toggleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsEditing((current) => !current);
  };

  const formSchema = z.object({
    category_id: z.string().min(1, "التصنيف مطلوب"),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { category_id: initialData?.category_id || "" },
  });

  const { isSubmitting, isValid } = form.formState;

  async function onSubmit() {
    const values = form.getValues(); // Get the form values
    console.log(values);
    try {
      const payload = { categoryId: values.category_id };
      await axios.patch(`/api/posts/${postId}`, payload);
      toast.success("تم تحديث معلومات المقال");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update the blog", error);
      toast.error("حدث خطأ");
    }
  }

  const selectedOption = options.find((option) => option.value === initialData.category_id);

  return (
    <div className="mt-6 border bg-slate-100 rounded-md p-6">
      <div className="font-medium flex items-center justify-between">
        تصنيف المقال
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
      {!isEditing && (
        <p className={cn("text-sm mt-2", !initialData.category_id && "text-slate-500 italic")}>
          {selectedOption?.label || "لا يوجد تصنيف"}
        </p>
      )}
      {isEditing && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4 w-full">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Combobox options={options} value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-x-2">
            <Button
                type="button"
                onClick={onSubmit}
                disabled={!isValid || isSubmitting}
              >
                تأكيد
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
};

export default CategoryForm;
