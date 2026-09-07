"use client";

import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Loader2 } from "lucide-react";

export default function AutoSignInPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email");
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";

    const finish = (extra = "") => {
      const sep = callbackUrl.includes("?") ? "&" : "?";
      router.replace(`${callbackUrl}${sep}verified=success${extra}` as never);
    };

    if (!token || !email) {
      finish();
      return;
    }

    signIn("credentials", {
      email,
      autoSignInToken: token,
      redirect: false,
    }).then((res) => {
      // Whether sign-in succeeded or not, redirect back with verified=success
      // The user can always sign in manually from the success toast if something went wrong
      finish();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messages: Record<string, string> = {
    ar: "جارٍ تسجيل دخولك…",
    tr: "Giriş yapılıyor…",
    fr: "Connexion en cours…",
    es: "Iniciando sesión…",
    pt: "Entrando…",
    id: "Sedang masuk…",
    en: "Signing you in…",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#A5243D] mx-auto" />
        <p className="text-gray-600 text-sm font-medium">
          {messages[locale] ?? messages.en}
        </p>
      </div>
    </div>
  );
}
