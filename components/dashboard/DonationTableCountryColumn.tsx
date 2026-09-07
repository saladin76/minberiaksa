"use client";

import DonationCountryFlag from "@/components/DonationCountryFlag";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { useLocale } from "next-intl";

export function DonationTableCountryColumn({
  countryCode,
  countryName,
}: {
  countryCode: string | null | undefined;
  /** When set (e.g. from user profile), shown instead of Intl name from code */
  countryName?: string | null;
}) {
  const locale = useLocale() as string;
  const intlName = getCountryDisplayNameFromCode(countryCode, locale || "ar");
  const label =
    (countryName && countryName.trim()) ||
    (intlName !== "—" ? intlName : "—");

  if (label === "—") {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className="inline-flex items-center gap-1 min-w-0 max-w-[148px] leading-tight">
      <span className="shrink-0 scale-90 origin-right" title={label}>
        <DonationCountryFlag countryCode={countryCode} />
      </span>
      <span className="text-[11px] text-slate-800 truncate" title={label}>
        {label}
      </span>
    </div>
  );
}
