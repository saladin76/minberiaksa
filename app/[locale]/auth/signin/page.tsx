'use client';

import { signIn } from 'next-auth/react';
import { useLocale } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Heart, ArrowRight } from 'lucide-react';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const LOGO_URL = '/logometaminber.avif';

export default function SignIn() {
  const locale = useLocale();
  const isTr = locale === 'tr';
  const isAr = locale === 'ar';

  const labels = {
    headline: isTr ? 'HALA ÜYE DEĞİL MİSİNİZ?' : isAr ? 'هل أنت عضو جديد؟' : 'NOT A MEMBER YET?',
    sub: isTr
      ? 'Üye olarak bağışlarınızı takip edebilir, özel kampanyalara katılabilirsiniz.'
      : isAr
      ? 'سجّل للمتابعة وتتبع تبرعاتك والمشاركة في الحملات.'
      : 'Register to track your donations and join exclusive campaigns.',
    signIn: isTr ? 'GİRİŞ YAP' : isAr ? 'تسجيل الدخول' : 'SIGN IN',
    register: isTr ? 'KAYIT OL' : isAr ? 'إنشاء حساب' : 'REGISTER',
    orContinue: isTr ? 'ile devam et' : isAr ? 'تابع باستخدام' : 'continue with',
    title: isTr ? 'Giriş Yap' : isAr ? 'تسجيل الدخول' : 'Sign In',
    welcome: isTr ? 'Tekrar hoş geldiniz' : isAr ? 'مرحباً بعودتك' : 'Welcome back',
    noAccount: isTr ? 'Hesabınız yok mu?' : isAr ? 'ليس لديك حساب؟' : "Don't have an account?",
    createOne: isTr ? 'Üye ol' : isAr ? 'أنشئ حساباً' : 'Create one',
    google: isTr ? "Google ile giriş yap" : isAr ? "الدخول عبر Google" : "Sign in with Google",
    facebook: isTr ? "Facebook ile giriş yap" : isAr ? "الدخول عبر Facebook" : "Sign in with Facebook",
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left: decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 hero-pattern flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-burgundy/40 to-deep/80" />
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute bottom-[-60px] left-[-60px] w-64 h-64 rounded-full bg-white/5" />

        <div className="relative z-10 text-center text-white max-w-sm">
          <Image src={LOGO_URL} alt="Logo" width={80} height={80} className="h-20 w-auto object-contain mx-auto mb-8 brightness-0 invert" />
          <div className="gold-mark mx-auto mb-6" />
          <h2 className="text-2xl font-extrabold mb-4 uppercase tracking-wide">{labels.headline}</h2>
          <p className="text-white/75 text-sm leading-relaxed mb-8">{labels.sub}</p>
          <Link
            href="/campaigns"
            className="shape-button inline-flex items-center gap-2 bg-burgundy hover:bg-burgundyDark text-white font-bold px-6 py-3 transition-colors"
          >
            <Heart className="w-4 h-4" />
            {isTr ? 'Bağış Yap' : isAr ? 'تبرع الآن' : 'Donate Now'}
          </Link>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <Image src={LOGO_URL} alt="Logo" width={56} height={56} className="h-14 w-auto object-contain mx-auto" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">{labels.title}</h1>
            <p className="text-sm text-gray-500 mb-8">{labels.welcome}</p>

            <div className="space-y-3">
              <div className="flex w-full justify-center">
                <GoogleSignInButton callbackUrl="/" locale={locale} />
              </div>

              <button
                onClick={() => signIn('facebook', { callbackUrl: '/' })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-transparent rounded-lg text-sm font-semibold text-white bg-[#1877F2] hover:bg-[#1874EA] transition-colors shadow-sm"
              >
                <Image src="/facebook.svg" alt="Facebook" width={20} height={20} />
                {labels.facebook}
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">{labels.orContinue}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <p className="mt-6 text-center text-sm text-gray-500">
              {labels.noAccount}{" "}
              <Link href="/campaigns" className="text-[#A5243D] font-semibold hover:text-[#D8AA55] transition-colors inline-flex items-center gap-1">
                {labels.createOne} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
