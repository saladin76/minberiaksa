'use client';

import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { signIn } from 'next-auth/react';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'AccessDenied':
        return 'تم رفض الوصول. يرجى المحاولة مرة أخرى.';
      case 'OAuthAccountNotLinked':
        return 'يبدو أنك قد سجلت الدخول سابقاً باستخدام طريقة مختلفة. الرجاء استخدام نفس طريقة تسجيل دخول السابقة.';
      case 'Configuration':
        return 'هناك مشكلة في إعدادات تسجيل دخول. يرجى المحاولة لاحقاً.';
      default:
        return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          حدث خطأ في تسجيل دخول
        </h2>
        <p className="text-gray-600 mb-8">
          {getErrorMessage(error)}
        </p>
        <div className="space-y-4">
          <div className="flex w-full justify-center">
            <GoogleSignInButton callbackUrl={callbackUrl} />
          </div>


          <Button
            onClick={() => signIn('facebook', { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#1874EA] text-white"
          >
            <Image src="/facebook.svg" alt="Facebook" width={20} height={20} />
            <span>تسجيل دخول باستخدام Facebook</span>
          </Button>

          <div className="mt-4">
            <Link
              href="/"
              className="text-emerald-600 hover:text-emerald-700 text-sm"
            >
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 