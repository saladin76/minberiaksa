import Link from 'next/link';
import { FileQuestion, Home } from 'lucide-react';

/** Keeps a 404 inside the dashboard shell instead of dropping the user on the public 404. */
export default function DashboardNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
          <FileQuestion className="w-6 h-6" />
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-slate-500 leading-6">
          الرابط الذي تحاول الوصول إليه غير متاح أو تم نقله. استخدم البحث السريع
          (<span dir="ltr" className="font-mono text-xs">Ctrl K</span>) للوصول لأي صفحة.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            <Home className="w-4 h-4" />
            اللوحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
