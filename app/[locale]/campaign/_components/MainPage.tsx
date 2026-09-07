"use client";

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Edit2,
  Trash2,
  Send,
  Loader2,
  MoreHorizontal,
  Play,
  Twitter,
  Facebook,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import Modal from "@/app/[locale]/components/Modal";
import { useCurrency } from "@/context/CurrencyContext";
import SignInDialog from "@/components/SignInDialog";
import DonationSidebar from "../_components/DonationSidebar";

// Types
interface Category {
  name: string;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  images: string[];
  targetAmount: number;
  amountRaised: number;
  donationCount: number;
  progress: number;
  category: Category;
  donationStats: {
    first: DonationStat | null;
    largest: DonationStat | null;
    last: DonationStat | null;
  };
  updates: Array<{
    id: string;
    title: string;
    description: string;
    image: string | null;
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
  };
}

export const dummyCampaign = {
  id: "camp_123456",
  title: "مساعدة عائلة أبو أحمد لبناء منزل جديد",
  description: "السلام عليكم ورحمة الله وبركاته، نحن نجمع التبرعات لمساعدة عائلة أبو أحمد المكونة من 7 أفراد لبناء منزل جديد بعد أن تهدم منزلهم القديم بسبب الأمطار الغزيرة الشتاء الماضي. العائلة تعيش حالياً في منزل مستأجر صغير لا يكفي احتياجاتهم، والأب يعمل بجد كعامل بناء لكن دخله لا يكفي لتوفير تكاليف البناء. نحتاج لبناء منزل مكون من 3 غرف ومطبخ وحمامين على مساحة 150 متر مربع. المبلغ المطلوب يشمل تكاليف مواد البناء والعمالة والتشطيبات الأساسية. كل مساهمة مهما كانت صغيرة ستساعد هذه العائلة على العيش بكرامة تحت سقف منزلهم الخاص. جزاكم الله خيراً على كل مساعدة.",
  images: [
    "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800"
  ],
  targetAmount: 150000,
  amountRaised: 87500,
  donationCount: 234,
  progress: 58.3,
  category: {
    name: "إسكان"
  },
  donationStats: {
    first: {
      amount: 500,
      donor: "محمد العلي"
    },
    largest: {
      amount: 10000,
      donor: "متبرع كريم"
    },
    last: {
      amount: 1000,
      donor: "فاطمة أحمد"
    }
  },
  updates: [
    {
      id: "update_1",
      title: "بدء أعمال صب الأساسات",
      description: "الحمد لله، بفضل تبرعاتكم الكريمة تمكنا من البدء بأعمال صب الأساسات للمنزل. فريق العمل بدأ العمل منذ أسبوع والعمل يسير بشكل ممتاز. أبو أحمد وعائلته سعداء جداً ويدعون لكم جميعاً بالخير والبركة. نحتاج لمزيد من الدعم لإتمام المرحلة القادمة وهي بناء الجدران. بارك الله فيكم وجزاكم عنا خير الجزاء.",
      image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800",
      createdAt: "2024-01-18T09:30:00Z"
    },
    {
      id: "update_2",
      title: "وصلنا لنصف المبلغ المطلوب!",
      description: "بشرى سارة! وصلنا إلى 50% من المبلغ المستهدف بفضل كرمكم وتبرعاتكم السخية. أكثر من 200 متبرع ساهموا حتى الآن، وهذا شيء رائع يدل على تكاتف المجتمع. عائلة أبو أحمد لا تجد الكلمات للتعبير عن امتنانها وشكرها لكم. نرجو منكم الاستمرار في الدعم ومشاركة الحملة مع أصدقائكم وعائلاتكم. كل ريال يُحدث فرقاً كبيراً.",
      image: null,
      createdAt: "2024-01-12T15:20:00Z"
    },
    {
      id: "update_3",
      title: "شراء الأرض وتجهيزها",
      description: "السلام عليكم، نحمد الله على نجاح الحملة في بدايتها. تمكنا من شراء قطعة الأرض المناسبة في حي هادئ وآمن بمساحة 200 متر مربع. تم تنظيف الأرض وتسويتها وحصلنا على تصريح البناء من البلدية. المرحلة القادمة ستكون البدء في حفر الأساسات. شكراً لكل من ساهم ودعم، ونسأل الله أن يجعله في ميزان حسناتكم.",
      image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800",
      createdAt: "2024-01-05T10:15:00Z"
    },
    {
      id: "update_4",
      title: "إطلاق الحملة - نداء للمساعدة",
      description: "بسم الله الرحمن الرحيم، نطلق اليوم حملة لمساعدة عائلة أبو أحمد الكريمة. هذه عائلة محتاجة ومستحقة للمساعدة، وقد تحققنا من وضعهم بأنفسنا. الأب رجل صالح يعمل بجد لتأمين لقمة العيش لأطفاله، لكنه لا يستطيع توفير تكاليف بناء منزل بمفرده. ندعوكم للمشاركة في هذا العمل الخيري ومد يد العون لهذه العائلة. اللهم اجعلها صدقة جارية لكل من ساهم.",
      image: null,
      createdAt: "2024-01-01T08:00:00Z"
    }
  ]
};

