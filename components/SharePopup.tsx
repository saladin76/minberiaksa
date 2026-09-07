import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Facebook,
  Twitter,
  Send,
  Copy,
  MessageCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useTranslations } from "next-intl";
import { track } from "@vercel/analytics";

interface SharePopupProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  description: string;
  image?: string;
}

const SharePopup = ({
  isOpen,
  onClose,
  url,
  title,
  description,
  image = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg",
}: SharePopupProps) => {
  const t = useTranslations("SharePopup");
  const encodedUrl = encodeURIComponent(url);
  const shareText = t("shareText", { title, description });
  const encodedShareText = encodeURIComponent(shareText);

  // Share links (image is fetched from the Open Graph meta tags)
  const shareLinks = {
    facebook: `https://www.facebook.com/dialog/feed?app_id=495577266291860&display=popup&quote=${encodedShareText}&link=${encodedUrl}&redirect_uri=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedShareText}`,
    telegram: `https://telegram.me/share/url?url=${encodedUrl}&text=${encodedShareText}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodedShareText}%20${encodedUrl}`,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
      try { track("share_campaign", { platform: "copy_link", title: title.slice(0, 250) }); } catch {}
    } catch (err) {
      toast.error(t("linkCopyFailed"));
    }
  };

  const handleShare = (platform: keyof typeof shareLinks) => {
    try { track("share_campaign", { platform, title: title.slice(0, 250) }); } catch {}
    window.open(shareLinks[platform], "_blank", "width=600,height=400");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold text-sky-800">
            {t("shareCampaign")}
          </DialogTitle>
        </DialogHeader>
        <div className="!p-0">
          {/* Campaign Preview Card */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-4">
            <div className="relative h-32 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
              <img
                src={image}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <h3 className="text-base font-bold text-gray-800 mb-1 line-clamp-1">
                {title}
              </h3>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button
              onClick={() => handleShare("facebook")}
              className="flex items-center justify-center gap-2 bg-[#1877f2] hover:bg-[#166fe5] text-white py-2 h-auto"
            >
              <Facebook className="w-4 h-4" />
              {t("facebook")}
            </Button>
            <Button
              onClick={() => handleShare("twitter")}
              className="flex items-center justify-center gap-2 bg-[#1da1f2] hover:bg-[#1a94da] text-white py-2 h-auto"
            >
              <Twitter className="w-4 h-4" />
              {t("twitter")}
            </Button>
            <Button
              onClick={() => handleShare("telegram")}
              className="flex items-center justify-center gap-2 bg-[#0088cc] hover:bg-[#0077b3] text-white py-2 h-auto"
            >
              <Send className="w-4 h-4" />
              {t("telegram")}
            </Button>
            <Button
              onClick={() => handleShare("whatsapp")}
              className="flex items-center justify-center gap-2 bg-[#25d366] hover:bg-[#22c35e] text-white py-2 h-auto"
            >
              <MessageCircle className="w-4 h-4" />
              {t("whatsapp")}
            </Button>
          </div>

          {/* Copy Link Section */}
          <div className="bg-gray-50 p-2 rounded-lg">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                readOnly
                className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 hover:bg-emerald-50 hover:text-emerald-600 transition-colors h-auto py-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {t("copy")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SharePopup;
