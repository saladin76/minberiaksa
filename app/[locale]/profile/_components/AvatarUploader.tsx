"use client";

import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Camera, Loader2, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";

interface AvatarUploaderProps {
  userId: string;
  image: string | null | undefined;
  name: string | null | undefined;
  email: string | null | undefined;
  /** Called with the new image URL (or null to clear) after a successful save. */
  onUpdated: (nextImage: string | null) => void;
  /** Visual size — must be one of the predefined options because Tailwind's JIT
   *  doesn't resolve interpolated class names. Default "lg". */
  size?: "md" | "lg" | "xl";
}

// Predefined size classes so Tailwind's class extraction can see literal strings.
const SIZE_CLASSES: Record<NonNullable<AvatarUploaderProps["size"]>, string> = {
  md: "w-20 h-20",
  lg: "w-24 h-24",
  xl: "w-28 h-28",
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export default function AvatarUploader({
  userId,
  image,
  name,
  email,
  onUpdated,
  size = "lg",
}: AvatarUploaderProps) {
  const t = useTranslations("Profile.avatar");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initial = (name ?? email ?? "?").charAt(0).toUpperCase();

  const handleSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("notImage"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await axios.post("/api/upload", form);
      const url = uploadRes.data?.url as string | undefined;
      if (!url) throw new Error("upload returned no url");
      await axios.put(`/api/users/${userId}`, { image: url });
      onUpdated(url);
      toast.success(t("updated"));
    } catch (err) {
      console.error("avatar upload error:", err);
      toast.error(t("failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      await axios.put(`/api/users/${userId}`, { image: "" });
      onUpdated(null);
      toast.success(t("removed"));
    } catch (err) {
      console.error("avatar remove error:", err);
      toast.error(t("failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block group">
      <Avatar className={`${SIZE_CLASSES[size]} ring-4 ring-[#A5243D]/10 shadow-xl`}>
        <AvatarImage src={image ?? undefined} alt={name ?? undefined} />
        <AvatarFallback className="text-2xl bg-[#A5243D] text-white">
          {initial}
        </AvatarFallback>
      </Avatar>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#A5243D] hover:bg-[#7D1830] text-white flex items-center justify-center shadow-lg ring-4 ring-white disabled:opacity-70 transition-colors"
        aria-label={t("change")}
        title={t("change")}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      </button>

      {image && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={t("remove")}
          title={t("remove")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleSelect(file);
        }}
      />
    </div>
  );
}
