# Recurring ecommerce mode and controlled renewal rehearsal

The December 2025 Albaraka guide, page 17, explicitly distinguishes ecommerce from Mail Order: selecting IsMailOrder changes the transaction class and checks the card's Mail Order permission as well as the merchant's Posnet Mail Order type. The previous scheduler unconditionally sent IsMailOrder=Y for every stored-card renewal. That assumption is removed. Renewals keep IsRecurring=Y and default to IsMailOrder=N. ALBARAKA_RECURRING_MAIL_ORDER=Y remains an explicit setting for a bank-confirmed Mail Order terminal; an invalid value disables the recurring configuration. CVC is never stored, synthesized or reused. Bank acceptance of a stored-card charge without CVC remains a live acceptance check. This change does not establish that code 05 had only this cause.

The recurring snapshot records the transaction mode, terminal, original amount/currency and absence of CVC. The read-only audit reports mode and whether recurring uses the signup terminal. E219 in the monthly inquiry report is labelled NOT_FOUND, separately from the original collection's status/code. Saudi routing, one-time optional 3D and PayFor configuration are unchanged.

## Controlled test after creating a new donation

The rehearsal CLI targets exactly one identified subscription and its identified ADMIN owner. It requires an active Albaraka daily/Friday/monthly plan created within 24 hours, a settled first donation, a linked card, no pending attempt/lock, and a normal billing date later than the test window plus 15 minutes. Ordinary donor accounts cannot be used. No subscription is automatically selected.

Signup eligibility explicitly includes settled non-test donations with a null or missing billingReason. Albaraka checkout does not set this optional field, and Prisma/MongoDB negation alone excludes those records. Test-cycle payments, failed payments and payments without paidAt cannot satisfy this prerequisite. Eligibility errors include only stable reason codes, never the donor, subscription object or card. This correction changes the rehearsal helper only; it does not rewrite first payments, change a production schedule or relax the owner, age, cap and settlement checks.

Preview is read-only. The maximum additional amount is in the plan's own currency and includes all recurring team support/fees. The initial signup donation is separate. Execution requires the same preview run ID, currency, financial cap and cycle count. At most three cycles are allowed, with 60–600 seconds between them. Each cycle uses the existing charge/settlement engine and a distinct stable order ID; each paid cycle must also pass the bank's original-sale inquiry before another starts.

```bash
node --conditions=react-server --import tsx scripts/recurring-rehearsal.ts \
  --subscription=SUBSCRIPTION_ID --donor=ADMIN_OWNER_ID \
  --currency=USD --max-total=3.00 --cycles=3 --interval-seconds=60
```

After checking the preview for a USD 1.00 test plan, use the exact returned run ID with the same arguments and add `--run-id=PREVIEW_RUN_ID --execute --detach`. This is a real payment test, not a simulated approval. STARTED is not proof of collection; the returned private log path records COMPLETED, STOPPED or REVIEW_REQUIRED. Do not execute until the owner has created and identified their intended test plan and its amount/cap.

A durable run lock excludes the ordinary scheduler and repricing throughout the test. Replaying a completed run never collects again. A known failure stops after that cycle, disables ordinary retries and restores the original normal date. Uncertain captures, unverified bank inquiries or crashes retain the lock for review; they never trigger another charge or a test-initiated void/refund. Successful tests preserve the original normal billing date and PAUSE this test subscription after the final cycle, so it cannot collect again unattended. The owner can resume it separately if desired. The test records real donations as subscription_test_cycle, the rehearsal worker suppresses recipient messages/ad conversions, and excludes those accelerated test cycles from ordinary automatic-renewal evidence. Audit records retain the approved cap and verified cycle results without card details or credentials.

Verification uses synthetic database/provider boundaries for preview, three successful real-worker cycles, order identity, bank verification, replay/concurrency, decline stop, unknown outcome, budget/ownership limits, a changed plan, default ecommerce/explicit Mail Order modes, and actual CJS/tsx CLI launch/detachment. No production test charge has been initiated during implementation.
