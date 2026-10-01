"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Copy, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

interface Account {
  type: string;
  iban: string;
  /** The association publishes IBANs only; these are shown when known. */
  number?: string;
  ext?: string;
}

interface Bank {
  name: string;
  swift: string;
  accountName: string;
  accounts: Account[];
  branch?: string;
  logo?: string;
}

/* The accounts come from the dashboard (Dashboard → الحسابات البنكية), the
   same list the checkout's bank transfer and /bank-accounts show  edited in
   one place, shown everywhere. Shape of GET /api/bank-accounts?locale=… */
type ApiBank = {
  slug: string;
  name: string;
  branch: string;
  holder: string;
  swift: string;
  logo: string;
  currencies: Array<{ code: string; accountNo: string; extNo: string; iban: string }>;
};

function toBank(b: ApiBank): Bank {
  return {
    name: b.name,
    swift: b.swift,
    accountName: b.holder,
    branch: b.branch || undefined,
    logo: b.logo || undefined,
    accounts: b.currencies
      .filter((c) => c.iban)
      .map((c) => ({ type: c.code, iban: c.iban, number: c.accountNo || undefined, ext: c.extNo || undefined })),
  };
}

const CURRENCY_STYLE: Record<string, string> = {
  TL: "bg-red-50 text-red-600 border border-red-200",
  TRY: "bg-red-50 text-red-600 border border-red-200",
  USD: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  EUR: "bg-blue-50 text-blue-700 border border-blue-200",
};

function formatIBAN(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function CopyButton({
  text,
  label,
  t,
}: {
  text: string;
  label?: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all ${
        copied
          ? "border-green-200 bg-green-50 text-green-600"
          : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-[#A5243D] hover:border-[#A5243D] hover:text-white"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {label && <span>{copied ? t("copied") : label}</span>}
    </button>
  );
}

function BankCard({ bank, t }: { bank: Bank; t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-gray-100">
        {bank.logo && (
          <div className="relative w-36 h-10 flex-shrink-0">
            <Image src={bank.logo} alt={bank.name} fill unoptimized className="object-contain object-left" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-gray-900 leading-tight">{bank.name}</p>
          {bank.branch && (
            <p className="text-xs text-gray-400 mt-0.5">{t("branch")} {bank.branch}</p>
          )}
        </div>
        <div className="hidden sm:block text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Swift / BIC</p>
          <div className="flex items-center gap-1.5 justify-end mt-0.5">
            <p className="text-sm font-black text-gray-800 tracking-widest">{bank.swift}</p>
            <CopyButton text={bank.swift} t={t} />
          </div>
        </div>
      </div>

      {/* Swift  mobile only */}
      <div className="sm:hidden flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">Swift / BIC</p>
          <p className="text-sm font-black text-gray-800 tracking-widest mt-0.5">{bank.swift}</p>
        </div>
        <CopyButton text={bank.swift} t={t} />
      </div>

      {/* Account holder */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#A5243D]/[0.03] border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-0.5">{t("accountHolder")}</p>
          <p className="text-sm font-bold text-gray-900">{bank.accountName}</p>
        </div>
        <CopyButton text={bank.accountName} label={t("copy")} t={t} />
      </div>

      {/* Account rows */}
      <div className="divide-y divide-gray-100">
        {bank.accounts.map((acc) => (
          <div key={acc.iban} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[11px] font-black px-2.5 py-0.5 rounded-md ${
                      CURRENCY_STYLE[acc.type] ?? "bg-gray-100 text-gray-600 border border-gray-200"
                    }`}
                  >
                    {acc.type}
                  </span>
                  {acc.number && (
                    <span className="text-xs text-gray-400">
                      {t("accountNo")} <span className="text-gray-700 font-semibold">{acc.number}</span>
                    </span>
                  )}
                  {acc.ext && (
                    <span className="text-xs text-gray-400">
                      {t("extNo")} <span className="text-gray-700 font-semibold">{acc.ext}</span>
                    </span>
                  )}
                </div>
                <p className="text-base font-black text-gray-900 tracking-widest font-mono">
                  {formatIBAN(acc.iban)}
                </p>
              </div>
              <CopyButton text={acc.iban} label={t("copyIban")} t={t} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders the full list of banks + the contact-us footer.
 * Reused by /bank-transfer (manual flow) and /donation-failed (post-failure recovery).
 */
export default function BankAccountsBlock() {
  const t = useTranslations("BankTransfer");
  const locale = useLocale();
  const [banks, setBanks] = useState<Bank[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/bank-accounts?locale=${encodeURIComponent(locale)}`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: ApiBank[] }) => {
        if (!live) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setBanks(items.map(toBank).filter((bank) => bank.accounts.length > 0));
      })
      .catch(() => {
        if (live) setBanks([]);
      });
    return () => {
      live = false;
    };
  }, [locale]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      {banks === null
        ? [0, 1].map((i) => <div key={i} className="h-48 rounded-2xl border border-gray-200 bg-gray-50 animate-pulse" />)
        : banks.map((bank) => <BankCard key={bank.name + bank.swift} bank={bank} t={t} />)}
      <p className="text-center text-sm text-gray-400 pt-2">
        {t("footer")}{" "}
        <a href="mailto:info@minberiaksa.org" className="text-[#A5243D] font-semibold hover:underline">
          info@minberiaksa.org
        </a>
      </p>
    </div>
  );
}
