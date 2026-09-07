'use client';
import Image from 'next/image';
import { Target, Users, Heart, MessageSquare, CheckCircle, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const AboutUs = () => {
  const t = useTranslations('AboutUs');

  const goals = t.raw('goalsList') as string[];
  const presidentMessage = t.raw('presidentMessageParagraphs') as string[];

  return (
    <div className="bg-white">
      {/* Compact Hero */}
      <section className="relative h-[250px] sm:h-[320px] overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=400&fit=crop"
            alt="أطفال سعداء"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-deep/60 to-deep/80"></div>
        </div>
        <div className="relative z-10 h-full flex flex-col justify-center items-center text-center text-white px-4">
          <div className="gold-mark mb-5" />
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2">{t('pageTitle')}</h1>
          <p className="text-sm sm:text-base lg:text-lg text-ice">
            {t('associationName')}
          </p>
        </div>
      </section>

      {/* Section 1: About - Compact */}
      <section className="py-10 sm:py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-[#A5243D]/10 text-[#A5243D] px-3 py-1.5 rounded-full text-xs font-semibold mb-4">
                <Heart className="w-3.5 h-3.5" />
                <span>{t('associationName')}</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-4">
                {t('aboutUsTitle')}
              </h2>
              <div className="text-gray-700 leading-relaxed space-y-3 text-sm sm:text-base">
                <p>
                  {t('aboutUsDesc1')}
                </p>
                <p>
                  {t('aboutUsDesc2')}
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="relative rounded-xl overflow-hidden shadow-lg h-[250px] sm:h-[300px]">
                <Image
                  src="https://i.ibb.co/5X3jHptJ/insanligin-etkileyicileri-konferansi-2084.jpg"
                  alt="أطفال يدرسون"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#A5243D]" />
                    <div>
                      <p className="text-lg font-bold text-gray-800">50,000+</p>
                      <p className="text-[10px] text-gray-600">{t('beneficiaries')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Vision - Compact */}
      <section className="py-10 sm:py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center">
            <div className="relative rounded-xl overflow-hidden shadow-lg h-[250px] sm:h-[300px]">
              <Image
                src="https://i.ibb.co/qt4f4cg/calisma-alanlarimiz-yardim-sektoru.jpg"
                alt="رؤيتنا"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 bg-white text-[#A5243D] px-3 py-1.5 rounded-full text-xs font-semibold mb-4 shadow-sm">
                <Eye className="w-3.5 h-3.5" />
                <span>{t('vision')}</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-800 mb-4">
                {t('visionTitle')}
              </h2>
              <div className="relative bg-white rounded-xl p-6 sm:p-8 shadow-md border-r-4 border-[#A5243D]">
                {/* Quote Icon */}
                <div className="absolute bottom-3 right-3 text-blue-100">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                </div>
                
                {/* Quote Text */}
                <div className="relative z-10">
                  <p className="text-lg sm:text-xl text-gray-800 leading-relaxed font-medium text-center italic">
                    &quot;{t('visionQuote')}&quot;
                  </p>
                  
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Goals - Compact & Clean */}
      <section className="py-10 sm:py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-[#A5243D]/10 text-[#A5243D] px-3 py-1.5 rounded-full text-xs font-semibold mb-3">
              <Target className="w-3.5 h-3.5" />
              <span>{t('goals')}</span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-2">
              {t('goalsTitle')}
            </h2>
            <p className="text-gray-600 text-sm max-w-xl mx-auto">
              {t('goalsDesc')}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Image */}
            <div className="relative rounded-xl overflow-hidden shadow-lg h-[280px] sm:h-[350px]">
              <Image
                src="https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"
                alt="أهدافنا"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[#A5243D]/70"></div>
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-center text-white">
                  <Target className="w-12 h-12 mx-auto mb-3" />
                  <h3 className="text-2xl font-bold mb-1">{t('goalsCount')}</h3>
                  <p className="text-white/90 text-sm">{t('goalsSubtitle')}</p>
                </div>
              </div>
            </div>

            {/* Goals List */}
            <div className="space-y-2.5">
              {goals.map((goal, index) => (
                <div 
                  key={index}
                  className="group border bg-white rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 border-r-4"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#A5243D]/10 flex items-center justify-center group-hover:bg-[#A5243D] transition-colors">
                      <CheckCircle className="w-4 h-4 text-[#A5243D] group-hover:text-white transition-colors" />
                    </div>
                    <p className="text-gray-700 leading-relaxed text-xs sm:text-sm flex-1">
                      {goal}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: President Message - Compact */}
      <section className="py-10 sm:py-12 lg:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-[#A5243D]/10 text-[#A5243D] px-3 py-1.5 rounded-full text-xs font-semibold mb-3">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('presidentMessage')}</span>
            </div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800">
              {t('presidentTitle')}
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
            {/* President Image */}
            <div className="lg:col-span-1">
              <div className="relative rounded-xl overflow-hidden shadow-lg sticky top-4 h-[320px] sm:h-[380px]">
                <Image
                  src="https://i.ibb.co/rKTrMkzj/gozbebekkleri-hakkimizda.jpg"
                  alt="رئيس الجمعية"
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <h3 className="text-white font-bold text-base mb-0.5">{t('presidentName')}</h3>
                  <p className="text-blue-200 text-xs">{t('presidentPosition')}</p>
                </div>
              </div>
            </div>

            {/* Message Content */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl p-5 sm:p-6 shadow-md">
                <div className="text-gray-700 leading-relaxed space-y-3 text-sm sm:text-base">
                  {presidentMessage.map((paragraph, index) => (
                    <p key={index} className={index === presidentMessage.length - 1 ? "font-semibold text-[#A5243D] text-sm" : ""}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compact CTA */}
      <section className="py-12 sm:py-16 bg-black relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1200&h=300&fit=crop"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-30 blur-sm"
          />
        </div>
        <div className="max-w-7xl mx-auto px-4 text-center relative z-10">
          <Heart className="w-12 h-12 text-white mx-auto mb-4" />
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {t('ctaTitle')}
          </h2>
          <p className="text-white/90 text-sm sm:text-base mb-6 max-w-xl mx-auto">
            {t('ctaDesc')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={"/campaigns"} className="bg-white text-[#A5243D] px-6 py-3 rounded-full font-bold text-sm hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:scale-105">
              {t('donateNow')}
            </Link>
            <Link href={"/contact-us"} className="bg-[#A5243D] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-sky-800 transition-all shadow-lg hover:shadow-xl hover:scale-105 border-2 border-white/30">
              {t('contactUs')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutUs;