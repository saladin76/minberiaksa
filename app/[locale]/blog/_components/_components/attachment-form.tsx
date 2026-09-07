"use client";

import * as z from "zod";
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { File, Loader2, PlusCircle, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
// import { Attachment, Chapter } from "@prisma/client";
// import { FileUpload } from "@/components/file-upload";

interface AttachmentFormProps {
  initialData: Chapter & { attachments: Attachment[] };
  courseId: string;
  chapterId: string;
}

const AttachmentForm: React.FC<AttachmentFormProps> = ({
  initialData,
  courseId,
  chapterId,
}) => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsEditing((current) => !current);
  };

  const formSchema = z.object({
    pdfUrl: z.string().min(1),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { pdfUrl: initialData?.title || "" },
  });

  const { isSubmitting, isValid } = form.formState;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("Submitting form with values:", values);
    try {
      await axios.post(
        `/api/courses/${courseId}/chapters/${chapterId}/attachments`,
        values
      );
      toast.success("تم تحديث معلومات الحصة");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to update the course", error);
      toast.error("حدث خطأ");
    }
  }

  const onDelete = async (id: string) => {
    try {
      setDeletingId(id);
      await axios.delete(
        `/api/courses/${courseId}/chapters/${chapterId}/attachments/${id}`
      );
      toast.success("تم مسح المرفق");
      router.refresh();
    } catch (error) {
      toast.error("حدث خطأ");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-6 border bg-slate-100 rounded-md p-6">
      <div className="font-medium flex items-center justify-between">
        مرفقات الحصة
        <Button variant="ghost" onClick={toggleEdit}>
          {isEditing && <>إلغاء</>}
          {!isEditing && (
            <>
              <PlusCircle className="h-4 w-4 ml-2" />
              أضف ملف
            </>
          )}
        </Button>
      </div>
      {isEditing ? (
        <div>
          <FileUpload
            endpoint="courseAttachment"
            onChange={async (pdfUrl) => {
              console.log("File uploaded, received URL:", pdfUrl);
              if (pdfUrl) {
                try {
                  await onSubmit({ pdfUrl: pdfUrl });
                } catch (error) {
                  console.error("Error during form submission:", error);
                }
              } else {
                console.error("No URL returned from upload");
                toast.error("Failed to get upload URL");
              }
            }}
          />
          <div className="text-xs text-muted-foreground mt-4">
            أرفع أي مرفق يمكن أن يحتاجه الطالب لمذاكرة الدرس
          </div>
        </div>
      ) : (
        <>
          {initialData.attachments?.length === 0 || initialData.attachments  == undefined  ? (
            <p className="text-sm mt-2 text-slate-500 italic">
              لم يتم رفع أي مرفقات بعد
            </p>
          ) : (
            <div className="space-y-2">
              {initialData.attachments?.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center p-3 w-full bg-sky-100 border-sky-200 border text-sky-700 rounded-md"
                >
                  <File className="h-4 w-4 ml-2 flex-shrink-0" />
                  <p className="text-xs line-clamp-1">{attachment.name}</p>
                  {deletingId === attachment.id && (
                    <div className="mr-auto">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {deletingId !== attachment.id && (
                    <button
                      onClick={() => {
                        onDelete(attachment.id);
                      }}
                      className="mr-auto hover:opacity-75 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttachmentForm;
