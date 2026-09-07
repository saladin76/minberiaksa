"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Clock,
  MessageCircle,
  Edit2,
  Trash2,
  Send,
  Loader2,
  MoreHorizontal,
  Bell,
  Info,
  Book,
  ChevronLeft,
  ChevronRight,
  Users,
  TrendingUp,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import Modal from "@/app/[locale]/components/Modal";
import SignInDialog from "@/components/SignInDialog";
import DonationSidebar from "../_components/DonationSidebar";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import CategoryIcon from "@/components/CategoryIcon";
import WysiwygEditor from "@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor";
import SuggestedCampaigns from "./SuggestedCampaigns";

// Types
interface Category {
  id?: string;
  slug?: string | null;
  nameAr?: string;
  nameEn?: string;
  nameFr?: string;
  name?: string;
  icon?: string;
}

interface Campaign {
  id: string;
  slug?: string | null;
  titleAr?: string;
  titleEn?: string;
  titleFr?: string;
  title?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  descriptionFr?: string;
  description?: string;
  images: string[];
  videoUrl?: string | null;
  targetAmount: number;
  amountRaised?: number;
  currentAmount?: number;
  donationCount: number;
  progress: number;
  showProgress?: boolean;
  goalType?: string;
  fundraisingMode?: string;
  sharePriceUSD?: number | null;
  suggestedShareCounts?: { counts: number[]; priceByCurrency?: Record<string, number> };
  category: Category;
  donationStats: {
    first: DonationStat | null;
    largest: DonationStat | null;
    last: DonationStat | null;
  };
  updates: Array<{
    id: string;
    titleAr?: string;
    titleEn?: string;
    titleFr?: string;
    title?: string;
    descriptionAr?: string;
    descriptionEn?: string;
    descriptionFr?: string;
    description?: string;
    image: string | null;
    videoUrl?: string;
    createdAt: string;
  }>;
}

interface DonationStat {
  amount: number;
  donor: string;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: {
    name: string;
    image: string;
    email?: string;
  };
}

const FALLBACK = "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg";

