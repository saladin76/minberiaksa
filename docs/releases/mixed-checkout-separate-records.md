# Separate mixed-basket accounting and recurring Albaraka policy

New recurring baskets (daily, Friday, monthly; all currencies) accept CARD only and resolve to Albaraka. Both browser and server require 2D, including mixed baskets and requests that ask for 3D. One-time-only routing remains unchanged. Historical Stripe/PayPal plans and workers remain supported.

A mixed basket creates two donation records in one transaction: the periodic allocation linked to the new subscription, and the one-time allocation with a null subscriptionId. Campaign, category, gift and waqf lines remain disjoint even when both gifts target the same project. Support and covered fees are allocated without duplicating the initial total. Only periodic support enters the plan.

The periodic record owns one Albaraka bank sale for the combined first checkout amount. A server-written link joins the two accounting records. Initiation validates owner, currency, subscription isolation, totals and unpaid state and refuses direct payment of the child. Both records settle/fail together in a database transaction. Paid bank minor units are allocated with a remainder to preserve the captured total. Replay does not reallocate or increment project counters again. Only the periodic amount is collected on renewal. Each record receives its own payment notification/document processing and guest access credential.

New records freeze the Albaraka route. Stripe hosted checkout now also enforces the frozen gateway before creating a session. No historical donations, plans, gateway credentials or schedules are migrated.

Validation: 126 local synthetic payment/schedule/lifecycle tests plus 19 cart regression tests passed. Connected coverage exercises real order creation, single 2D initiation, settlement of two records, decline propagation, replay, daily/Friday/monthly renewals and concurrent-worker protection. Policy tests cover TRY/USD/EUR/SAR and forced Stripe fallback; legacy workers remain covered. Focused dependency-free helpers pass strict TypeScript checking; changed route/component syntax transpiles without diagnostics.

This environment contains a partial source mirror, so a full Next build and production database checks must run through the release job. These tests do not establish bank acceptance and did not submit a real payment or send donor messages.
