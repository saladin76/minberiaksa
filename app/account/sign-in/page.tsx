import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInPrototype } from "@/components/account/sign-in-prototype";

export const metadata: Metadata = { title: "الدخول إلى حساب عطائك | مؤسسة منبر الأقصى الدولية" };

export default function AccountSignInPage() {
  return (
    <Suspense fallback={<main id="main-content" className="account-route-loading" role="status">جارٍ تحميل صفحة الدخول…</main>}>
      <SignInPrototype />
    </Suspense>
  );
}