// تعليقات وهمية باللغة العربية
export const dummyComments = [
  {
    id: "comment_1",
    text: "ما شاء الله، مبادرة رائعة. تبرعت بمبلغ بسيط وأدعو الله أن يبارك في هذا العمل. نسأل الله أن يوفقكم ويعينكم على إتمام المشروع. 🤲",
    createdAt: "2024-01-19T11:30:00Z",
    user: {
      name: "عبدالله السالم",
      image: "https://i.pravatar.cc/150?img=11"
    }
  },
  {
    id: "comment_2",
    text: "بارك الله فيكم على هذا العمل الطيب. ساهمت بما استطعت وأسأل الله أن يجعله في ميزان حسناتنا جميعاً. جزاكم الله خيراً 💚",
    createdAt: "2024-01-18T16:45:00Z",
    user: {
      name: "نورة المطيري",
      image: "https://i.pravatar.cc/150?img=12"
    }
  },
  {
    id: "comment_3",
    text: "اللهم بارك، شاركت الحملة مع كل أصدقائي وعائلتي. نسأل الله أن يعين عائلة أبو أحمد ويفرج كربهم. إن شاء الله نرى المنزل مكتمل قريباً 🏠",
    createdAt: "2024-01-17T09:20:00Z",
    user: {
      name: "خالد الأحمد",
      image: "https://i.pravatar.cc/150?img=13"
    }
  },
  {
    id: "comment_4",
    text: "تبرعت والحمد لله. هل يمكن زيارة الموقع لمن يرغب في التطوع بالمساعدة في البناء؟ أنا جاهز للمساعدة في أيام العطلة.",
    createdAt: "2024-01-16T14:10:00Z",
    user: {
      name: "سعد الغامدي",
      image: "https://i.pravatar.cc/150?img=14"
    }
  },
  {
    id: "comment_5",
    text: "جزاكم الله خيراً على الأخبار المستمرة. نشعر بالاطمئنان عندما نرى تقدم العمل. ربي يوفقكم ويسهل أموركم جميعاً 🌟",
    createdAt: "2024-01-15T19:30:00Z",
    user: {
      name: "مريم العتيبي",
      image: "https://i.pravatar.cc/150?img=15"
    }
  },
  {
    id: "comment_6",
    text: "الله يجزيكم خير. حملة مميزة وواضحة. تبرعت اليوم وإن شاء الله نتبرع مرة ثانية الشهر القادم بإذن الله.",
    createdAt: "2024-01-14T12:45:00Z",
    user: {
      name: "أحمد الشمري",
      image: "https://i.pravatar.cc/150?img=16"
    }
  },
  {
    id: "comment_7",
    text: "ربنا يبارك فيكم ويجعله في ميزان حسناتكم. شيء جميل أن نرى الناس تساعد بعضها. الله يعطيكم يدي جيهان على الجهود المبذولة 🙏",
    createdAt: "2024-01-13T08:15:00Z",
    user: {
      name: "ليلى الحربي",
      image: "https://i.pravatar.cc/150?img=17"
    }
  },
  {
    id: "comment_8",
    text: "ما شاء الله تبارك الله، الحمد لله على التقدم الممتاز. نسأل الله أن يتم المشروع على خير ويرزقكم الأجر والثواب.",
    createdAt: "2024-01-11T17:20:00Z",
    user: {
      name: "يوسف القحطاني",
      image: "https://i.pravatar.cc/150?img=18"
    }
  }
];

