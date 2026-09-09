import type { SupportedLocale } from "@/lib/locales";

export interface SocialLinks {
  instagram: string;
  facebook: string;
  twitter: string;
}

// Minberiaksa Uluslararası Yardımlaşma Derneği runs one account per network for
// every language, so there is no per-locale variation to resolve any more.
const LINKS: SocialLinks = {
  instagram: "https://www.instagram.com/minberiaksa61/",
  facebook: "https://www.facebook.com/minberiaksa",
  twitter: "https://twitter.com/minberiaksan",
};

export function getSocialLinks(_locale?: SupportedLocale | string): SocialLinks {
  return LINKS;
}
