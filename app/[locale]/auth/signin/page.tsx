'use client';

import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Heart } from 'lucide-react';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const LOGO_URL = '/brand/minber-logo-full.webp';
const LOGO_SIZES = '(max-width: 640px) calc(100vw - 80px), (max-width: 1023px) 400px, (min-width: 1280px) 500px, 40vw';

export default function SignIn() {
  const locale = useLocale();
  const t = useTranslations('SignInPage');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left: decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-deep hero-pattern flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-burgundy/40 to-deep/80" />
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full bg-white/5" />

        <div className="relative z-10 w-full max-w-xl text-center text-white">
          <div className="mb-8 rounded-2xl bg-white px-5 py-6 shadow-sm">
            <Image src={LOGO_URL} alt={t('logoAlt')} width={2603} height={633} sizes={LOGO_SIZES} priority className="mx-auto h-auto w-full object-contain" />
          </div>
          <div className="gold-mark mx-auto mb-6" />
          <h2 className="text-2xl font-extrabold mb-4 uppercase tracking-wide">{t('headline')}</h2>
          <p className="text-white/75 text-sm leading-relaxed mb-8">{t('sub')}</p>
          <Link
            href="/bagislar"
            className="shape-button inline-flex items-center gap-2 bg-burgundy hover:bg-burgundyDark text-white font-bold px-6 py-3 transition-colors"
          >
            <Heart className="w-4 h-4" />
            {t('donateNow')}
          </Link>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden rounded-2xl bg-white px-4 py-5 text-center mb-6">
            <Image src={LOGO_URL} alt={t('logoAlt')} width={2603} height={633} sizes={LOGO_SIZES} priority className="h-auto w-full object-contain mx-auto" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">{t('title')}</h1>
            <p className="text-sm text-gray-500 mb-8">{t('welcome')}</p>

            <div className="space-y-3">
              <div className="flex w-full justify-center">
                <GoogleSignInButton callbackUrl={`/${locale}`} locale={locale} fallbackLabel={t('signInWithGoogle')} />
              </div>

              {/* <button
                onClick={() => signIn('facebook', { callbackUrl: '/' })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-transparent rounded-lg text-sm font-semibold text-white bg-[#1877F2] hover:bg-[#1874EA] transition-colors shadow-sm"
              >
                <Image src="/facebook.svg" alt="Facebook" width={20} height={20} />
                Facebook
              </button> */}
            </div>

            <Link href="/bagislar" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-burgundy hover:underline lg:hidden"><Heart className="h-4 w-4" />{t('donateNow')}</Link>

            {/* <p className="mt-6 text-center text-sm text-gray-500">
              {t('noAccount')}{" "}
              <Link href="/campaigns" className="text-[#A5243D] font-semibold hover:text-[#D8AA55] transition-colors inline-flex items-center gap-1">
                {t('createOne')} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </Link>
            </p> */}
          </div>
        </div>
      </div>
    </div>
  );
}