const MainPage = ({ id, locale }: {id:string; locale?: string}) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<{
    type: "image" | "video";
    src: string;
    alt?: string;
  } | null>(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [showDescriptionButton, setShowDescriptionButton] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isUpdateExpanded, setIsUpdateExpanded] = useState<{
    [key: string]: boolean;
  }>({});
  const updateRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Compute effective locale (prop -> router locale)
  const propLocale = locale;

  // Fetch campaign data
  useEffect(() => {
    const fetchCampaignData = async () => {
      try {
        const headers: Record<string, string> = {};
        if (propLocale) headers['x-locale'] = propLocale;

        const response = await axios.get<Campaign>(`/api/campaigns/${id}`, { headers });
        if (!response.data) {
          throw new Error("Campaign not found");
        }
        setCampaign(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    };

    fetchCampaignData();
  }, [id, locale]);

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      try {
        const response = await axios.get(`/api/campaigns/${id}/comments`);
        setComments(response.data);
      } catch (error) {
        console.error("Error fetching comments:", error);
        toast.error("فشل في تحميل التعليقات");
      }
    };

    fetchComments();
  }, [id]);

  // Check if description needs a "Show More" button
  useEffect(() => {
    if (descriptionRef.current) {
      setShowDescriptionButton(descriptionRef.current.scrollHeight > 400);
    }

    campaign?.updates?.forEach((update) => {
      if (updateRefs.current[update.id]) {
        const shouldShowButton =
          updateRefs.current[update.id]?.scrollHeight! > 150;
        setIsUpdateExpanded((prev) => ({
          ...prev,
          [update.id]: prev[update.id] || false,
        }));
      }
    });
  }, [campaign]);

  // Add a comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await axios.post(`/api/campaigns/${id}/comments`, {
        text: newComment,
      });
      setComments([response.data, ...comments]);
      setNewComment("");
      toast.success("تم إضافة التعليق بنجاح");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("فشل في إضافة التعليق");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit a comment
  const handleEditComment = async (commentId: string) => {
    if (!editText.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await axios.patch(
        `/api/campaigns/${id}/comments/${commentId}`,
        {
          text: editText,
        }
      );
      setComments(
        comments.map((comment) =>
          comment.id === commentId ? response.data : comment
        )
      );
      setEditingComment(null);
      toast.success("تم تحديث التعليق بنجاح");
    } catch (error) {
      console.error("Error updating comment:", error);
      toast.error("فشل في تحديث التعليق");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete a comment
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا التعليق؟")) return;

    try {
      await axios.delete(`/api/campaigns/${id}/comments/${commentId}`);
      setComments(comments.filter((comment) => comment.id !== commentId));
      toast.success("تم حذف التعليق بنجاح");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("فشل في حذف التعليق");
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold text-gray-800 mb-4">
            لم يتم العثور على الحملة
          </h2>
          <p className="text-gray-600 mb-8">
            {error || "الحملة التي تبحث عنها غير موجودة."}
          </p>
          <Button
            onClick={() => window.history.back()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            العودة
          </Button>
        </div>
      </div>
    );
  }



  return (
    <>
    <main className="min-h-screen bg-[#fefefe] relative">

      {/* Campaign Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="overflow-hidden shadow-lg sm:hidden"
      >
        <img
          src={campaign.images[0] || "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"}
          alt={`${campaign.title} - Campaign Image`}
          className="w-full h-[500px] max-sm:h-[300px] object-cover transform"
        />
      </motion.div>

      <div className="max-w-7xl mx-auto px-4 max-sm:px-3 max-sm:py-3 py-8">
                <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-sm:hidden flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4"
        >
          <div className="flex gap-x-4 items-center w-full">
            <span className="inline-block bg-gradient-to-r from-sky-400 to-sky-600 text-white text-sm px-3 py-1 rounded-full">
              {campaign.category.name}
            </span>
            <h1 className="text-3xl font-semibold text-stone-800">
              {campaign.title}
            </h1>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-8">
            {/* Main Image */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-sm:hidden rounded-2xl overflow-hidden mb-6 max-sm:mb-4 shadow-lg"
            >
              <img
                src={campaign.images[0] || "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"}
                alt={`${campaign.title} - Campaign Image`}
                className="w-full h-[500px] max-sm:h-[300px] object-cover transform"
              />
            </motion.div>

            <div className="sm:hidden">
              <span className="inline-block bg-gradient-to-r from-sky-400 to-sky-600 text-white text-[12px] px-2 py-[2px] rounded-full mb-2">
                {campaign.category.name}
              </span>
              <h1 className="text-3xl max-sm:text-2xl font-semibold text-stone-800">
                {campaign.title}
              </h1>
            </div>

            {/* Campaign Description */}
            <div className="prose prose-emerald max-w-none mb-8">
              <div
                ref={descriptionRef}
                className={`relative ${
                  !isDescriptionExpanded && showDescriptionButton
                    ? "max-h-[400px] overflow-hidden"
                    : ""
                }`}
              >
                <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                  {campaign.description}
                </p>
                {!isDescriptionExpanded && showDescriptionButton && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#fefefe] to-transparent" />
                )}
              </div>
              {showDescriptionButton && (
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-4 flex underline items-center gap-2 text-stone-700 hover:text-stone-500 transition-colors"
                >
                  {isDescriptionExpanded ? (
                    <></>
                  ) : (
                    <>
                      <span>عرض المزيد</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Image Gallery */}
            {campaign.images.length > 1 && (
              <>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {campaign.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setModalContent({ type: "image", src: image });
                        setIsModalOpen(true);
                      }}
                    >
                      <motion.img
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        src={image}
                        alt={`Gallery ${index + 2}`}
                        className="w-28 h-28 rounded-xl object-cover flex-shrink-0 cursor-pointer transition-all"
                      />
                    </button>
                  ))}
                </div>
                <div className="max-sm:hidden h-[1px] bg-stone-300 rounded-lg w-full my-6" />
              </>
            )}

            {/* Mobile Donation Sidebar */}
            <div className="sm:hidden">
              <DonationSidebar campaign={campaign} />
            </div>

            {/* Updates Section */}
            {campaign.updates && campaign.updates.length > 0 && (
              <>
                <div className="bg-[#fefefe] rounded-xl py-2 pb-4">
                  <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-emerald-600" />
                    أخبار الحملة
                    <span className="text-lg font-normal text-gray-500">
                      ({campaign.updates.length})
                    </span>
                  </h2>
                  <div className="space-y-8">
                    {campaign.updates.map((update) => (
                      <div
                        key={update.id}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <h3 className="font-bold text-xl text-gray-800 mb-2">
                          {update.title}
                        </h3>
                        <p className="text-emerald-600 text-sm mb-4">
                          {new Date(update.createdAt).toLocaleDateString(
                            "ar-SA"
                          )}
                        </p>
                        <div
                          ref={(el) => (updateRefs.current[update.id] = el)}
                          className={`relative ${
                            !isUpdateExpanded[update.id]
                              ? "max-h-[150px] overflow-hidden"
                              : ""
                          }`}
                        >
                          <p className="text-gray-700 mb-4 whitespace-pre-line">
                            {update.description}
                          </p>
                          {!isUpdateExpanded[update.id] &&
                            updateRefs.current[update.id]?.scrollHeight! >
                              150 && (
                              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#fefefe] to-transparent" />
                            )}
                        </div>
                        {updateRefs.current[update.id]?.scrollHeight! > 150 && (
                          <button
                            onClick={() =>
                              setIsUpdateExpanded((prev) => ({
                                ...prev,
                                [update.id]: !prev[update.id],
                              }))
                            }
                            className="mt-4 flex items-center text-sm gap-1 text-emerald-700 hover:text-emerald-500 transition-colors"
                          >
                            {isUpdateExpanded[update.id] ? (
                              <>
                                <ChevronUp className="w-4 h-4" />
                                <span>عرض أقل</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4" />
                                <span>عرض المزيد</span>
                              </>
                            )}
                          </button>
                        )}
                        <div className="flex gap-4 mt-4">
                          {update.image && (
                            <button
                              onClick={() => {
                                setModalContent({
                                  type: "image",
                                  src: update.image!,
                                  alt: update.title,
                                });
                                setIsModalOpen(true);
                              }}
                              className="relative group"
                            >
                              <img
                                src={update.image}
                                alt={update.title}
                                className="rounded-xl shadow-md w-28 h-28 object-cover group-hover:opacity-90 transition-opacity"
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity rounded-xl" />
                            </button>
                          )}
                          {update.videoUrl && (
                            <button
                              onClick={() => {
                                setModalContent({
                                  type: "video",
                                  src: `${update.videoUrl}?autoplay=1`,
                                });
                                setIsModalOpen(true);
                              }}
                              className="relative group"
                            >
                              <img
                                src={`https://img.youtube.com/vi/${
                                  new URL(update.videoUrl).pathname.split("/")[2]
                                }/hqdefault.jpg`}
                                alt="Video thumbnail"
                                className="rounded-xl shadow-md w-28 h-28 object-cover group-hover:opacity-90 transition-opacity"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-xl opacity-90 group-hover:opacity-100 transition-opacity">
                                <Play className="w-8 h-8 text-white" />
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-[1px] bg-stone-400 rounded-lg w-full my-6" />
              </>
            )}

            {/* Comments Section */}
            <div>
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <MessageCircle className="w-6 h-6 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-gray-800">
                    التعليقات
                  </h2>
                  <span className="text-sm text-gray-500">
                    ({comments.length})
                  </span>
                </div>

                {/* Add Comment Form */}
                {session ? (
                  <form
                    onSubmit={handleAddComment}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg shadow-sm p-3 transition-shadow"
                  >
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={session.user?.image || ""} />
                      <AvatarFallback className="bg-gray-100 text-gray-700">
                        {session.user?.name?.[0]}
                      </AvatarFallback>
                    </Avatar>

                    <div className="relative flex-1">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="اكتب تعليقك..."
                        className="w-full resize-none border-none focus:ring-0 text-sm p-2 pr-12 bg-gray-50 rounded-lg focus:bg-white transition-colors"
                        rows={1}
                        aria-label="تعليق جديد"
                      />

                      <button
                        type="submit"
                        disabled={isSubmitting || !newComment.trim()}
                        className="absolute flex justify-center items-center h-full rounded-l-lg w-12 left-0 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label="إرسال التعليق"
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg text-center mb-8">
                    <p className="text-gray-600 mb-2">
                      يجب تسجيل دخول لإضافة تعليق
                    </p>
                  </div>
                )}

                {/* Comments List */}
                <div className="space-y-6">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex gap-4 py-4 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={comment.user.image} />
                        <AvatarFallback>{comment.user.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="text-sm text-gray-500 mx-2">
                              {new Date(comment.createdAt).toLocaleDateString(
                                "en-US"
                              )}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {comment.user.name}
                            </span>
                          </div>
                          {session?.user?.email === comment.user.email && (
                            <div className="relative">
                              <button
                                className="p-2 text-gray-600 hover:text-gray-800"
                                onClick={() =>
                                  setOpenDropdownId(
                                    openDropdownId === comment.id
                                      ? null
                                      : comment.id
                                  )
                                }
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              {openDropdownId === comment.id && (
                                <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                  <button
                                    className="flex gap-2 w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                    onClick={() => {
                                      setEditingComment(comment.id);
                                      setEditText(comment.text);
                                      setOpenDropdownId(null);
                                    }}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                    تعديل
                                  </button>
                                  <button
                                    className="flex gap-2 w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-100"
                                    onClick={() => {
                                      handleDeleteComment(comment.id);
                                      setOpenDropdownId(null);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    حذف
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {editingComment === comment.id ? (
                          <div className="mt-2">
                            <Textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="mb-2"
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleEditComment(comment.id)}
                                disabled={isSubmitting}
                                size="sm"
                              >
                                {isSubmitting ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  "حفظ"
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingComment(null)}
                              >
                                إلغاء
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-700">{comment.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="max-sm:hidden col-span-4">
            <div className="sticky top-32">
              <DonationSidebar campaign={campaign} />
            </div>
          </div>
        </div>
      </div>

      {/* Modal for image/video preview */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        content={modalContent}
      />
    </main>
    </>
  );
};

// Loading Skeleton Component
const LoadingSkeleton = () => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white">
    <div className="max-w-7xl mx-auto px-4 py-8 max-sm:py-4">
      <div className="mb-8">
        <div className="h-8 w-28 bg-gray-200 rounded-full mb-2 animate-pulse" />
        <div className="h-12 w-96 bg-gray-200 rounded-lg animate-pulse" />
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <div className="w-full h-[500px] rounded-2xl bg-gray-200 mb-6 animate-pulse" />
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-gray-200 animate-pulse"
              />
            ))}
          </div>
          <div className="w-full h-96 rounded-xl bg-gray-200 animate-pulse" />
        </div>

        <div className="lg:col-span-4">
          <div className="w-full h-64 rounded-xl bg-gray-200 mb-6 animate-pulse" />
          <div className="w-full h-96 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    </div>
  </div>
);

export default MainPage;