import { NextResponse } from "next/server";

/**
 * DISABLED 2026-07-31 — this route could only cause damage.
 *
 * It was written for PayFor recurring billing, which was never implemented. Its guard was:
 *
 *     if (!sub.payforToken) { skipped++; continue; }   // "skip subs we can't charge"
 *
 * but `payforToken` is the field that stores **Stripe** subscription ids
 * (app/api/stripe/subscribe/route.ts:96-100, app/api/stripe/webhook/route.ts:102-103).
 * Since PayFor recurring does not exist, Stripe subscriptions are the ONLY rows with a
 * non-null `payforToken` — so the guard was exactly inverted. It skipped everything it was
 * meant to process, and processed precisely the subscriptions Stripe already bills.
 *
 * For every due Stripe subscription it then:
 *   1. wrote a bogus `status: "FAILED"`, `provider: "PAYFOR"` donation for a card that had
 *      actually charged successfully, and
 *   2. advanced `nextBillingDate`, desynchronising the schedule the Stripe webhook maintains
 *      from `invoice.payment_succeeded`.
 *
 * It was never registered in vercel.json, but its auth failed OPEN (`if (cronSecret && ...)`),
 * so it was publicly reachable in any environment where CRON_SECRET was unset.
 *
 * Recurring billing is owned entirely by Stripe. If PayFor recurring is ever built, restore
 * this from git history and key it on a dedicated field — never on `payforToken`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "MONTHLY_BILLING_ROUTE_DISABLED",
      detail:
        "PayFor recurring billing is not implemented. This route mistakenly treated Stripe " +
        "subscriptions as PayFor ones and wrote bogus FAILED donations for successful charges. " +
        "Stripe owns recurring billing via invoice.payment_succeeded.",
    },
    { status: 410 }
  );
}
