import React, { useState, useEffect } from "react";
import { useCurrency } from "@/context/CurrencyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Heart,
  TrendingUp,
  Clock,
  AlertCircle,
  Shield,
  Gift,
  Star,
  Sparkles,
  Zap,
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { getCurrency } from "@/hooks/useCampaignValue";
import { motion } from "framer-motion";

const formatNumber = (num: number) => {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Enhanced Decorative SVG
const DecorativeSVG = ({ isMain = false }) => (
  <svg
    className={`absolute top-0 right-0 ${
      isMain ? "w-64 h-64" : "w-40 h-40"
    } text-emerald-500/10 transform -rotate-12`}
    viewBox="0 0 100 100"
  >
    <defs>
      <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#059669" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#10B981" stopOpacity="0.1" />
      </linearGradient>
    </defs>
    <path
      d="M50 0C77.6142 0 100 22.3858 100 50C100 77.6142 77.6142 100 50 100C22.3858 100 0 77.6142 0 50C0 22.3858 22.3858 0 50 0ZM50 10C27.9086 10 10 27.9086 10 50C10 72.0914 27.9086 90 50 90C72.0914 90 90 72.0914 90 50C90 27.9086 72.0914 10 50 10Z"
      fill="url(#gradient)"
    />
    <path
      d="M50 20C63.2548 20 74 30.7452 74 44C74 57.2548 63.2548 68 50 68C36.7452 68 26 57.2548 26 44C26 30.7452 36.7452 20 50 20ZM50 26C40.0589 26 32 34.0589 32 44C32 53.9411 40.0589 62 50 62C59.9411 62 68 53.9411 68 44C68 34.0589 59.9411 26 50 26Z"
      fill="url(#gradient)"
    />
  </svg>
);

// Enhanced Urgency Badge with pulse animation
const UrgencyBadge = () => (
  <div className="absolute top-4 right-4 bg-gradient-to-r from-rose-600 to-red-500 text-white px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg z-10">
    <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-red-500 rounded-full blur-sm animate-pulse" />
    <Zap size={16} className="text-yellow-300 animate-pulse" />
    <span className="text-sm font-bold relative">عاجل</span>
  </div>
);

// Enhanced Progress Bar with animation
const AnimatedProgressBar = ({ percentage }) => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setTimeout(() => {
      setWidth(percentage);
    }, 100);
  }, [percentage]);

  return (
    <div className="w-full bg-gray-200/20 rounded-full h-3 backdrop-blur-sm overflow-hidden">
      <div
        className="h-full rounded-full relative bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-1000 ease-out"
        style={{ width: `${width}%` }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="w-full h-full opacity-30">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="absolute h-full w-10 bg-white/50 skew-x-[45deg] animate-shimmer"
                style={{
                  left: `${i * 80}px`,
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Card with hover and animation effects
const CampaignCard = ({ campaign, isMain = false, index = 0 }) => {
  const { convertToCurrency } = useCurrency();
  const progressPercentage = Math.min(
    (campaign.currentAmount / campaign.targetAmount) * 100,
    100
  );

  const variants = {
    hidden: { 
      opacity: 0, 
      y: 20,
    },
    visible: (i) => ({ 
      opacity: 1, 
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
      }
    })
  };

  return (
    <motion.div
      className="h-full"
      initial="hidden"
      animate="visible"
      custom={index}
      variants={variants}
    >
      <svg
  xmlns="http://www.w3.org/2000/svg"
  className="w-full h-full absolute top-0 left-0 z-0 opacity-20"
  viewBox="0 0 1000 120"
  preserveAspectRatio="none"
>
  <rect fill="#fff" width="1000" height="120" /> {/* gray-100 for the background */}
  <g fill="none" stroke="#e0e0e0" strokeWidth="7.7" strokeOpacity="0.64"> {/* gray-300 for the waves */}
    <path d="M-500 75c0 0 125-30 250-30S0 75 0 75s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
    <path d="M-500 45c0 0 125-30 250-30S0 45 0 45s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
    <path d="M-500 105c0 0 125-30 250-30S0 105 0 105s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
    <path d="M-500 15c0 0 125-30 250-30S0 15 0 15s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
    <path d="M-500-15c0 0 125-30 250-30S0-15 0-15s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
    <path d="M-500 135c0 0 125-30 250-30S0 135 0 135s125 30 250 30s250-30 250-30s125-30 250-30s250 30 250 30s125 30 250 30s250-30 250-30" />
  </g>
</svg>
      <Card
        className={`group overflow-hidden transition-all duration-500 border-0 h-full relative bg-white/90 backdrop-blur-sm z-20 ${
          isMain 
            ? "hover:shadow-[0_15px_60px_-15px_rgba(16,185,129,0.5)]"
            : "hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.4)]"
        }`}
      >
        <CardContent className="p-0 h-full relative">
          <DecorativeSVG isMain={isMain} />
          <Link
            href={`/campaign/${campaign.slug || campaign.id}`}
            className="relative cursor-pointer flex flex-col h-full"
            role="button"
            tabIndex={0}
          >
            <div className={`relative ${isMain ? "h-full" : "h-full"}`}>
              {/* Radial gradient overlay for image */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 to-transparent z-[1]" />
              
              <img
                src={campaign.images[0]}
                alt={campaign.title}
                className={`w-full h-full object-cover transition-all duration-700 ${
                  isMain 
                    ? "hover:scale-105 filter hover:brightness-110" 
                    : "group-hover:scale-105 filter group-hover:brightness-105"
                }`}
                loading="lazy"
              />
              <div
                className={`absolute inset-0 z-[2] ${
                  isMain
                    ? "bg-gradient-to-t from-black/90 via-black/50 to-transparent"
                    : "bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-80 group-hover:opacity-100"
                } transition-all duration-500`}
              />

              {isMain && (
                <>
                  <UrgencyBadge />
                  <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 lg:p-8 text-white z-10">
                    <div className="flex items-center gap-2 mb-4 max-sm:hidden">
                      <div className="relative">
                        <div className="absolute inset-0 bg-emerald-400 blur-md opacity-30 rounded-full animate-pulse" />
                      </div>
                      <span className="flex gap-1 items-center justify-center text-xs bg-emerald-500/30 backdrop-blur-sm px-3 py-1 rounded-full border border-emerald-500/20">
                        <Shield className="text-white relative" size={12} />
                        حملة موثوقة
                      </span>
                      <span className="text-xs bg-yellow-500/30 backdrop-blur-sm px-3 py-1 rounded-full border border-yellow-500/20 flex items-center gap-1">
                        <Star size={12} className="text-yellow-400" />
                        مميزة
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-4 leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300">
                      {campaign.title}
                    </h2>
                    <p className="text-xs sm:text-sm md:text-base lg:text-lg mb-6 line-clamp-2 text-gray-100 max-sm:hidden">
                      {campaign.description || "ساعدنا في تحقيق هدفنا من خلال تبرعك الكريم"}
                    </p>
                    
                    <div className="flex flex-wrap gap-6 md:gap-8 mb-6">
                      <div className="flex items-center gap-3 group/stat">
                        <div className="relative">
                          <div className="absolute inset-0 bg-rose-500 rounded-full blur-md opacity-0 group-hover/stat:opacity-30 transition-opacity" />
                          <Heart size={24} className="text-rose-500 group-hover/stat:scale-110 transition-transform" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-base md:text-lg max-sm:text-sm font-bold group-hover/stat:text-rose-300 transition-colors">
                            {getCurrency()}
                            {formatNumber(convertToCurrency(campaign.currentAmount).convertedValue)}
                          </span>
                          <span className="text-xs md:text-sm text-gray-300">تم جمعها</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 group/stat">
                        <div className="relative">
                          <div className="absolute inset-0 bg-emerald-400 rounded-full blur-md opacity-0 group-hover/stat:opacity-30 transition-opacity" />
                          <Users size={24} className="text-emerald-400 group-hover/stat:scale-110 transition-transform" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-base md:text-lg max-sm:text-sm font-bold group-hover/stat:text-emerald-300 transition-colors">
                            {campaign.donationCount}
                          </span>
                          <span className="text-xs md:text-sm text-gray-300">تبرعات</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 group/stat">
                        <div className="relative">
                          <div className="absolute inset-0 bg-yellow-400 rounded-full blur-md opacity-0 group-hover/stat:opacity-30 transition-opacity" />
                          <Gift size={24} className="text-yellow-400 group-hover/stat:scale-110 transition-transform" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-base md:text-lg max-sm:text-sm font-bold group-hover/stat:text-yellow-300 transition-colors">
                            {getCurrency()}
                            {formatNumber(convertToCurrency(campaign.targetAmount - campaign.currentAmount).convertedValue)}
                          </span>
                          <span className="text-xs md:text-sm text-gray-300">متبقي</span>
                        </div>
                      </div>
                    </div>
                    
                    <AnimatedProgressBar percentage={progressPercentage} />
                    
                    <div className="flex justify-between items-center mt-4 text-xs sm:text-sm">
                      <span className="font-medium flex items-center gap-1">
                        <Sparkles size={16} className="text-emerald-400" />
                        {progressPercentage.toFixed(0)}% تم تحقيقها
                      </span>
                      <span className="text-rose-400 font-medium flex items-center gap-1">
                        <Clock size={16} className="animate-pulse" />
                        متبقي {campaign.daysLeft} أيام فقط
                      </span>
                    </div>
                  </div>
                </>
              )}

              {!isMain && (
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1 z-10 shadow-sm group-hover:bg-emerald-50 transition-colors">
                  <Users size={12} className="text-emerald-600" />
                  <span>{campaign.donationCount} تبرعات</span>
                </div>
              )}
            </div>

            {!isMain && (
              <div className="p-3 md:p-4 flex flex-col flex-grow">
                <h3 className="text-sm md:text-base truncate font-semibold text-gray-900 mb-2 group-hover:text-emerald-700 transition-colors">
                  {campaign.title}
                </h3>

                <div className="mt-auto space-y-3">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span className="font-bold text-xs md:text-sm text-emerald-700 flex items-center gap-1">
                      <Heart size={14} className="text-rose-500" />
                      {getCurrency()}
                      {formatNumber(
                        convertToCurrency(campaign.currentAmount).convertedValue
                      )}
                    </span>
                    <span className="font-bold text-xs md:text-sm text-gray-700">
                      {getCurrency()}
                      {formatNumber(
                        convertToCurrency(campaign.targetAmount).convertedValue
                      )}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <AnimatedProgressBar percentage={progressPercentage} />
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <TrendingUp size={14} className="text-emerald-500" />
                        <span>{progressPercentage.toFixed(0)}% تم تحقيقها</span>
                      </div>
                      <div className="flex items-center gap-1 text-rose-500">
                        <Clock size={14} />
                        <span>{campaign.daysLeft} أيام</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Link>
        </CardContent>
      </Card>
    </motion.div>
  );
};

// Main Component with enhanced styling
const CampaignsDisplay = ({ campaigns }) => {
  const mainCampaign = campaigns[0];
  const otherCampaigns = campaigns.slice(1, 5);

  return (
    <div className="w-full mx-auto relative">
      
      <div className="max-w-full mx-auto py-8 px-4 relative">
        <div className="max-w-7xl mx-auto">

        <div className="max-w-2xl mb-4 md:mb-6 lg:mb-8 relative z-20">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-700 to-emerald-500 mb-2 flex items-center gap-2">
            <Sparkles className="text-emerald-500" />
            الحملات العاجلة والمميزة
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-gray-600">
            انضم إلينا لإحداث فرق. كل تبرع يساهم في تحقيق تغيير إيجابي في حياة
            المحتاجين.
          </p>
          
          {/* Decorative underline */}
          {/* <div className="mt-4 w-32 h-1 bg-gradient-to-r from-teal-600 to-emerald-400 rounded-full"></div> */}
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-12 md:py-16">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-8 shadow-xl">
              <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-base md:text-lg text-gray-500">
                لا توجد حملات متاحة في الوقت الحالي.
              </p>
            </div>
          </div>
        ) : (
          
            
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 min-h-[400px] md:min-h-[500px]">
            <div className="lg:col-span-1 h-full">
              <CampaignCard
                campaign={{
                  ...mainCampaign,
                  description:
                    "حملة عاجلة تحتاج دعمكم. كل تبرع يساهم في إنقاذ حياة وصنع الأمل لمن هم في أمس الحاجة للمساعدة.",
                }}
                isMain
                index={0}
              />
            </div>

            <div className="lg:col-span-1 h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 h-full">
                {otherCampaigns.map((campaign, idx) => (
                  <CampaignCard 
                    key={campaign.id} 
                    campaign={campaign} 
                    index={idx + 1}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      
    </div>
  );
};

export default CampaignsDisplay;