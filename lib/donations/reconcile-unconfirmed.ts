import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { albarakaConfig, albaraka2DConfig, albarakaInquireSale, isAlbarakaConfigured } from "@/lib/albaraka";
import { settleAlbarakaDonation } from "./albaraka-settlement";
import { donationFieldEmpty, donationWhereAll } from "./mongo-null";
import { PAYFOR_UNVERIFIED_APPROVAL } from "@/lib/payfor";
import { reconcilePayPalDonation } from "@/lib/donations/paypal-donation";
import { prisma } from "@/lib/prisma";
import { runAfterResponse } from "@/lib/events/after-response";
import { dispatchDonationPaid } from "@/lib/events/dispatch";

/**
 * Reconcile online donations stuck at `status=PAID` with no `paidAt`.
 *
 * Why the state exists: POST /api/donations writes the Donation row optimistically, before the
 * donor has reached Stripe. The webhook is what sets `paidAt` AND increments campaign/category
 * `currentAmount`, both inside one transaction guarded by `paidAt != null`. So `paidAt == null`
 * is proof the money was never credited anywhere  not to revenue, not to a progress bar.
 *
 * That makes this population two very different things mixed together:
 *   - donors who never finished paying (the overwhelming majority), and
 *   - donors who DID pay but whose webhook never arrived  real money, silently missing.
 *
 * The recorded provider is the authority. Inquiry runs at most once per half
 * hour per donation. After 24 hours only an authoritative unpaid/no-sale
 * response can expire an attempt; unreachable or ambiguous replies stay held.
 *
 * Both effects are idempotent: crediting re-checks `paidAt` inside the transaction, and only
 * rows still lacking `paidAt` are ever touched.
 */

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-03-25.dahlia",
}) : null;

/** Recorded on aged-out rows so an abandoned cart stays distinguishable from a declined card. */
export const ABANDONED_MARKER = "ABANDONED_NEVER_COMPLETED";

export type ReconcileOptions = {
  /** Report what would change without writing. */
  dryRun?: boolean;
  /** Rows younger than this are still plausibly in-flight and are left alone entirely. */
  minAgeHours?: number;
  /** An authoritatively unpaid attempt can expire after this many hours. */
  staleAfterHours?: number;
  now?: Date;
};

export type ReconcileSummary = {
  dryRun: boolean;
  scanned: number;
  credited: Array<{ donationId: string; amountUSD: number; paidAt: string }>;
  markedFailed: Array<{ donationId: string; amountUSD: number; ageDays: number }>;
  /** Too young, pending at the provider, or not safely reconcilable. */
  leftAlone: number;
  creditedTotalUSD: number;
  errors: Array<{ donationId: string; error: string }>;
};

/** What Stripe says about a donation's payment reference. */
type StripeVerdict = "succeeded" | "open" | "pending" | "dead" | "unknown";

