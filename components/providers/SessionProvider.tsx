"use client";

import { useEffect } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";

interface Props {
  children: React.ReactNode;
  session?: Session | null;
}

/** Fills donor location (countryCode, countryName, region, city) from IP / edge geo after login when not yet set */
function CountryFromIpOnSession() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/users/me/country-from-ip", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = (await res.json().catch(() => null)) as {
          updated?: boolean;
          reason?: string;
          error?: string;
        } | null;
        if (cancelled || !data) return;

        if (data.updated || res.status === 401 || data.error) return;

        if (data.reason !== "no_geo") return;

        // Server-side geo (Vercel headers → CF → ipapi). Browser direct fetch
        // to ipapi.co was being blocked by antivirus / CORS / ad-blockers in
        // production, which left donors with empty location fields and broke
        // Meta CAPI matching (no `ct` / `st` / `country` hashes).
        const geoRes = await fetch("/api/geo/client", { credentials: "omit" });
        if (!geoRes.ok || cancelled) return;
        const geo = (await geoRes.json().catch(() => null)) as {
          ok?: boolean;
          country_code?: string;
          country_name?: string;
          region?: string;
          city?: string;
        } | null;
        if (cancelled || !geo || !geo.ok) return;
        const cc = typeof geo.country_code === "string" ? geo.country_code.trim().toUpperCase() : "";
        if (!/^[A-Z]{2}$/.test(cc) || cc === "XX") return;

        await fetch("/api/users/me/country-from-ip", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            countryCode: cc,
            countryName: typeof geo.country_name === "string" ? geo.country_name.trim() : undefined,
            region: typeof geo.region === "string" ? geo.region.trim() : undefined,
            city: typeof geo.city === "string" ? geo.city.trim() : undefined,
          }),
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}

export default function SessionProvider({ children, session }: Props) {
  return (
    <NextAuthSessionProvider session={session}>
      <CountryFromIpOnSession />
      {children}
    </NextAuthSessionProvider>
  );
} 