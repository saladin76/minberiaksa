"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import toast from "react-hot-toast";

interface ShareButtonProps {
  label?: string;
  copiedMessage?: string;
  url?: string;
}

export default function ShareButton({ label = "Share", copiedMessage = "Link copied", url }: ShareButtonProps) {
  const onShare = async () => {
    try {
      const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
      if (navigator.share) {
        await navigator.share({ title: document.title, text: label, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(copiedMessage);
      }
    } catch (err) {
      toast.error("Failed to share");
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={onShare}>
      <Share2 className="mx-2 h-4 w-4" />
      {label}
    </Button>
  );
}