/** Convert any video share URL into an embeddable iframe src */
function resolveEmbedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // YouTube: youtube.com/watch?v=ID  or  youtu.be/ID  or  /shorts/ID
    if (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) {
      let vid = url.searchParams.get("v");
      if (!vid && url.hostname === "youtu.be") vid = url.pathname.slice(1).split("?")[0];
      if (!vid) { const m = url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/); if (m) vid = m[1]; }
      if (vid) return `https://www.youtube.com/embed/${vid}?rel=0`;
    }
    // Facebook: use plugin embed with the resolved (non-share) URL
    if (url.hostname.includes("facebook.com")) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false&width=720&allowfullscreen=true`;
    }
  } catch { /* fall through */ }
  return raw;
}

/** Returns true for Facebook short-share URLs that need server-side resolution */
function isFbShareUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.hostname.includes("facebook.com") && url.pathname.startsWith("/share/");
  } catch { return false; }
}

/** Renders a 16:9 video iframe, resolving Facebook share URLs server-side first */
function VideoEmbed({ rawUrl, title, className }: { rawUrl: string; title?: string; className?: string }) {
  const [src, setSrc] = React.useState<string>(() =>
    isFbShareUrl(rawUrl) ? "" : resolveEmbedUrl(rawUrl)
  );

  React.useEffect(() => {
    if (!isFbShareUrl(rawUrl)) { setSrc(resolveEmbedUrl(rawUrl)); return; }
    fetch(`/api/resolve-url?url=${encodeURIComponent(rawUrl)}`)
      .then(r => r.json())
      .then(({ resolved }: { resolved: string }) => setSrc(resolveEmbedUrl(resolved)))
      .catch(() => setSrc(resolveEmbedUrl(rawUrl)));
  }, [rawUrl]);

  if (!src) return null;

  return (
    <div className={className} style={{ position: "relative", paddingBottom: "56.25%" }}>
      <iframe
        src={src}
        title={title || "video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
      />
    </div>
  );
}


const IntegratedCampaignPage = ({ id, locale: propLocale }: { id: string; locale?: string }) => {
  const t = useTranslations("Campaign");
  const tTrust = useTranslations("SignInDialog");
  const localeFromHook = useLocale() as "ar" | "en" | "fr";
  const locale = (propLocale as any) || localeFromHook;
  const { data: session } = useSession();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{ type: "image" | "video"; src: string; alt?: string } | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState<"description" | "updates" | "comments" | "info">("description");
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  const getLocalizedProperty = (obj: any, key: string) => {
    if (!obj) return "";
    if (obj[key]) return obj[key];
    const localeKey = `${key}${locale.charAt(0).toUpperCase() + locale.slice(1)}`;
    if (obj[localeKey]) return obj[localeKey];
    return obj[`${key}Ar`] || "";
  };

  useEffect(() => {
    const fetchCampaignData = async () => {
      try {
        setLoading(true);
        const response = await axios.get<Campaign>(
          `/api/campaigns/${id}?locale=${encodeURIComponent(locale)}`,
          { headers: { "x-locale": locale } }
        );
        if (!response.data) throw new Error("Campaign not found");
        setCampaign(response.data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t("fetchError");
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchCampaignData();
  }, [id, locale]);


  useEffect(() => {
    if (!campaign) return;
    axios.get(`/api/campaigns/${id}/comments`)
      .then(r => setComments(r.data))
      .catch(() => toast.error(t("failedToLoadComments")));
  }, [id, campaign]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!session) { setIsSignInOpen(true); return; }
    setIsSubmitting(true);
    try {
      const r = await axios.post(`/api/campaigns/${id}/comments`, { text: newComment });
      setComments([r.data, ...comments]);
      setNewComment("");
      toast.success(t("commentAdded"));
    } catch { toast.error(t("failedToAddComment")); }
    finally { setIsSubmitting(false); }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editText.trim()) return;
    setIsSubmitting(true);
    try {
      const r = await axios.patch(`/api/campaigns/${id}/comments/${commentId}`, { text: editText });
      setComments(comments.map(c => c.id === commentId ? r.data : c));
      setEditingComment(null);
      toast.success(t("commentUpdated"));
    } catch { toast.error(t("failedToUpdateComment")); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t("confirmDeleteComment"))) return;
    try {
      await axios.delete(`/api/campaigns/${id}/comments/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
      toast.success(t("commentDeleted"));
    } catch { toast.error(t("failedToDeleteComment")); }
  };

  const tabs = [
    { id: "description", labelKey: "story" as const, icon: Book },
    { id: "updates", labelKey: "updates" as const, icon: Bell, badge: campaign?.updates?.length ?? 0 },
    { id: "comments", labelKey: "comments" as const, icon: MessageCircle, badge: comments.length },
    { id: "info", labelKey: "info" as const, icon: Info },
  ];

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : locale === "fr" ? "fr-FR" : "en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

  if (loading) return <LoadingSkeleton />;

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("campaignNotFound")}</h2>
          <p className="text-gray-500 mb-6">{error || t("campaignNotFoundDescription")}</p>
          <Button onClick={() => window.history.back()} className="bg-[#A5243D] hover:bg-[#7D1830]">
            {t("goBack")}
          </Button>
        </div>
      </div>
    );
  }

  const currentImg = campaign.images[selectedImage] || FALLBACK;

  return (
    <>
      <main className="min-h-screen bg-offwhite/60 pb-28 sm:pb-12">
        <div className="max-w-7xl mx-auto px-0 sm:px-4 sm:py-8">
          <div className="grid lg:grid-cols-12 gap-0 lg:gap-8">

            {/* ── Left: editorial header + media + tabs ── */}
            <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">

              {/* ── Editorial header (title above image) ── */}
              <div className="px-4 pt-5 pb-2 sm:px-0 sm:pt-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Link
                    href={`/category/${campaign.category.slug || campaign.category.id}`}
                    className="inline-flex items-center gap-1.5 shape-chip bg-burgundy hover:bg-burgundyDark text-white text-[11px] sm:text-xs font-bold px-3 py-1.5 uppercase tracking-wide transition-colors"
                  >
                    <CategoryIcon name={campaign.category.icon} className="w-3.5 h-3.5" />
                    {getLocalizedProperty(campaign.category, "name")}
                  </Link>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] sm:text-xs font-bold px-3 py-1.5 border border-emerald-100">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {tTrust("trusted")}
                  </span>
                </div>

                <div className="gold-mark mb-4" />
                <h1 className="text-2xl sm:text-3xl lg:text-[2.6rem] font-extrabold text-deep leading-[1.12] tracking-tight">
                  {getLocalizedProperty(campaign, "title")}
                </h1>
              </div>

              {/* ── Cinematic gallery ── */}
              <div className="px-4 sm:px-0">
                <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] overflow-hidden rounded-[26px] sm:rounded-[32px] shadow-soft ring-1 ring-black/5 bg-deep">
                  {/* Blurred background fill for portrait images */}
                  <Image
                    src={currentImg}
                    alt=""
                    aria-hidden
                    fill
                    sizes="100vw"
                    className="object-cover blur-2xl scale-110 opacity-40 pointer-events-none"
                  />
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedImage}
                      initial={{ opacity: 0, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={currentImg}
                        alt={getLocalizedProperty(campaign, "title")}
                        fill
                        priority={selectedImage === 0}
                        sizes="(max-width: 1024px) 100vw, 66vw"
                        className="object-contain"
                      />
                    </motion.div>
                  </AnimatePresence>

                  {/* Soft bottom gradient for the floating proof bar */}
                  <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

                  {/* Image counter */}
                  {campaign.images.length > 1 && (
                    <div className="absolute top-3 end-3 z-10 rounded-full bg-black/45 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 tabular-nums">
                      {selectedImage + 1} / {campaign.images.length}
                    </div>
                  )}

                  {/* Floating social-proof bar */}
                  <div className="absolute bottom-3.5 inset-x-3.5 z-10 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md text-deep text-xs sm:text-sm font-bold px-3.5 py-2 shadow-sm ring-1 ring-black/5">
                      <Heart className="w-4 h-4 text-burgundy" fill="currentColor" />
                      {campaign.donationCount.toLocaleString()} {t("donor")}
                    </span>
                    {campaign.showProgress !== false && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md text-deep text-xs sm:text-sm font-bold px-3.5 py-2 shadow-sm ring-1 ring-black/5 tabular-nums">
                        <TrendingUp className="w-4 h-4 text-gold" />
                        {campaign.progress.toFixed(0)}% {t("completed")}
                      </span>
                    )}
                  </div>

                  {/* RTL-aware nav arrows */}
                  {campaign.images.length > 1 && (() => {
                    const isRTL = locale === "ar";
                    const atStart = selectedImage === 0;
                    const atEnd = selectedImage === campaign.images.length - 1;
                    const leftDisabled  = isRTL ? atEnd   : atStart;
                    const rightDisabled = isRTL ? atStart : atEnd;
                    const onLeft  = () => setSelectedImage(i => isRTL ? Math.min(campaign.images.length - 1, i + 1) : Math.max(0, i - 1));
                    const onRight = () => setSelectedImage(i => isRTL ? Math.max(0, i - 1) : Math.min(campaign.images.length - 1, i + 1));
                    return (
                      <>
                        <button
                          onClick={onLeft}
                          disabled={leftDisabled}
                          aria-label="Previous image"
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white text-deep shadow-md flex items-center justify-center transition-all disabled:opacity-0 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={onRight}
                          disabled={rightDisabled}
                          aria-label="Next image"
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white text-deep shadow-md flex items-center justify-center transition-all disabled:opacity-0 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    );
                  })()}
                </div>

                {/* Thumbnail strip */}
                {campaign.images.length > 1 && (
                  <div className="flex gap-2.5 mt-3 overflow-x-auto scrollbar-hide p-2">
                    {campaign.images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImage(i)}
                        aria-label={`${t("image")} ${i + 1}`}
                        className={`relative flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 ${
                          selectedImage === i
                            ? "ring-2 ring-gold scale-[1.03] shadow-md"
                            : "ring-1 ring-gray-200 opacity-60 hover:opacity-100 hover:ring-gray-300"
                        }`}
                      >
                        <Image
                          src={img}
                          alt=""
                          width={72}
                          height={56}
                          className="w-16 h-12 sm:w-[72px] sm:h-14 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Tabs card (no overflow-clip so the inner tab bar can stick) ── */}
              <div className="bg-white rounded-[26px] sm:rounded-[32px] border border-gray-100 shadow-soft mx-4 sm:mx-0">
                {/* Sticky segmented tab bar */}
                <div className="sticky top-12 lg:top-[88px] z-20 bg-white/95 backdrop-blur-md border-b border-gray-100 px-2.5 sm:px-3 py-2.5 rounded-t-[26px] sm:rounded-t-[32px]">
                  <div className="grid grid-cols-4 gap-1 rounded-2xl bg-offwhite p-1">
                    {tabs.map(({ id: tabId, labelKey, icon: Icon, badge }) => {
                      const active = activeTab === tabId;
                      return (
                        <button
                          key={tabId}
                          onClick={() => setActiveTab(tabId as "description" | "updates" | "comments" | "info")}
                          className={`relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2.5 px-1 sm:px-3 rounded-xl text-[11px] sm:text-sm font-semibold transition-all ${
                            active
                              ? "bg-white text-burgundy shadow-soft ring-1 ring-black/5"
                              : "text-gray-500 hover:text-deep"
                          }`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-burgundy" : ""}`} />
                          <span className="truncate">{t(labelKey)}</span>
                          {badge !== undefined && badge > 0 && (
                            <span className={`absolute top-1 right-1 sm:static sm:ms-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                              active ? "bg-burgundy text-white" : "bg-gray-200 text-gray-500"
                            }`}>
                              {badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tab content */}
                <div className="p-5 sm:p-7">
                  {/* Section header — reflects the active tab */}
                  {(() => {
                    const meta = tabs.find((tb) => tb.id === activeTab);
                    if (!meta) return null;
                    const SectionIcon = meta.icon;
                    return (
                      <div className="mb-6 flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-burgundy/10 text-burgundy">
                          <SectionIcon className="w-[18px] h-[18px]" />
                        </span>
                        <div>
                          <h2 className="text-base sm:text-lg font-extrabold text-deep leading-none">{t(meta.labelKey)}</h2>
                          <div className="gold-mark-sm mt-2" />
                        </div>
                      </div>
                    );
                  })()}
                  <AnimatePresence mode="wait">

                    {/* Description */}
                    {activeTab === "description" && (
                      <motion.div key="desc" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {(() => {
                          const desc = getLocalizedProperty(campaign, "description") as string;
                          if (!desc) return null;
                          const trimmed = desc.trim();
                          if (trimmed.startsWith("{")) {
                            try {
                              const parsed = JSON.parse(trimmed);
                              if (parsed?.type === "doc") {
                                return (
                                  <div className="prose max-w-none [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:p-0 [&_.ProseMirror]:focus:outline-none">
                                    <WysiwygEditor defaultValue={parsed} isEditable={false} className="border-0 shadow-none p-0 min-h-0" />
                                  </div>
                                );
                              }
                            } catch {}
                          }
                          return (
                            <div className="relative ps-5 border-s-[3px] border-gold/50">
                              <p className="text-gray-700 text-sm sm:text-base leading-relaxed sm:leading-loose whitespace-pre-line">
                                {desc}
                              </p>
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}

                    {/* Updates */}
                    {activeTab === "updates" && (
                      <motion.div key="updates" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-3.5">
                        {campaign.updates?.length > 0 ? campaign.updates.map((update, i) => (
                          <motion.div key={update.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                            className="flex gap-4 p-4 rounded-2xl bg-offwhite/60 border border-gray-100 hover:border-burgundy/20 transition-colors">
                            <div className="flex-shrink-0">
                              <div className="w-9 h-9 rounded-full bg-burgundy/10 flex items-center justify-center ring-4 ring-burgundy/5">
                                <Bell className="w-4 h-4 text-burgundy" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-0.5">
                                {getLocalizedProperty(update, "title")}
                              </h3>
                              <p className="text-xs text-gray-400 flex items-center gap-1 mb-2">
                                <Clock className="w-3 h-3" />
                                {fmtDate(update.createdAt)}
                              </p>
                              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line mb-3">
                                {getLocalizedProperty(update, "description")}
                              </p>
                              {/* Inline video embed */}
                              {update.videoUrl && (
                                <VideoEmbed
                                  rawUrl={update.videoUrl}
                                  title={getLocalizedProperty(update, "title") || "video"}
                                  className="rounded-xl overflow-hidden bg-black mb-3"
                                />
                              )}
                              {/* Image thumbnail */}
                              {update.image && (
                                <button
                                  onClick={() => { setModalContent({ type: "image", src: update.image!, alt: getLocalizedProperty(update, "title") }); setIsModalOpen(true); }}
                                  className="group relative rounded-xl overflow-hidden ring-1 ring-gray-200 hover:ring-[#A5243D] transition-all"
                                >
                                  <Image src={update.image} alt="" width={96} height={96} className="w-24 h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )) : (
                          <div className="text-center py-12">
                            <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">{t("noUpdates")}</p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* Comments */}
                    {activeTab === "comments" && (
                      <motion.div key="comments" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {/* Add comment */}
                        <div className="mb-5">
                          {session ? (
                            <form onSubmit={handleAddComment} className="flex gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200 focus-within:border-[#A5243D]/40 focus-within:ring-2 focus-within:ring-[#A5243D]/10 transition-all">
                              <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                                <AvatarImage src={session.user?.image || ""} />
                                <AvatarFallback className="bg-[#A5243D]/10 text-[#A5243D] text-xs font-bold">
                                  {session.user?.name?.[0] || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <Textarea
                                  value={newComment}
                                  onChange={e => setNewComment(e.target.value)}
                                  placeholder={t("commentPlaceholder")}
                                  className="w-full resize-none border-none shadow-none focus-visible:ring-0 text-sm bg-transparent p-0 min-h-[40px]"
                                  rows={2}
                                />
                                <div className="flex justify-end mt-2">
                                  <Button type="submit" disabled={!newComment.trim() || isSubmitting} size="sm"
                                    className="bg-[#A5243D] hover:bg-[#7D1830] text-white h-8 gap-1.5 rounded-lg">
                                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    {t("send")}
                                  </Button>
                                </div>
                              </div>
                            </form>
                          ) : (
                            <button onClick={() => setIsSignInOpen(true)}
                              className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl p-3.5 text-sm text-gray-500 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                <MessageCircle className="w-4 h-4 text-gray-400" />
                              </div>
                              <span>{t("signInToComment")}</span>
                            </button>
                          )}
                        </div>

                        {/* Comments list */}
                        <div className="space-y-1">
                          {comments.length > 0 ? comments.map((comment, i) => (
                            <motion.div key={comment.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                              className="flex gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                              <Avatar className="w-8 h-8 flex-shrink-0">
                                <AvatarImage src={comment.user.image} />
                                <AvatarFallback className="text-xs font-bold bg-gray-100 text-gray-600">
                                  {comment.user.name[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-900">{comment.user.name}</span>
                                    <span className="text-[11px] text-gray-400">{new Date(comment.createdAt).toLocaleDateString(locale === "ar" ? "ar-SA" : locale === "fr" ? "fr-FR" : "en-US")}</span>
                                  </div>
                                  {session?.user?.email === comment.user.email && (
                                    <div className="relative flex-shrink-0">
                                      <button onClick={() => setOpenDropdownId(openDropdownId === comment.id ? null : comment.id)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all">
                                        <MoreHorizontal className="w-4 h-4" />
                                      </button>
                                      {openDropdownId === comment.id && (
                                        <div className="absolute end-0 mt-1 w-40 bg-white border border-gray-100 rounded-xl shadow-lg z-20 overflow-hidden">
                                          <button onClick={() => { setEditingComment(comment.id); setEditText(comment.text); setOpenDropdownId(null); }}
                                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                            <Edit2 className="w-3.5 h-3.5" />{t("edit")}
                                          </button>
                                          <button onClick={() => { handleDeleteComment(comment.id); setOpenDropdownId(null); }}
                                            className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />{t("delete")}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {editingComment === comment.id ? (
                                  <div>
                                    <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="mb-2 text-sm" rows={2} />
                                    <div className="flex gap-2">
                                      <Button onClick={() => handleEditComment(comment.id)} disabled={isSubmitting} size="sm" className="bg-[#A5243D] hover:bg-[#7D1830] text-white h-8">
                                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("save")}
                                      </Button>
                                      <Button variant="outline" size="sm" onClick={() => setEditingComment(null)} className="h-8">{t("cancel")}</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-700 leading-relaxed">{comment.text}</p>
                                )}
                              </div>
                            </motion.div>
                          )) : (
                            <div className="text-center py-12">
                              <MessageCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                              <p className="text-gray-400 text-sm">{t("noComments")}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Info */}
                    {activeTab === "info" && (
                      <motion.div key="info" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="relative overflow-hidden rounded-2xl border border-burgundy/10 bg-gradient-to-br from-burgundy/[0.07] to-burgundy/[0.02] p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-burgundy/10 text-burgundy">
                                <Users className="w-4 h-4" />
                              </span>
                              <span className="text-[11px] font-bold uppercase tracking-wide text-burgundy">{t("donor")}</span>
                            </div>
                            <span className="text-2xl sm:text-3xl font-extrabold text-deep tabular-nums">{campaign.donationCount.toLocaleString()}</span>
                          </div>
                          <div className="relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.12] to-gold/[0.03] p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gold/20" style={{ color: "#9a7727" }}>
                                <TrendingUp className="w-4 h-4" />
                              </span>
                              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#9a7727" }}>{t("completed")}</span>
                            </div>
                            <span className="text-2xl sm:text-3xl font-extrabold text-deep tabular-nums">{campaign.progress.toFixed(0)}%</span>
                          </div>
                        </div>

                        {/* Top donors */}
                        {/* {campaign.donationStats && (campaign.donationStats.first || campaign.donationStats.largest || campaign.donationStats.last) && (
                          <div>
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">{t("topDonors")}</h3>
                            <div className="space-y-2">
                              {[
                                { stat: campaign.donationStats.first, label: t("firstDonor"), icon: Star, color: "text-amber-500 bg-amber-50" },
                                { stat: campaign.donationStats.largest, label: t("largestDonor"), icon: Trophy, color: "text-[#A5243D] bg-[#A5243D]/8" },
                                { stat: campaign.donationStats.last, label: t("latestDonor"), icon: Heart, color: "text-rose-500 bg-rose-50" },
                              ].filter(d => d.stat).map(({ stat, label, icon: Icon, color }) => (
                                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] text-gray-400 font-medium">{label}</p>
                                    <p className="text-sm font-bold text-gray-900 truncate">{stat!.donor}</p>
                                  </div>
                                  <span className="text-sm font-bold text-[#A5243D] flex-shrink-0">{stat!.amount.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )} */}
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>
              </div>

              {/* ── Campaign video ── */}
              {campaign.videoUrl && (
                <VideoEmbed
                  rawUrl={campaign.videoUrl}
                  title={String(campaign.title ?? "")}
                  className="mx-4 sm:mx-0 rounded-2xl sm:rounded-3xl overflow-hidden shadow-soft ring-1 ring-black/5 bg-black"
                />
              )}
            </div>

            {/* ── Right sidebar (desktop + tablet stacked) ── */}
            <div className="lg:col-span-4 max-sm:hidden px-4 sm:px-0 mt-2 lg:mt-0">
              <DonationSidebar campaign={campaign} />
            </div>
          </div>

          {/* ── Suggested campaigns from the same category ── */}
          {campaign.category?.id && (
            <div className="mt-6 sm:mt-10">
              <SuggestedCampaigns
                categoryId={campaign.category.id}
                currentCampaignId={campaign.id}
                categoryName={getLocalizedProperty(campaign.category, "name")}
                categorySlug={campaign.category.slug ?? campaign.category.id}
                categoryIcon={campaign.category.icon}
              />
            </div>
          )}
        </div>

        {/* Mobile sticky donate bar */}
        <div className="sm:hidden">
          <DonationSidebar campaign={campaign} isMobileSticky />
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} content={modalContent} />
      <SignInDialog isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
    </>
  );
};

// Loading Skeleton
const LoadingSkeleton = () => (
  <div className="min-h-screen bg-offwhite/60 pb-28 sm:pb-12">
    <div className="max-w-7xl mx-auto px-4 sm:py-8">
      <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">

        {/* Left column */}
        <div className="lg:col-span-8 flex flex-col gap-5 sm:gap-6 pt-5 sm:pt-0">

          {/* Editorial header skeleton */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="h-7 w-24 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-7 w-20 bg-gray-200 rounded-full animate-pulse" />
            </div>
            <div className="h-9 w-11/12 bg-gray-200 rounded-lg animate-pulse" />
            <div className="h-9 w-3/4 bg-gray-200 rounded-lg animate-pulse" />
          </div>

          {/* Hero image skeleton */}
          <div className="rounded-2xl sm:rounded-3xl overflow-hidden bg-gray-200 animate-pulse aspect-[4/3] sm:aspect-[16/10] w-full" />

          {/* Tabs card skeleton */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="grid grid-cols-4 gap-1 p-2 sm:p-3 border-b border-gray-100">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-9 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="p-5 sm:p-7 space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className={`h-3.5 bg-gray-100 rounded-full animate-pulse ${
                  i === 3 ? "w-4/5" : i === 5 ? "w-2/3" : i === 6 ? "w-3/4" : "w-full"
                }`} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="lg:col-span-4 hidden lg:block">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-soft overflow-hidden">
            <div className="h-1.5 w-full bg-gray-200" />
            <div className="p-7 space-y-4">
              <div className="h-10 bg-gray-200 rounded-lg animate-pulse w-3/5" />
              <div className="h-2.5 bg-gray-100 rounded-full animate-pulse w-full" />
              <div className="h-12 bg-gray-100 rounded-2xl animate-pulse" />
              <div className="h-14 bg-gray-200 rounded-2xl animate-pulse mt-2" />
              <div className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
);

export default IntegratedCampaignPage;
