"use client";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { safeAuthCallback } from "@/lib/auth-safe-callback";
export default function AuthError() {
 const search = useSearchParams(), locale = useLocale(), t = useTranslations("SignInDialog");
 const error = search.get("error"), callbackUrl = safeAuthCallback(search.get("callbackUrl"), locale);
 const key = error === "AccessDenied" ? "authAccessDenied" : error === "OAuthAccountNotLinked" ? "authAccountConflict" : error === "Configuration" ? "authUnavailable" : "authUnknown";
 return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><section className="w-full max-w-md space-y-6 rounded-2xl border bg-white p-6 text-center shadow-sm"><h1 className="text-2xl font-bold text-slate-900">{t("authErrorTitle")}</h1><p role="alert" className="text-sm leading-7 text-slate-600">{t(key)}</p><div className="flex justify-center"><GoogleSignInButton callbackUrl={callbackUrl} locale={locale} fallbackLabel={t("signInWithGoogle")} /></div><Link className="block rounded-xl bg-brand px-4 py-3 font-semibold text-white" href={`/${locale}/checkout`}>{t("donateAsGuest")}</Link></section></main>;
}
