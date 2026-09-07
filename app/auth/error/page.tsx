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
  const locale = resolveLocale(
    cookieStore.get("NEXT_LOCALE")?.value ?? cookieStore.get("NEXT_INTL_LOCALE")?.value
  );
  redirect(`/${locale}/auth/error${toQueryString(sp)}`);
}
