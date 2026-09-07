"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  const isRTL = locale === "ar";

  useEffect(() => {
    console.error(error);
  }, [error]);

  const copy = isRTL
    ? {
        title: "حدث خطأ غير متوقع",
        desc: "نعتذر عن الإزعاج. فريقنا يعمل على حل المشكلة. يمكنك المحاولة مرة أخرى أو العودة للصفحة الرئيسية.",
        retry: "إعادة المحاولة",
        home: "الصفحة الرئيسية",
      }
    : {
        title: "Something went wrong",
        desc: "We're sorry for the inconvenience. Please try again or return to the home page.",
        retry: "Try again",
        home: "Home",
      };

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-[70vh] flex items-center justify-center bg-gray-50 px-4 py-10"
    >
      <div className="max-w-md w-full text-center bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">{copy.title}</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{copy.desc}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 bg-[#A5243D] hover:bg-[#7D1830] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {copy.retry}
          </button>
          <a
            href={`/${locale}`}
            className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            {copy.home}
          </a>
        </div>
      </div>
    </div>
  );
}