async function askStripe(providerOrderId: string | null): Promise<{ verdict: StripeVerdict; paidAt?: Date }> {
  if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!providerOrderId) return { verdict: "unknown" };

  if (providerOrderId.startsWith("pi_")) {
    const pi = await stripe.paymentIntents.retrieve(providerOrderId);
    if (pi.status === "succeeded") return { verdict: "succeeded", paidAt: new Date(pi.created * 1000) };
    if (pi.status === "processing") return { verdict: "pending" };
    // `canceled` is terminal; the rest can still be completed by the donor in principle, but a
    // PaymentIntent nobody has touched for days is abandoned in practice  age decides those.
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
  const { dryRun = false, minAgeHours = 0.5, staleAfterHours = 24, now = new Date() } = options;
  const started = Date.now();

  // Prisma+MongoDB: `field: null` matches only EXPLICIT nulls, never unset fields. These rows are
  // written without paidAt/subscriptionId at all, so each needs an isSet:false arm  filtering on
  // `null` alone silently hides most of the population.
  const rows = await prisma.donation.findMany({
    where: {
      status: "PAID",
      // A bank transfer waits on a finance officer, not on Stripe, and has no
      // clock: it stays "قيد التأكيد" until someone confirms or rejects it from
      // the dashboard. Ageing it out here would mark real, slow money abandoned.
      NOT: { provider: "BANK_TRANSFER" },
      AND: [
        { OR: [{ reconciliationNextAt: null }, { reconciliationNextAt: { isSet: false } }, { reconciliationNextAt: { lte: now } }] },
        { OR: [{ paidAt: null }, { paidAt: { isSet: false } }] },
      ],
    },
    include: { items: true, categoryItems: true },
    orderBy: { createdAt: "asc" },
    take: 200,
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
    if (Date.now() - started > 240_000) break;
    const ageHours = hoursSince(donation.createdAt);
    /* A PayFor approval whose bank signature did not verify waits for a person to
       check it against the bank report; ageing it out would hide a possible charge. */
    if (ageHours < minAgeHours || donation.providerErrorMessage === PAYFOR_UNVERIFIED_APPROVAL) {
      summary.leftAlone++;
      continue;
    }
    if (dryRun) { summary.leftAlone++; continue; }
    const lease = randomUUID();
    const claimed = await prisma.donation.updateMany({
      where: donationWhereAll({ id: donation.id, status: "PAID" }, donationFieldEmpty("paidAt"), {
        OR: [{ reconciliationLeaseUntil: null }, { reconciliationLeaseUntil: { isSet: false } }, { reconciliationLeaseUntil: { lt: now } }],
      }, {
        OR: [{ reconciliationNextAt: null }, { reconciliationNextAt: { isSet: false } }, { reconciliationNextAt: { lte: now } }],
      }),
      data: { reconciliationLeaseToken: lease, reconciliationLeaseUntil: new Date(now.getTime() + 300_000) },
    });
    if (claimed.count !== 1) { summary.leftAlone++; continue; }
    try {

    /* PayPal rows are asked of PayPal, through the same checks the return
       route settles with (`reconcilePayPalDonation`). A dry run does not call
       it: settling or failing is all it does. */
    if (donation.paymentMethod === "PAYPAL") {
      if (dryRun) {
        summary.leftAlone++;
        continue;
      }
      try {
        const { outcome } = await reconcilePayPalDonation(donation.id, { now });
        if (outcome === "paid") {
          summary.credited.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, paidAt: now.toISOString() });
          summary.creditedTotalUSD += donation.amountUSD ?? 0;
        } else if (outcome === "failed") {
          summary.markedFailed.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, ageDays: Math.round(ageHours / 24) });
        } else {
          summary.leftAlone++;
        }
      } catch (error) {
        summary.errors.push({ donationId: donation.id, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
      }
      continue;
    }

    if (donation.provider === "ALBARAKA") {
      const raw = donation.providerRaw && typeof donation.providerRaw === "object" && !Array.isArray(donation.providerRaw) ? donation.providerRaw as Record<string, unknown> : {};
      const request = raw.albarakaRequest && typeof raw.albarakaRequest === "object" ? raw.albarakaRequest as Record<string, unknown> : {};
      // Later recurring cycles belong to their own cycle/lease settlement.
      if (raw.albarakaRecurring) { summary.leftAlone++; continue; }
      const cfg = request.mode === "3D" ? albarakaConfig() : albaraka2DConfig();
      if (!isAlbarakaConfigured(cfg) || !donation.providerOrderId || request.orderId !== donation.providerOrderId) { summary.leftAlone++; continue; }
      if ((request.terminalNo && request.terminalNo !== cfg.terminalNo) || (request.merchantNo && request.merchantNo !== cfg.merchantNo)) { summary.errors.push({ donationId: donation.id, error: "BANK_TERMINAL_CHANGED_REQUIRES_REVIEW" }); continue; }
      const answer = await albarakaInquireSale(donation.providerOrderId, cfg);
      if (answer.state === "approved") {
        const rows = Array.isArray(answer.raw.TransactionData) ? answer.raw.TransactionData as Array<Record<string, unknown>> : [];
        const sale = rows.find(row => String(row.TransactionType ?? "").toLowerCase() === "sale" && row.AuthCode && (!row.OrderId || row.OrderId === donation.providerOrderId));
        if (!sale || (sale.Amount !== undefined && Number(sale.Amount) !== Number(request.amount)) || (sale.Currency && sale.Currency !== request.currencyCode)) {
          summary.errors.push({ donationId: donation.id, error: "BANK_INQUIRY_IDENTITY_REQUIRES_REVIEW" }); continue;
        }
        await settleAlbarakaDonation(donation.id, { ...answer.raw, AuthCode: answer.authCode, ReferenceCode: String(sale.ReferenceCode ?? "") }, { reconciliation: { checkedAt: now.toISOString(), source: "bank-inquiry" } });
        summary.credited.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, paidAt: now.toISOString() }); summary.creditedTotalUSD += donation.amountUSD ?? 0;
      } else if (answer.state === "absent" && ageHours >= staleAfterHours && request.terminalNo === cfg.terminalNo && request.merchantNo === cfg.merchantNo) {
        const failed = await prisma.donation.updateMany({ where: donationWhereAll({ id: donation.id, status: "PAID" }, donationFieldEmpty("paidAt")), data: { status: "FAILED", providerTxnResult: "ConfirmationExpired", providerErrorMessage: "PAYMENT_CONFIRMATION_TIMED_OUT — Bank confirmed no sale after 24 hours" } });
        if (failed.count) summary.markedFailed.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, ageDays: Math.round(ageHours / 24) });
      } else summary.leftAlone++;
      continue;
    }
    // An unsupported provider is not an abandoned Stripe payment. Preserve
    // unverified bank approvals and unknown rails for finance review.
    if (donation.provider !== "STRIPE" && !/^(?:pi_|cs_)/.test(donation.providerOrderId ?? "")) { summary.leftAlone++; continue; }

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
          const newlyPaid = await prisma.$transaction(
            async (tx) => {
              const fresh = await tx.donation.findUnique({ where: { id: donation.id }, select: { paidAt: true } });
              if (!fresh || fresh.paidAt != null) return false; // already credited by the webhook
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
              return true;
            },
            // A 7-item donation is 8 sequential round-trips; Prisma's 5s default expires mid-way
            // and rolls the whole thing back. Atomicity is what makes a retry safe, so give the
            // transaction room rather than splitting it into non-atomic writes.
            { timeout: 30_000, maxWait: 10_000 },
          );
          if (!newlyPaid) { summary.leftAlone++; continue; }
          runAfterResponse(() => dispatchDonationPaid(donation.id));
        } catch (error) {
          summary.errors.push({ donationId: donation.id, error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
          continue;
        }
      }
      summary.credited.push({ donationId: donation.id, amountUSD: donation.amountUSD ?? 0, paidAt: paidAt.toISOString() });
      summary.creditedTotalUSD += donation.amountUSD ?? 0;
      continue;
    }

    // "open" means Stripe would still accept a payment on this reference  but a PaymentIntent
    // sitting at requires_payment_method for weeks is abandoned in practice, and excluding those
    // from ageing left them pending forever. Past the stale window, anything that is not
    // confirmed-paid is treated as abandoned; only genuinely recent rows are given the benefit
    // of the doubt.
    if (verdict === "pending") { summary.leftAlone++; continue; }
    const isStale = ageHours >= staleAfterHours;
    if (verdict === "dead" || isStale) {
      if (!dryRun) {
        const failed = await prisma.donation.updateMany({
          where: donationWhereAll({ id: donation.id, status: "PAID" }, donationFieldEmpty("paidAt")),
          data: {
            status: "FAILED",
            providerTxnResult: "Abandoned",
            providerErrorMessage: `${ABANDONED_MARKER}  لم يكمل المتبرع عملية الدفع لدى ${!donation.provider || donation.provider === "STRIPE" ? "Stripe" : donation.provider}`,
          },
        });
        if (!failed.count) { summary.leftAlone++; continue; }
      }
      summary.markedFailed.push({
        donationId: donation.id,
        amountUSD: donation.amountUSD ?? 0,
        ageDays: Math.round(ageHours / 24),
      });
      continue;
    }

    summary.leftAlone++;
    } catch (error) {
      summary.errors.push({ donationId: donation.id, error: error instanceof Error ? error.message.slice(0, 160) : "PROVIDER_CHECK_FAILED" });
    } finally {
      await prisma.donation.updateMany({ where: { id: donation.id, reconciliationLeaseToken: lease }, data: { reconciliationCheckedAt: now, reconciliationNextAt: new Date(now.getTime() + 1_800_000), reconciliationLeaseToken: null, reconciliationLeaseUntil: null } });
    }
  }

  return summary;
}
