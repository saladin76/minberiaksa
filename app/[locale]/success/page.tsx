'use client'
import React, { useEffect, useState } from 'react';
import { Heart, Gift, Star, Sparkles, ArrowLeft, Check, PartyPopper } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

// Dummy campaign datapixel
const dummyCampaign = {
  id: "camp_123456",
  titleAr: "مساعدة عائلة أبو أحمد لبناء منزل جديد",
  images: [
    "https://i.ibb.co/tpYQTRzB/479194011-933837085586133-2299572547794342719-n.jpg",
    "https://i.ibb.co/wrZgRSKL/478111320-933834268919748-6538127445337810245-n.jpg",
  ],
};

// Dummy donation data
const dummyDonation = {
  id: "DON-2024-001234",
  donor: {
    name: "أحمد محمد"
  },
  amount: 500,
  teamSupport: 50,
  fees: 15,
  totalAmount: 565,
  currency: "ريال",
  coverFees: true,
  createdAt: new Date().toISOString(),
  items: [
    {
      id: "item1",
      campaign: {
        title: dummyCampaign.titleAr,
        images: dummyCampaign.images
      },
      amount: 500
    }
  ]
};

const DonationSuccessPage = () => {
  const t = useTranslations('DonationSuccess');
  const locale = useLocale() as string;
  const [showConfetti, setShowConfetti] = useState(false);
  const donation = dummyDonation;

  // Helper function to get locale-specific property
  const getLocalizedProperty = (obj: any, key: string) => {
    const localeKey = `${key}${locale.charAt(0).toUpperCase() + locale.slice(1)}`;
    return obj[localeKey] || obj[key] || '';
  };

  useEffect(() => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 7000);
  }, []);

  const formatDate = (date: string) => {
    const d = new Date(date);
    const months: Record<string, string[]> = {
      ar: ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
      tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
      id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
      pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
      es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    };
    const monthNames = months[locale] || months.en;
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 relative overflow-hidden" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Animated Background Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-10 right-20 w-32 h-32 bg-gradient-to-br from-pink-400 to-rose-400 rounded-full blur-2xl animate-float"></div>
        <div className="absolute top-40 left-20 w-40 h-40 bg-gradient-to-br from-purple-400 to-indigo-400 rounded-full blur-2xl animate-float-delayed"></div>
        <div className="absolute bottom-20 right-40 w-36 h-36 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-full blur-2xl animate-float"></div>
        <div className="absolute bottom-40 left-60 w-28 h-28 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full blur-2xl animate-float-delayed"></div>
      </div>

      {/* Enhanced Colorful Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(120)].map((_, i) => {
            const colors = [
              '#ff6b9d', '#ffd93d', '#6bcf7f', '#4d96ff', '#b185db',
              '#ff8e53', '#ff5757', '#4ecdc4', '#95e1d3', '#f38181',
              '#aa96da', '#fcbad3', '#a8d8ea', '#ffcf96', '#c7ceea'
            ];
            const shapes = ['●', '■', '▲', '★', '♥'];
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 12 + Math.random() * 20;
            
            return (
              <div
                key={i}
                className="absolute font-bold"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 30}%`,
                  fontSize: `${size}px`,
                  color: color,
                  animation: `confetti-fall ${3 + Math.random() * 4}s ease-in forwards`,
                  animationDelay: `${Math.random() * 2}s`,
                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              >
                {shape}
              </div>
            );
          })}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-12 pt-28 relative z-10">
        {/* Celebration Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6 relative animate-bounce-slow">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full blur-xl opacity-60 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-sky-500 via-purple-500 to-blue-500 p-6 rounded-full shadow-2xl">
              <Check className="w-16 h-16 text-white" strokeWidth={2} />
            </div>
          </div>
        
          <div className='flex items-center justify-center gap-2  mb-2'>

          <p className="text-2xl font-bold bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent animate-gradient">
            {t('thankYou')} {donation.donor.name}! 
          </p>
          <p className='text-2xl'>🎉</p>
          </div>
          <p className="text-lg text-gray-600 mb-4">
            {t('youAreAmazing')}
          </p>
          
          <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-lg border-2 border-purple-200">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <p className="text-sm font-semibold text-gray-700">
              {t('transactionNumber')}: <span className="font-mono text-purple-700">{donation.id}</span>
            </p>
          </div>
        </div>

        {/* Colorful Cards */}
        <div className="grid md:grid-cols-2 gap-5 mb-8">
          {/* Amount Card */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-4 border-pink-200 transform hover:scale-105 transition-transform">
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full -mr-12 -mt-12"></div>
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/20 rounded-full -ml-10 -mb-10"></div>
              <div className="relative flex items-center gap-3">
                <div className="bg-white/30 p-2.5 rounded-xl backdrop-blur-sm">
                  <Heart className="w-6 h-6 text-white" fill="currentColor" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{t('donatedAmount')}</h3>
                  <p className="text-pink-100 text-sm">{formatDate(donation.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 p-5 rounded-xl border-2 border-pink-200">
                <p className="text-sm text-gray-600 mb-2 font-semibold">{t('totalAmount')}</p>
                <p className="text-4xl font-black bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent mb-4">
                  {donation.totalAmount.toLocaleString()} {donation.currency}
                </p>
                <div className="space-y-2 pt-3 border-t-2 border-pink-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">💝 {t('baseAmount')}</span>
                    <span className="font-bold text-gray-900">{donation.amount.toLocaleString()} {donation.currency}</span>
                  </div>
                  {donation.teamSupport > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">✨ {t('teamSupport')}</span>
                      <span className="font-bold text-purple-600">{donation.teamSupport.toLocaleString()} {donation.currency}</span>
                    </div>
                  )}
                  {donation.coverFees && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 font-medium">📋 {t('transactionFees')}</span>
                      <span className="font-bold text-gray-900">{donation.fees.toLocaleString()} {donation.currency}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Campaign Card */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border-4 border-purple-200 transform hover:scale-105 transition-transform">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full -mr-12 -mt-12"></div>
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/20 rounded-full -ml-10 -mb-10"></div>
              <div className="relative">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5" fill="currentColor" />
                  {t('supportedCampaign')}
                </h3>
              </div>
            </div>
            
            <div className="p-6">
              {donation.items.map((item) => (
                <div key={item.id} className="flex gap-4 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-md border-2 border-white">
                    <img
                      src={item.campaign.images[0]}
                      alt={item.campaign.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-sm leading-tight mb-2">{item.campaign.title}</h4>
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-md">
                      <Heart className="w-4 h-4" fill="currentColor" />
                      {item.amount.toLocaleString()} {donation.currency}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fun Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => window.location.href = '/campaigns'}
            className="group flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 hover:from-pink-600 hover:via-purple-600 hover:to-blue-600 text-white font-semibold py-4 px-8 rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:scale-110 border-2 border-white"
          >
            <Heart className="w-5 h-5 group-hover:animate-ping" fill="currentColor" />
            <span className="text-base">{t('donateToAnotherCampaign')}</span>
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="group flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-4 px-8 rounded-2xl transition-all shadow-xl hover:shadow-2xl border-3 border-purple-300 hover:scale-105"
          >
            <span className="text-base">{t('backToHome')}</span>
            <ArrowLeft className="w-5 h-5 rtl:rotate-180 group-hover:translate-x-[-4px] rtl:group-hover:translate-x-[4px] transition-transform" />
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(120vh) rotate(1080deg);
            opacity: 0;
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-20px) scale(1.1);
          }
        }
        @keyframes float-delayed {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-30px) scale(1.15);
          }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 8s ease-in-out infinite;
        }
        @keyframes wiggle {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(-15deg);
          }
          75% {
            transform: rotate(15deg);
          }
        }
        .animate-wiggle {
          animation: wiggle 1s ease-in-out infinite;
        }
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        @keyframes ping-slow {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .animate-ping-slow {
          animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </main>
  );
};

export default DonationSuccessPage;