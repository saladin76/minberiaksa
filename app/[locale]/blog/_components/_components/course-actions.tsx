"use client";

import ConfirmModal from "@/components/modals/confirm-modal";
import { Button } from "@/components/ui/button";
import { useConfettiStore } from "@/hooks/use-confetti-store";
import axios from "axios";
import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import toast from "react-hot-toast";

// Define the interface for the form props
interface CourseActionsProps {
  disabled: boolean;
  courseId: string;
  isPublished: boolean;
}

const CourseActions: React.FC<CourseActionsProps> = ({
  disabled,
  courseId,
  isPublished,
}: CourseActionsProps) => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const confetti = useConfettiStore()

  const onDelete = async () => {
      try{
          setIsLoading(true)
          await axios.delete(`/api/courses/${courseId}`)
          toast.success("تم مسح الدورة")
          router.refresh()
          router.push(`/teacher/courses`)
      }catch{
          toast.error("حدث خطأ")
      }finally{
          setIsLoading(false)
      }
  }
  
  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
      try{
          setIsLoading(true)
          if(isPublished){
            await axios.patch(`/api/courses/${courseId}/unpublish`)
            toast.success("تم اِخفاء الدورة عن العامة")
          }else{
            await axios.patch(`/api/courses/${courseId}/publish`)
            toast.success("تم اِظهار الدورة للعامة")
            confetti.onOpen()
            console.log("UWU")
          }
          
          router.refresh()
      }catch{
          toast.error("حدث خطأ")
      }finally{
          setIsLoading(false)
      }
  }
  
  return (
    <div className="flex items-center gap-x-2">
      <Button
        className="font-semibold"
        onClick={onClick}
        disabled={disabled || isLoading}
        variant="outline"
        size="sm"
      >
        {isPublished ? "إخفاء" : "نشر"}
      </Button>
      <ConfirmModal onConfirm={onDelete}>
        <Button size="sm" disabled={isLoading}>
          <Trash className="h-4 w-4" />
        </Button>
      </ConfirmModal>
    </div>
  );
};

export default CourseActions;
