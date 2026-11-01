"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { MinbarAccountSummary } from "@/lib/minbar/account";
import AccountPage from "./AccountPage";

export default function AccountOverview() {
  const locale = useLocale(), t = useTranslations("Profile"), tSystem = useTranslations("system");
  const [summary, setSummary] = useState<MinbarAccountSummary | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSummary(null); setError(false);
    void fetch(`/api/users/me/account-summary?${new URLSearchParams({ locale })}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); const data = await response.json(); if (!controller.signal.aborted) setSummary(data.summary); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [locale, retry]);
  if (error) return <div role="alert"><p>{t("misc.failedToFetchUser")}</p><button type="button" className="min-h-11 rounded-lg border px-4" onClick={() => setRetry(value => value + 1)}>{t("misc.tryAgain")}</button></div>;
  return summary ? <AccountPage summary={summary} /> : <p role="status" aria-busy="true">{tSystem("loading")}</p>;
}
