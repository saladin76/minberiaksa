import { safeAuthCallback } from "@/lib/auth-safe-callback";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(sp: SearchParams): string {
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => u.append(key, v));
    else u.set(key, value);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

function resolveLocale(raw: string | undefined): string {
  if (raw && (routing.locales as readonly string[]).includes(raw)) return raw;
  return routing.defaultLocale;
}

/** NextAuth `pages.error` is `/auth/error`; real UI lives under `/[locale]/auth/error`. */
export default async function AuthErrorBridge({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  let locale = resolveLocale(
    cookieStore.get("NEXT_LOCALE")?.value ?? cookieStore.get("NEXT_INTL_LOCALE")?.value
  );
  const candidate = typeof sp.callbackUrl === "string" ? sp.callbackUrl : cookieStore.get("__Secure-next-auth.callback-url")?.value ?? cookieStore.get("next-auth.callback-url")?.value;
  const callback = safeAuthCallback(candidate, locale);
  const callbackLocale = callback.split("/")[1];
  if ((routing.locales as readonly string[]).includes(callbackLocale)) locale = callbackLocale;
  redirect(`/${locale}/auth/error${toQueryString({ ...sp, callbackUrl: callback })}`);
}
