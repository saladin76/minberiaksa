import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * Reconcile one-time donations stuck at `status=PAID` with no `paidAt`.
 *
 * Why the state exists: POST /api/donations writes the Donation row optimistically, before the
 * donor has reached Stripe. The webhook is what sets `paidAt` AND increments campaign/category
 * `currentAmount`, both inside one transaction guarded by `paidAt != null`. So `paidAt == null`
 * is proof the money was never credited anywhere — not to revenue, not to a progress bar.
 *
 * That makes this population two very different things mixed together:
 *   - donors who never finished paying (the overwhelming majority), and
 *   - donors who DID pay but whose webhook never arrived — real money, silently missing.
 *
 * Stripe is the authority on which is which, so this asks Stripe about every row rather than
 * inferring from age alone. Age is used only to decide when to stop waiting on a row Stripe has
 * no record of.
 *
 * Both effects are idempotent: crediting re-checks `paidAt` inside the transaction, and only
 * rows still lacking `paidAt` are ever touched.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});

/** Recorded on aged-out rows so an abandoned cart stays distinguishable from a declined card. */
export const ABANDONED_MARKER = "ABANDONED_NEVER_COMPLETED";

export type ReconcileOptions = {
  /** Report what would change without writing. */
  dryRun?: boolean;
  /** Rows younger than this are still plausibly in-flight and are left alone entirely. */
  minAgeHours?: number;
  /** A row Stripe cannot confirm is marked FAILED once it is older than this. */
  staleAfterHours?: number;
  now?: Date;
};

export type ReconcileSummary = {
  dryRun: boolean;
  scanned: number;
  credited: Array<{ donationId: string; amountUSD: number; paidAt: string }>;
  markedFailed: Array<{ donationId: string; amountUSD: number; ageDays: number }>;
  /** Still too young, or Stripe says the attempt is genuinely still open. */
  leftAlone: number;
  creditedTotalUSD: number;
  errors: Array<{ donationId: string; error: string }>;
};

/** What Stripe says about a donation's payment reference. */
type StripeVerdict = "succeeded" | "open" | "dead" | "unknown";

async function askStripe(providerOrderId: string | null): Promise<{ verdict: StripeVerdict; paidAt?: Date }> {
  if (!providerOrderId) return { verdict: "unknown" };

  if (providerOrderId.startsWith("pi_")) {
    const pi = await stripe.paymentIntents.retrieve(providerOrderId);
    if (pi.status === "succeeded") return { verdict: "succeeded", paidAt: new Date(pi.created * 1000) };
    // `canceled` is terminal; the rest can still be completed by the donor in principle, but a
    // PaymentIntent nobody has touched for days is abandoned in practice — age decides those.
    if (pi.status === "canceled") return { verdict: "dead" };
    return { verdict: "open" };
  }

  if (providerOrderId.startsWith("cs_")) {
    const cs = await stripe.checkout.sessions.retrieve(providerOrderId);
    if (cs.payment_status === "paid") {
      return { verdict: "succeeded", paidAt: new Date(cs.created * 1000) };
    }
    if (cs.status === "expired") return { verdict: "dead" };
    return { verdict: "open" };
  }

  // Anything else is the legacy PayFor convention of echoing the donation's own id.
  return { verdict: "unknown" };
}

export async function reconcileUnconfirmedDonations(options: ReconcileOptions = {}): Promise<ReconcileSummary> {
  const { dryRun = false, minAgeHours = 2, staleAfterHours = 48, now = new Date() } = options;

  // Prisma+MongoDB: `field: null` matches only EXPLICIT nulls, never unset fields. These rows are
  // written without paidAt/subscriptionId at all, so each needs an isSet:false arm — filtering on
  // `null` alone silently hides most of the population.
  const rows = await prisma.donation.findMany({
    where: {
      status: "PAID",
      AND: [
        { OR: [{ paidAt: null }, { paidAt: { isSet: false } }] },
        { OR: [{ subscriptionId: null }, { subscriptionId: { isSet: false } }] },
      ],
    },
    include: { items: true, categoryItems: true },
  });

  const summary: ReconcileSummary = {
    dryRun,
    scanned: rows.length,
    credited: [],
    markedFailed: [],
    leftAlone: 0,
    creditedTotalUSD: 0,
    errors: [],
  };

  const hoursSince = (d: Date) => (now.getTime() - d.getTime()) / 3_600_000;

  for (const donation of rows) {
    const ageHours = hoursSince(donation.createdAt);
    if (ageHours < minAgeHours) {
      summary.leftAlone++;
      continue;
    }

    let verdict: StripeVerdict = "unknown";
    let paidAt: Date | undefined;
    try {
      const answer = await askStripe(donation.providerOrderId);
      verdict = answer.verdict;
      paidAt = answer.paidAt;
    } catch (error) {
      // A reference Stripe has never heard of is as good as no reference at all; let age decide.
      const message = error instanceof Error ? error.message : String(error);
      if (!/No such|resource_missing/i.test(message)) {
        summary.errors.push({ donationId: donation.id, error: message.slice(0, 200) });
        continue;
      }
    }

    if (verdict === "succeeded" && paidAt) {
      if (!dryRun) {
        try {
          await prisma.$transaction(
            async (tx) => {
              const fresh = await tx.donation.findUnique({ where: { id: donation.id }, select: { paidAt: true } });
              if (!fresh || fresh.paidAt != null) return; // already credited by the webhook
              await tx.donation.update({
                where: { id: donation.id },
                data: {
                  paidAt,
                  provider: "STRIPE",
                  providerAuthCode: donation.providerOrderId,
                  providerTxnResult: "Success",
                },
              });
              for (const item of donation.items) {
                await tx.campaign.update({
                  where: { id: item.campaignId },
                  data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
                });
              }
              for (const item of donation.categoryItems) {
                await tx.category.update({
                  where: { id: item.categoryId },
                  data: { currentAmount: { increment: item.amountUSD ?? item.amount } },
                });
              }
            },
            // A 7-item donation is 8 sequential round-trips; Prisma's 5s default expires mid-way
            // and rolls the whole thing back. Atomicity is what makes a retry safe, so give the
            // transaction room rather than splitting it into non-atomic writes.
            { timeout: 30_000, maxWait: 10_000 },
          );
        } catch (error) {
          summary.errors.push({ donationId: donation.id, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
          continue;
        }
      }
      summary.credited.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, paidAt: paidAt.toISOString() });
      summary.creditedTotalUSD += donation.amountUSD ?? 0;
      continue;
    }

    // "open" means Stripe would still accept a payment on this reference — but a PaymentIntent
    // sitting at requires_payment_method for weeks is abandoned in practice, and excluding those
    // from ageing left them pending forever. Past the stale window, anything that is not
    // confirmed-paid is treated as abandoned; only genuinely recent rows are given the benefit
    // of the doubt.
    const isStale = ageHours > staleAfterHours;
    if (verdict === "dead" || isStale) {
      if (!dryRun) {
        await prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: "FAILED",
            providerTxnResult: "Abandoned",
            providerErrorMessage: `${ABANDONED_MARKER} — لم يكمل المتبرع عملية الدفع لدى Stripe`,
          },
        });
      }
      summary.markedFailed.push({
        donationId: donation.id,
        amountUSD: donation.amountUSD ?? 0,
        ageDays: Math.round(ageHours / 24),
      });
      continue;
    }

    summary.leftAlone++;
  }

  return summary;
}
