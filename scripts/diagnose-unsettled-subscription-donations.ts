/**
 * Read-only diagnostic: why do some subscription donations stay at
 * status=PAID / paidAt=null even though Stripe delivered
 * invoice.payment_succeeded and got a 2xx back?
 *
 * The webhook handler has two silent early-exits before it writes paidAt:
 *   1. getStripeSubscriptionIdFromInvoice(invoice) returns null
 *   2. no Subscription row matches payforToken === <stripe sub id>
 * Both `break`, which falls through to a 200, so Stripe reports success
 * either way and the miss is invisible from the Stripe dashboard.
 *
 * For every stuck row this prints the facts needed to tell those apart,
 * plus the timing that would indicate a signup race (the invoice event
 * arriving before /api/stripe/subscribe finished writing payforToken).
 *
 * Run: npx tsx scripts/diagnose-unsettled-subscription-donations.ts
 */
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });

function iso(d: Date | null | undefined) {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) : "—";
}

// Mirrors the resolver in app/api/stripe/webhook/route.ts so we can tell
// whether exit #1 would have fired for this invoice.
function resolveSubId(invoice: any): string | null {
  const fromParent = invoice?.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) return fromParent.id;
  const legacy = invoice?.subscription;
  return typeof legacy === "string" ? legacy : null;
}

async function main() {
  // NB: on MongoDB, `paidAt: null` does NOT match documents where the field is
  // unset — which is how these rows actually look. Filtering in JS is the only
  // reliable way to catch both shapes. (The backfill script gets this wrong,
  // which is why it silently finds nothing to do.)
  const all = await prisma.donation.findMany({
    where: { status: "PAID", provider: "STRIPE" },
    select: { id: true, providerOrderId: true, createdAt: true, amount: true, currency: true, subscriptionId: true, paidAt: true },
    orderBy: { createdAt: "asc" },
  });
  const stuck = all.filter((d) => !d.paidAt && d.subscriptionId);

  console.log(`\nstuck rows (PAID, paidAt=null, has subscription): ${stuck.length}\n`);

  const tally = {
    noProviderOrderId: 0,
    invoiceNotFound: 0,
    exit1_subIdUnresolvable: 0,
    exit2_noSubscriptionRow: 0,
    wouldHaveWorked: 0,
    signupRaceSuspected: 0,
  };
  const byReason: Record<string, number> = {};

  for (const d of stuck) {
    const sub = d.subscriptionId
      ? await prisma.subscription.findUnique({
          where: { id: d.subscriptionId },
          select: { id: true, payforToken: true, createdAt: true },
        })
      : null;

    if (!d.providerOrderId) { tally.noProviderOrderId += 1; continue; }

    let invoice: any = null;
    try {
      invoice = await stripe.invoices.retrieve(d.providerOrderId);
    } catch {
      tally.invoiceNotFound += 1;
      continue;
    }

    const reason = (invoice.billing_reason as string) ?? "unknown";
    byReason[reason] = (byReason[reason] ?? 0) + 1;

    const resolved = resolveSubId(invoice);
    const invoiceAt = new Date((invoice.created ?? 0) * 1000);

    let verdict: string;
    if (!resolved) {
      tally.exit1_subIdUnresolvable += 1;
      verdict = "EXIT-1 sub id unresolvable";
    } else if (!sub?.payforToken) {
      tally.exit2_noSubscriptionRow += 1;
      verdict = "EXIT-2 no payforToken on sub";
    } else if (sub.payforToken !== resolved) {
      tally.exit2_noSubscriptionRow += 1;
      verdict = `EXIT-2 token mismatch (${sub.payforToken} != ${resolved})`;
    } else if (sub.createdAt > invoiceAt) {
      // The Subscription row did not exist when Stripe fired the event, so the
      // handler's findFirst({ payforToken }) could not have matched it.
      tally.signupRaceSuspected += 1;
      verdict = "RACE sub row created after invoice event";
    } else {
      tally.wouldHaveWorked += 1;
      verdict = "would resolve NOW (event predates current state)";
    }

    console.log(
      `${iso(d.createdAt)}  ${String(d.amount).padStart(7)} ${d.currency}  ${reason.padEnd(20)} ` +
      `inv=${iso(invoiceAt)}  sub.created=${iso(sub?.createdAt)}  ${verdict}`
    );
  }

  console.log("\n=== TALLY ===");
  console.log(JSON.stringify(tally, null, 2));
  console.log("\n=== billing_reason distribution ===");
  console.log(JSON.stringify(byReason, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
