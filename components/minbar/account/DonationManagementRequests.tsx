"use client";

import { useLocale, useTranslations } from "next-intl";
import { subscriptionRequestNavigationCopy } from "@/lib/donations/subscription-request-navigation-copy";
import { receiptMoney } from "@/lib/templates/receipt-localization";
import SubscriptionRequests from "./SubscriptionRequests";

export type ManagedDonation = {
  id: string;
  amount: number;
  currency: string;
  frequency?: string | null;
  status: string | null;
  title: string;
};

export default function DonationManagementRequests({ plans, selectedId, onSelect }: {
  plans: ManagedDonation[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const locale = useLocale();
  const copy = subscriptionRequestNavigationCopy(locale);
  const common = useTranslations("common");
  const profile = useTranslations("Profile");
  const recurring = useTranslations("Recurring");
  const selected = plans.find(plan => plan.id === selectedId) ?? plans[0];
  const cadence = (plan: ManagedDonation) => common(plan.frequency === "DAILY" ? "freqDaily" : plan.frequency === "FRIDAY" ? "freqFriday" : "freqMonthly");
  const status = (plan: ManagedDonation) => plan.status === "ACTIVE" ? profile("subscriptions.active")
    : plan.status === "PAUSED" ? profile("subscriptions.paused")
      : plan.status === "PAYMENT_FAILED" ? recurring("subscriptionPaymentFailed") : profile("subscriptions.cancelled");

  return <section className="grid min-w-0 gap-5" aria-labelledby="donation-requests-title">
    <div className="lg:sr-only">
      <h2 id="donation-requests-title" className="text-lg font-semibold text-gray-900">{copy.title}</h2>
      <p className="mt-1 text-sm leading-7 text-gray-600">{copy.description}</p>
    </div>
    {selected ? <>
      <div className="grid min-w-0 gap-2 text-sm font-medium">
        <label htmlFor="donation-request-plan">{copy.selectPlan}</label>
        <select id="donation-request-plan" value={selected.id} onChange={event => onSelect(event.target.value)} className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm">
          {plans.map(plan => <option key={plan.id} value={plan.id}>
            {[plan.title, receiptMoney(plan.amount, plan.currency, locale), cadence(plan), status(plan), `#${plan.id.slice(-8)}`].filter(Boolean).join(" · ")}
          </option>)}
        </select>
      </div>
      <div className="min-w-0 rounded-xl border border-gray-200 p-4 sm:p-5">
        <SubscriptionRequests key={selected.id} subscriptionId={selected.id} />
      </div>
    </> : <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm leading-7 text-gray-600">{copy.empty}</p>}
  </section>;
}
