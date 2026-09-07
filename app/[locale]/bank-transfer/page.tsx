"use client";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import BankAccountsBlock from "./_components/BankAccountsBlock";

export default function BankTransferPage() {
  const t = useTranslations("BankTransfer");

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-[#A5243D]">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-white/80 text-xs font-semibold mb-4">
            <CreditCard className="w-3.5 h-3.5" />
            {t("badge")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">{t("title")}</h1>
          <p className="text-white/65 text-sm sm:text-base max-w-lg mx-auto">{t("subtitle")}</p>
        </div>
      </div>

      <BankAccountsBlock />
    </main>
  );
}
