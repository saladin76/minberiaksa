"use client";

import ReactCountryFlag from "react-country-flag";

function normalize(code: string | null | undefined): string | null {
  if (code == null || typeof code !== "string") return null;
  const t = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(t)) return null;
  return t;
}

export default function DonationCountryFlag({ countryCode }: { countryCode?: string | null }) {
  const code = normalize(countryCode);
  if (!code) {
    return <span className="inline-block w-[1.1em] text-center text-slate-300">—</span>;
  }
  return (
    <ReactCountryFlag
      svg
      countryCode={code}
      title={code}
      style={{ width: "1.1em", height: "1.1em", verticalAlign: "middle" }}
    />
  );
}
