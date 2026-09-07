'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

/**
 * Route-level error boundary for the whole dashboard tree.
 *
 * There was no `error.tsx` anywhere under the 151 dashboard routes, so any uncaught render
 * error bubbled all the way to the app-root boundary and replaced the entire shell — the
 * user lost the sidebar, the breadcrumb and their place, and the only recovery was a
 * full reload. This keeps the failure contained to the content well.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] route error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6" />
        </span>

        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">تعذّر عرض هذه الصفحة</h1>
        <p className="mt-2 text-sm text-slate-500 leading-6">
          حدث خطأ غير متوقع أثناء تحميل محتوى الصفحة. بقية لوحة التحكم تعمل بشكل طبيعي،
          ويمكنك إعادة المحاولة أو الانتقال لصفحة أخرى.
        </p>

        {error?.digest && (
          <p className="mt-3 text-[11px] text-slate-400 font-mono" dir="ltr">
            رمز الخطأ: {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            <RotateCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Home className="w-4 h-4" />
            اللوحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
