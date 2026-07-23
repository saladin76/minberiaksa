import type { Metadata } from "next";
import { AccountSignIn } from "@/components/account/account-sign-in";

export const metadata: Metadata = { title: "الدخول إلى حساب عطائك | مؤسسة منبر الأقصى الدولية" };

export default function AccountSignInPage() {
  return <AccountSignIn />;
}
